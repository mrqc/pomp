import {InternalLogger} from "./LogConfig.js";
import {nodewhisper} from "nodejs-whisper";
import type {Logger} from "nodejs-whisper/dist/types";
import fs from "fs-extra";
import path from "node:path";
import {fileURLToPath} from "url";
import type {AgentsController} from "./AgentsController.ts";
import type {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {AudioRecording} from "./AudioRecording.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Phrase {
    text: string;
    timestamp: number;
}

export class SpeechToText {

    private static readonly TRANSLATION_DIR = path.resolve(__dirname, 'translations');
    private static secondsToLooseText = 1000 * 10;
    private static activationKeywords = "buddy";
    private logger = new InternalLogger(__filename);
    private phrases: Phrase[] = [];
    private agentsController: AgentsController;
    private isActivatedByKeyword: boolean = false;
    private clientServerSynchronization: ClientServerSynchronization;
    
    constructor(agentsController: AgentsController,
                clientServerSynchronization: ClientServerSynchronization) {
        SpeechToText.cleanup();
        this.agentsController = agentsController;
        this.clientServerSynchronization = clientServerSynchronization;
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
        return this.getCurrentStreamText()
            .toLowerCase()
            .includes(SpeechToText.activationKeywords);
    }
    
    public getCurrentStreamText(): string {
        return this.phrases.map(aPhrase => aPhrase.text)
            .join(' ');
    }
    
    private async transformSpeechToIntermediaryOutput(outputFileName: string) {
        try {
            let x = await nodewhisper(outputFileName, {
                modelName: 'small.en',
                autoDownloadModelName: 'small.en',
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
                    translateToEnglish: false,
                    wordTimestamps: false,
                    timestamps_length: 10,
                    splitOnWord: false,
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
