import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {InternalLogger} from "./LogConfig.js";
import path from "node:path";
import fs from "fs-extra";
import {fileURLToPath} from "url";
import {Controller} from "./Controller.ts";
import type {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import type {DatabaseConnector} from "./DatabaseConnector.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TextToSpeech extends Controller {

    private static readonly AUDIO_DIR = path.resolve(__dirname, 'audio-outputs');
    private static textSpeed = 1.4;
    private static modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
    private textToSpeechModel: KokoroTTS | null = null;
    private logger = new InternalLogger(__filename);
    private splitter = new TextSplitterStream();

    constructor(clientServerSynchronization: ClientServerSynchronization, databaseConnector: DatabaseConnector) {
        super(clientServerSynchronization, databaseConnector, "TextToSpeech");
        TextToSpeech.cleanup();
    }

    async init() {
        fs.ensureDirSync(TextToSpeech.AUDIO_DIR);
        this.textToSpeechModel = await KokoroTTS.from_pretrained(TextToSpeech.modelId, {
            dtype: "fp32",
        });
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
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        TextToSpeech.textSpeed = await this.getControllerRecordFloatConfiguration("textSpeed");
        TextToSpeech.modelId = await this.getControllerRecordStringConfiguration("modelId");
        this.subscribeControllerRecord("textSpeed", (value: any) => {
            TextToSpeech.textSpeed = parseFloat(value);
            this.setControllerRecordConfiguration("textSpeed", value);
        });
        this.subscribeControllerRecord("modelId", (value: any) => {
            TextToSpeech.modelId = value;
            this.setControllerRecordConfiguration("modelId", value);
        });
    }

    private removeNotSayableChars(textToSay: string) {
        return textToSay.replace(/[*#_~`|<>\/]/g, ' ');
    }

    async say(text: string) {
        text = this.removeNotSayableChars(text)
        this.logger.info("Text to say: " + text)
        this.splitter?.push(text);
        this.splitter.flush();
    }
    
    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(TextToSpeech.AUDIO_DIR);
        }
    }
}
