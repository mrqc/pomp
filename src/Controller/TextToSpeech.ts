import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {InternalLogger} from "../LogConfig.js";
import path from "node:path";
import fs from "fs-extra";
import {fileURLToPath} from "url";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TextToSpeech {
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private static readonly AUDIO_DIR = path.resolve(__dirname, 'audio-outputs');
    private static textSpeed = 1.4;
    private static modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
    private textToSpeechModel: KokoroTTS | null = null;
    private logger = new InternalLogger(__filename);
    private splitter = new TextSplitterStream();

    constructor() {
        TextToSpeech.cleanup();
    }

    async init() {
        fs.ensureDirSync(TextToSpeech.AUDIO_DIR);
        this.textToSpeechModel = await KokoroTTS.from_pretrained(TextToSpeech.modelId, {
            dtype: "fp32",
        });
        if ( !InternalLogger.isDebug()) {
            const stream = this.textToSpeechModel!.stream(
                this.splitter,
                { 
                    speed: TextToSpeech.textSpeed, 
                    split_pattern: new RegExp('\t') 
                });
            (async () => {
                for await (const {text, phonemes, audio} of stream) {
                    this.logger.info(JSON.stringify({text, phonemes}));
                    let fileName = path.resolve(TextToSpeech.AUDIO_DIR, 'output-' + Date.now() + '.wav');
                    audio.save(fileName);
                }
            })();
        }
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        TextToSpeech.textSpeed = await this.databaseConnector.getFloatConfig("textSpeed");
        TextToSpeech.modelId = await this.databaseConnector.getStringConfig("modelId");
        this.clientServerSynchronization.loadRecordValue("TextToSpeech", "textSpeed", TextToSpeech.textSpeed);
        this.clientServerSynchronization.loadRecordValue("TextToSpeech", "modelId", TextToSpeech.modelId);
        this.clientServerSynchronization.subscribeOnRecordVariable("TextToSpeech", "textSpeed", async (value: any) => {
            await this.databaseConnector.setConfig("textSpeed", value);
            TextToSpeech.textSpeed = await this.databaseConnector.getFloatConfig("textSpeed");
            this.clientServerSynchronization.sendGuiInfo("Text speed changed to " + TextToSpeech.textSpeed)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("TextToSpeech", "modelId", async (value: any) => {
            await this.databaseConnector.setConfig("modelId", value);
            TextToSpeech.modelId = await this.databaseConnector.getStringConfig("modelId");
            this.clientServerSynchronization.sendGuiInfo("Model id changed to " + TextToSpeech.modelId)
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
        if (fs.existsSync(TextToSpeech.AUDIO_DIR)) {
            const files = fs.readdirSync(TextToSpeech.AUDIO_DIR);
            this.logger.info("files: " + JSON.stringify(files))
            return files.some(file => file.endsWith('.wav'));
        }
        return false;
    }

    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(TextToSpeech.AUDIO_DIR);
        }
    }
}
