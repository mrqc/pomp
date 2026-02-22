import {InternalLogger} from "./LogConfig.js";
import {nodewhisper} from "nodejs-whisper";
import type {Logger} from "nodejs-whisper/dist/types";
import fs from "fs-extra";
import path from "node:path";
import {fileURLToPath} from "url";
import type {AgentsController} from "./AgentsController.ts";
import type {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {AudioRecording} from "./AudioRecording.ts";
import {Controller} from "./Controller.ts";
import type {DatabaseConnector} from "./DatabaseConnector.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Phrase {
    text: string;
    timestamp: number;
}

export class SpeechToText extends Controller {

    private static readonly TRANSLATION_DIR = path.resolve(__dirname, 'translations');
    private static secondsToLooseText = 1000 * 10;
    private static modelName = 'small.en';
    private static activationKeywords = ["buddy"];
    private static translateToEnglish: boolean = false;
    private static splitOnWord: boolean = false;
    private logger = new InternalLogger(__filename);
    private phrases: Phrase[] = [];
    private agentsController: AgentsController;
    private isActivatedByKeyword: boolean = false;
    
    constructor(agentsController: AgentsController,
                clientServerSynchronization: ClientServerSynchronization,
                databaseConnector: DatabaseConnector) {
        super(clientServerSynchronization, databaseConnector, "SpeechToText");
        SpeechToText.cleanup();
        this.agentsController = agentsController;
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        SpeechToText.secondsToLooseText = await this.getControllerRecordConfiguration("secondsToLooseText");
        SpeechToText.activationKeywords = await this.getControllerRecordConfiguration("activationKeywords");
        SpeechToText.modelName = await this.getControllerRecordConfiguration("modelName");
        SpeechToText.translateToEnglish = await this.getControllerRecordConfiguration("translateToEnglish");
        SpeechToText.splitOnWord = await this.getControllerRecordConfiguration("splitOnWord");
        this.subscribeControllerRecord("secondsToLooseText", async (value: any) => {
            SpeechToText.secondsToLooseText = value * 1000;
            await this.setControllerRecordConfiguration("secondsToLooseText", value);
        });
        this.subscribeControllerRecord("activationKeywords", async (value: any) => {
            SpeechToText.activationKeywords = value.split(",").map((aKeyword: string) => aKeyword.trim());
            await this.setControllerRecordConfiguration("activationKeywords", value);
        });
        this.subscribeControllerRecord("modelName", async (value: any) => {
            SpeechToText.modelName = value;
            await this.setControllerRecordConfiguration("modelName", value);
        });
        this.subscribeControllerRecord("translateToEnglish", async (value: any) => {
            SpeechToText.modelName = value;
            await this.setControllerRecordConfiguration("translateToEnglish", value);
        });
        this.subscribeControllerRecord("splitOnWord", async (value: any) => {
            SpeechToText.modelName = value;
            await this.setControllerRecordConfiguration("splitOnWord", value);
        });
    }

    async writeAudioFileToTextStream(outputFileName: string) {
        fs.ensureDirSync(SpeechToText.TRANSLATION_DIR);
        await this.transformSpeechToIntermediaryOutput(outputFileName)
        await this.transformIntermediaryOutputToTextFile(outputFileName)
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
        AudioRecording.recordDuration = AudioRecording.stopWaitingRecordDuration;
    }
    
    private setInactive() {
        this.isActivatedByKeyword = false;
        AudioRecording.recordDuration = AudioRecording.defaultRecordingDuration;
    }
    
    private isActive(): boolean {
        return this.isActivatedByKeyword;
    }
    
    private async transformIntermediaryOutputToTextFile(outputFileName: string) {
        try {
            let text = await this.putTextIntoPhrases(outputFileName);
            this.clientServerSynchronization.setValue("SpeechContext", "text", this.getCurrentStreamText());
            if (text.length == 0 && this.isActive()) {
                this.setInactive()
                let currentContextWindow = this.getCurrentStreamText();
                this.phrases = [];
                this.logger.info("Last chunk was silence and hence closing input collection")
                await this.agentsController.startSessionByActivationWordSession(currentContextWindow);
            } else if (this.currentStreamTextContainsActivationKeyword()) {
                this.setActive();
                this.logger.info("Activation via keyword in context window")
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
        await fs.remove(jsonFile);
        await fs.remove(outputFileName);
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
            if (this.phrases[phraseIndex]!.timestamp < now - SpeechToText.secondsToLooseText) {
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
                removeWavFileAfterTranscription: true,
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
        fs.removeSync(SpeechToText.TRANSLATION_DIR);
    }
}
