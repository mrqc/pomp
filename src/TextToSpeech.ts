import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {InternalLogger} from "./LogConfig.js";
import path from "node:path";
import fs from "fs-extra";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TextToSpeech {

    private static readonly AUDIO_DIR = path.resolve(__dirname, 'audio-outputs');
    private textToSpeechModel: KokoroTTS | null = null;
    private modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
    private logger = new InternalLogger(__filename);
    private splitter = new TextSplitterStream();

    constructor() {
        TextToSpeech.cleanup();
    }

    async init() {
        fs.ensureDirSync(TextToSpeech.AUDIO_DIR);
        this.textToSpeechModel = await KokoroTTS.from_pretrained(this.modelId, {
            dtype: "fp32",
        });
        const stream = this.textToSpeechModel!.stream(
            this.splitter,
            { 
                speed: 1.4, 
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
        fs.removeSync(TextToSpeech.AUDIO_DIR);
    }
}
