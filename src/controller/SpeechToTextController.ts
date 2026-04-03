import {InternalLogger} from "../LogConfig.js";
import {nodewhisper} from "nodejs-whisper";
import type {Logger} from "nodejs-whisper/dist/types";
import fs from "fs-extra";
import path from "node:path";
import {fileURLToPath} from "url";
import {type AgentsController, AgentSessionMessageType} from "./AgentsController.ts";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Phrase {
    text: string;
    timestamp: number;
}

export class SpeechToTextController {
    private readonly databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private readonly clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private static readonly TRANSLATION_DIR = path.resolve(__dirname, 'translations');
    private static secondsToLooseText = 10;
    private static modelName = 'tiny.en';
    private static activationKeywords = ["buddy"];
    private static translateToEnglish: boolean = false;
    private static splitOnWord: boolean = false;
    private readonly logger = new InternalLogger(__filename);
    public phrases: Phrase[] = [];
    private readonly agentsController: AgentsController;
    private isActivatedByKeyword: boolean = false;
    private currentSessionId: string | null = null;
    
    constructor(agentsController: AgentsController) {
        SpeechToTextController.cleanup();
        this.agentsController = agentsController;
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        SpeechToTextController.secondsToLooseText = await this.databaseConnector.getIntegerConfig("SpeechToText", "secondsToLooseText");
        SpeechToTextController.activationKeywords = await this.databaseConnector.getStringArrayConfig("SpeechToText", "activationKeywords")
        SpeechToTextController.modelName = await this.databaseConnector.getStringConfig("SpeechToText", "modelName");
        SpeechToTextController.translateToEnglish = await this.databaseConnector.getBooleanConfig("SpeechToText", "translateToEnglish");
        SpeechToTextController.splitOnWord = await this.databaseConnector.getBooleanConfig("SpeechToText", "splitOnWord");
        await this.clientServerSynchronization.setRecord("SpeechToText", "secondsToLooseText", SpeechToTextController.secondsToLooseText);
        await this.clientServerSynchronization.setRecord("SpeechToText", "activationKeywords", SpeechToTextController.activationKeywords.join(", "));
        await this.clientServerSynchronization.setRecord("SpeechToText", "modelName", SpeechToTextController.modelName);
        await this.clientServerSynchronization.setRecord("SpeechToText", "translateToEnglish", SpeechToTextController.translateToEnglish);
        await this.clientServerSynchronization.setRecord("SpeechToText", "splitOnWord", SpeechToTextController.splitOnWord);
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "secondsToLooseText", async (value: any) => {
            await this.databaseConnector.setConfig("SpeechToText", "secondsToLooseText", value);
            SpeechToTextController.secondsToLooseText = await this.databaseConnector.getIntegerConfig("SpeechToText", "secondsToLooseText");
            this.clientServerSynchronization.sendGuiInfo("Seconds to loose text changed to " + SpeechToTextController.secondsToLooseText)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "activationKeywords", async (value: any) => {
            await this.databaseConnector.setConfig("SpeechToText", "activationKeywords", value);
            SpeechToTextController.activationKeywords = await this.databaseConnector.getStringArrayConfig("SpeechToText", "activationKeywords");
            this.clientServerSynchronization.sendGuiInfo("Activation keywords changed to " + SpeechToTextController.activationKeywords)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "modelName", async (value: any) => {
            await this.databaseConnector.setConfig("SpeechToText", "modelName", value);
            SpeechToTextController.modelName = await this.databaseConnector.getStringConfig("SpeechToText", "modelName");
            this.clientServerSynchronization.sendGuiInfo("Model name changed to " + SpeechToTextController.modelName)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "translateToEnglish", async (value: any) => {
            await this.databaseConnector.setConfig("SpeechToText", "translateToEnglish", value);
            SpeechToTextController.translateToEnglish = await this.databaseConnector.getBooleanConfig("SpeechToText", "translateToEnglish");
            this.clientServerSynchronization.sendGuiInfo("Translate to English changed to " + SpeechToTextController.translateToEnglish)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("SpeechToText", "splitOnWord", async (value: any) => {
            await this.databaseConnector.setConfig("SpeechToText", "splitOnWord", value);
            SpeechToTextController.splitOnWord = await this.databaseConnector.getBooleanConfig("SpeechToText", "splitOnWord");
            this.clientServerSynchronization.sendGuiInfo("Split on word changed to " + SpeechToTextController.splitOnWord)
        });
        this.clientServerSynchronization.subscribeOnEvent("change-current-session", async(data: any) => {
            this.currentSessionId = data.sessionId
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
        return text.replaceAll(squaredBracketsRegex, "")
            .replaceAll(roundBracketsRegex, "")
            .trim();
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
            await this.clientServerSynchronization.setRecord("SpeechContext", "text", this.getCurrentStreamText());
            this.logger.info("transformation process length: " + text.length + " isActive " + this.isActive())
            if (this.currentStreamTextContainsActivationKeyword()) {
                this.setActive();
                this.logger.info("Activation via keyword in context window")
                let currentContextWindow = this.getCurrentStreamText();
                this.phrases = []
                await this.agentsController.prompt(currentContextWindow, AgentSessionMessageType.USER_TEXT_INPUT, this.currentSessionId);
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
        text ??= "";
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
                    private readonly logger = new InternalLogger(__filename)

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
