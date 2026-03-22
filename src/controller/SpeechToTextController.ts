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

export class SpeechToTextController {
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
        SpeechToTextController.cleanup();
        this.agentsController = agentsController;
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        SpeechToTextController.secondsToLooseText = await this.databaseConnector.getIntegerConfig("AudioRecording", "secondsToLooseText");
        SpeechToTextController.activationKeywords = (await this.databaseConnector.getStringArrayConfig("AudioRecording", "activationKeywords"))
        SpeechToTextController.modelName = await this.databaseConnector.getStringConfig("AudioRecording", "modelName");
        SpeechToTextController.translateToEnglish = await this.databaseConnector.getBooleanConfig("AudioRecording", "translateToEnglish");
        SpeechToTextController.splitOnWord = await this.databaseConnector.getBooleanConfig("AudioRecording", "splitOnWord");
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "secondsToLooseText", SpeechToTextController.secondsToLooseText);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "activationKeywords", SpeechToTextController.activationKeywords.join(", "));
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "modelName", SpeechToTextController.modelName);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "translateToEnglish", SpeechToTextController.translateToEnglish);
        this.clientServerSynchronization.loadRecordValue("SpeechToText", "splitOnWord", SpeechToTextController.splitOnWord);
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "secondsToLooseText", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "secondsToLooseText", value);
            SpeechToTextController.secondsToLooseText = await this.databaseConnector.getIntegerConfig("AudioRecording", "secondsToLooseText");
            this.clientServerSynchronization.sendGuiInfo("Seconds to loose text changed to " + SpeechToTextController.secondsToLooseText)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "activationKeywords", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "activationKeywords", value);
            SpeechToTextController.activationKeywords = await this.databaseConnector.getStringArrayConfig("AudioRecording", "activationKeywords");
            this.clientServerSynchronization.sendGuiInfo("Activation keywords changed to " + SpeechToTextController.activationKeywords)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "modelName", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "modelName", value);
            SpeechToTextController.modelName = await this.databaseConnector.getStringConfig("AudioRecording", "modelName");
            this.clientServerSynchronization.sendGuiInfo("Model name changed to " + SpeechToTextController.modelName)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "translateToEnglish", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "translateToEnglish", value);
            SpeechToTextController.translateToEnglish = await this.databaseConnector.getBooleanConfig("AudioRecording", "translateToEnglish");
            this.clientServerSynchronization.sendGuiInfo("Translate to English changed to " + SpeechToTextController.translateToEnglish)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "splitOnWord", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "splitOnWord", value);
            SpeechToTextController.splitOnWord = await this.databaseConnector.getBooleanConfig("AudioRecording", "splitOnWord");
            this.clientServerSynchronization.sendGuiInfo("Split on word changed to " + SpeechToTextController.splitOnWord)
        });
    }

    async writeAudioFileToTextStream(outputFileName: string) {
        fs.ensureDirSync(SpeechToTextController.TRANSLATION_DIR);
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
            if (this.phrases[phraseIndex]!.timestamp < now - SpeechToTextController.secondsToLooseText * 1000) {
                this.phrases.splice(phraseIndex, 1);
                phraseIndex--;
            }
        }
    }
    
    public currentStreamTextContainsActivationKeyword(): boolean {
        const streamText = this.getCurrentStreamText().toLowerCase();
        return SpeechToTextController.activationKeywords.some(keyword => streamText.includes(keyword.toLowerCase()));
    }
    
    public getCurrentStreamText(): string {
        return this.phrases.map(aPhrase => aPhrase.text)
            .join(' ');
    }
    
    private async transformSpeechToIntermediaryOutput(outputFileName: string) {
        try {
            await nodewhisper(outputFileName, {
                modelName: SpeechToTextController.modelName,
                autoDownloadModelName: SpeechToTextController.modelName,
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
                    translateToEnglish: SpeechToTextController.translateToEnglish,
                    wordTimestamps: false,
                    timestamps_length: 10,
                    splitOnWord: SpeechToTextController.splitOnWord,
                },
            });
        } catch (error) {
            this.setInactive()
            this.logger.error("Error" + error);
        }
    }
    
    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(SpeechToTextController.TRANSLATION_DIR);
        }
    }
}
