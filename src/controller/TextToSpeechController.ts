import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {InternalLogger} from "../LogConfig.js";
import path from "node:path";
import fs from "fs-extra";
import {fileURLToPath} from "url";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TextToSpeechController {
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private static readonly AUDIO_DIR = path.resolve(__dirname, 'audio-outputs');
    private static textSpeed = 1.4;
    private static modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
    private textToSpeechModel: KokoroTTS | null = null;
    private logger = new InternalLogger(__filename);
    private splitter = new TextSplitterStream();

    constructor() {
        TextToSpeechController.cleanup();
    }

    async init() {
        fs.ensureDirSync(TextToSpeechController.AUDIO_DIR);
        this.textToSpeechModel = await KokoroTTS.from_pretrained(TextToSpeechController.modelId, {
            dtype: "fp32",
        });
        if ( !InternalLogger.isDebug()) {
            const stream = this.textToSpeechModel!.stream(
                this.splitter,
                { 
                    speed: TextToSpeechController.textSpeed, 
                    split_pattern: new RegExp('\t') 
                });
            (async () => {
                for await (const {text, phonemes, audio} of stream) {
                    this.logger.info(JSON.stringify({text, phonemes}));
                    let fileName = path.resolve(TextToSpeechController.AUDIO_DIR, 'output-' + Date.now() + '.wav');
                    audio.save(fileName);
                }
            })();
        }
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        TextToSpeechController.textSpeed = await this.databaseConnector.getFloatConfig("TextToSpeech", "textSpeed");
        TextToSpeechController.modelId = await this.databaseConnector.getStringConfig("TextToSpeech", "modelId");
        await this.clientServerSynchronization.setRecord("TextToSpeech", "textSpeed", TextToSpeechController.textSpeed);
        await this.clientServerSynchronization.setRecord("TextToSpeech", "modelId", TextToSpeechController.modelId);
        this.clientServerSynchronization.subscribeOnRecordVariable("TextToSpeech", "textSpeed", async (value: any) => {
            await this.databaseConnector.setConfig("TextToSpeech", "textSpeed", value);
            TextToSpeechController.textSpeed = await this.databaseConnector.getFloatConfig("TextToSpeech", "textSpeed");
            this.clientServerSynchronization.sendGuiInfo("Text speed changed to " + TextToSpeechController.textSpeed)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("TextToSpeech", "modelId", async (value: any) => {
            await this.databaseConnector.setConfig("TextToSpeech", "modelId", value);
            TextToSpeechController.modelId = await this.databaseConnector.getStringConfig("TextToSpeech", "modelId");
            this.clientServerSynchronization.sendGuiInfo("Model id changed to " + TextToSpeechController.modelId)
        });
    }

    private removeNotSayableChars(textToSay: string) {
        return textToSay.replace(/[*#_~`|<>\/]/g, ' ');
    }

    say(text: string) {
        text = this.removeNotSayableChars(text)
        this.logger.info("Text to say: " + text)
        this.splitter?.push(text);
        this.splitter.flush();
    }
    
    wantsToSaySomething(): boolean {
        if (fs.existsSync(TextToSpeechController.AUDIO_DIR)) {
            const files = fs.readdirSync(TextToSpeechController.AUDIO_DIR);
            this.logger.info("files: " + JSON.stringify(files))
            return files.some(file => file.endsWith('.wav'));
        }
        return false;
    }

    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(TextToSpeechController.AUDIO_DIR);
        }
    }
}
