import {InternalLogger} from "../LogConfig.js";
import {nodewhisper} from "nodejs-whisper";
import type {Logger} from "nodejs-whisper/dist/types";
import fs from "fs-extra";
import path from "node:path";
import {fileURLToPath} from "url";
import type {AgentsController} from "./AgentsController.ts";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Phrase {
    text: string;
    timestamp: number;
}

export class SpeechToText {
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private static readonly TRANSLATION_DIR = path.resolve(__dirname, 'translations');
    private static secondsToLooseText = 10;
    private static modelName = 'tiny.en';
    private static activationKeywords = ["buddy"];
    private static translateToEnglish: boolean = false;
    private static splitOnWord: boolean = false;
    private logger = new InternalLogger(__filename);
    public phrases: Phrase[] = [];
    private agentsController: AgentsController;
    private isActivatedByKeyword: boolean = false;
    
    constructor(agentsController: AgentsController) {
        super();
        SpeechToText.cleanup();
        this.agentsController = agentsController;
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        SpeechToText.secondsToLooseText = await this.databaseConnector.getIntegerConfig("secondsToLooseText");
        SpeechToText.activationKeywords = (await this.databaseConnector.getStringArrayConfig("activationKeywords"))
        SpeechToText.modelName = await this.databaseConnector.getStringConfig("modelName");
        SpeechToText.translateToEnglish = await this.databaseConnector.getBooleanConfig("translateToEnglish");
        SpeechToText.splitOnWord = await this.databaseConnector.getBooleanConfig("splitOnWord");
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "secondsToLooseText", SpeechToText.secondsToLooseText);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "activationKeywords", SpeechToText.activationKeywords.join(", "));
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "modelName", SpeechToText.modelName);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "translateToEnglish", SpeechToText.translateToEnglish);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "splitOnWord", SpeechToText.splitOnWord);
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "secondsToLooseText", async (value: any) => {
            await this.databaseConnector.setConfig("secondsToLooseText", value);
            SpeechToText.secondsToLooseText = await this.databaseConnector.getIntegerConfig("secondsToLooseText");
            this.clientServerSynchronization.sendGuiInfo("Seconds to loose text changed to " + SpeechToText.secondsToLooseText)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "activationKeywords", async (value: any) => {
            await this.databaseConnector.setConfig("activationKeywords", value);
            SpeechToText.activationKeywords = await this.databaseConnector.getStringArrayConfig("activationKeywords");
            this.clientServerSynchronization.sendGuiInfo("Activation keywords changed to " + SpeechToText.activationKeywords)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "modelName", async (value: any) => {
            await this.databaseConnector.setConfig("modelName", value);
            SpeechToText.modelName = await this.databaseConnector.getStringConfig("modelName");
            this.clientServerSynchronization.sendGuiInfo("Model name changed to " + SpeechToText.modelName)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "translateToEnglish", async (value: any) => {
            await this.databaseConnector.setConfig("translateToEnglish", value);
            SpeechToText.translateToEnglish = await this.databaseConnector.getBooleanConfig("translateToEnglish");
            this.clientServerSynchronization.sendGuiInfo("Translate to English changed to " + SpeechToText.translateToEnglish)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "splitOnWord", async (value: any) => {
            await this.databaseConnector.setConfig("splitOnWord", value);
            SpeechToText.splitOnWord = await this.databaseConnector.getBooleanConfig("splitOnWord");
            this.clientServerSynchronization.sendGuiInfo("Split on word changed to " + SpeechToText.splitOnWord)
        });
    }

    async writeAudioFileToTextStream(outputFileName: string) {
        fs.ensureDirSync(SpeechToText.TRANSLATION_DIR);
        await this.transformSpeechToIntermediaryOutput(outputFileName)
        await this.transformIntermediaryOutputToPhrases(outputFileName)
    }
    
    private cleanupTranscribedString(text: string): string {
        const squaredBracketsRegex: RegExp = /\[[^\]]+\]/g;
        const roundBracketsRegex: RegExp = /\([^\)]+\)/g;
        const clearedString: string = text.replace(squaredBracketsRegex, "")
            .replace(roundBracketsRegex, "")
            .trim();
        return clearedString;
    }
    
    private setActive() {
        this.isActivatedByKeyword = true;
    }
    
    private setInactive() {
        this.isActivatedByKeyword = false;
    }
    
    private isActive(): boolean {
        return this.isActivatedByKeyword;
    }
    
    private async transformIntermediaryOutputToPhrases(outputFileName: string) {
        try {
            let text = await this.putTextIntoPhrases(outputFileName);
            this.clientServerSynchronization.loadRecordValue("SpeechContext", "text", this.getCurrentStreamText());
            this.logger.info("transformation process length: " + text.length + " active " + this.isActive())
            if (this.currentStreamTextContainsActivationKeyword()) {
                this.setActive();
                this.logger.info("Activation via keyword in context window")
                let currentContextWindow = this.getCurrentStreamText();
                this.phrases = []
                await this.agentsController.startSessionByActivationWord(currentContextWindow);
            } else if ( !this.isActive()) {
                this.logger.info("Cleaning up context window")
                this.removeOutdatedPhrasesFromContextWindow();
            }
        } catch (error) {
            this.logger.error('Error reading JSON file: ' + error);
        }
    }

    private async putTextIntoPhrases(outputFileName: string) {
        let jsonFile = outputFileName + '.json';
        const data = await fs.readJson(jsonFile);
        if ( !InternalLogger.isDebug()) {
            await fs.remove(jsonFile);
            await fs.remove(outputFileName);
        }
        let text = data.transcription.map((item: any) => item.text)
            .join(' ');
        text = this.cleanupTranscribedString(text);
        if (text == null) {
            text = "";
        }
        if (text.length > 0) {
            this.phrases.push({
                text: text,
                timestamp: Date.now()
            })
        }
        this.logger.info("Text Buffer: " + this.getCurrentStreamText())
        return text;
    }

    private removeOutdatedPhrasesFromContextWindow() {
        let now = Date.now();
        for (let phraseIndex = 0; phraseIndex < this.phrases.length; phraseIndex++) {
            if (this.phrases[phraseIndex]!.timestamp < now - SpeechToText.secondsToLooseText * 1000) {
                this.phrases.splice(phraseIndex, 1);
                phraseIndex--;
            }
        }
    }
    
    public currentStreamTextContainsActivationKeyword(): boolean {
        const streamText = this.getCurrentStreamText().toLowerCase();
        return SpeechToText.activationKeywords.some(keyword => streamText.includes(keyword.toLowerCase()));
    }
    
    public getCurrentStreamText(): string {
        return this.phrases.map(aPhrase => aPhrase.text)
            .join(' ');
    }
    
    private async transformSpeechToIntermediaryOutput(outputFileName: string) {
        try {
            await nodewhisper(outputFileName, {
                modelName: SpeechToText.modelName,
                autoDownloadModelName: SpeechToText.modelName,
                removeWavFileAfterTranscription: !InternalLogger.isDebug(),
                withCuda: true,
                logger: new class implements Logger {
                    private logger = new InternalLogger(__filename)

                    debug(args: any): void {
                        this.logger.debug(JSON.stringify(args))
                    }

                    error(args: any): void {
                        this.logger.error(JSON.stringify(args))
                    }

                    log(args: any): void {
                        this.logger.info(JSON.stringify(args))
                    }
                },
                whisperOptions: {
                    outputInCsv: false,
                    outputInJson: true,
                    outputInJsonFull: false,
                    outputInLrc: false,
                    outputInSrt: false,
                    outputInText: false,
                    outputInVtt: false,
                    outputInWords: false,
                    translateToEnglish: SpeechToText.translateToEnglish,
                    wordTimestamps: false,
                    timestamps_length: 10,
                    splitOnWord: SpeechToText.splitOnWord,
                },
            });
        } catch (error) {
            this.setInactive()
            this.logger.error("Error" + error);
        }
    }
    
    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(SpeechToText.TRANSLATION_DIR);
        }
    }
}
