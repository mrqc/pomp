import {Worker} from "worker_threads";
import path from "node:path";
import * as portAudio from "naudiodon-no-segfault";
import * as wav from "wav";
import {FileWriter} from "wav";
import type {IoStreamRead} from "naudiodon-no-segfault";
import fs from "fs-extra";
import {fileURLToPath} from "url";
import {SpeechToText} from "./SpeechToText.ts";
import {Mutex} from "es-toolkit";
import {InternalLogger} from "./LogConfig.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioRecording {

    private static readonly RECORDINGS_DIR = path.resolve(__dirname, 'recordings');
    private static sampleRate = 16000;
    public static defaultRecordingDuration = 2000;
    public static stopWaitingRecordDuration = 600;
    public static recordDuration = AudioRecording.defaultRecordingDuration;
    private logger = new InternalLogger(__filename);
    private speechToText: SpeechToText;
    private audioMutex: Mutex;

    constructor(audioMutex: Mutex, speechToText: SpeechToText) {
        AudioRecording.cleanup();
        this.workerOnMessage = this.workerOnMessage.bind(this);
        this.workerError = this.workerError.bind(this);
        this.workerExit = this.workerExit.bind(this);
        this.startRecording = this.startRecording.bind(this);
        this.audioMutex = audioMutex;
        this.speechToText = speechToText;
        fs.ensureDirSync(AudioRecording.RECORDINGS_DIR);
        this.initWorker();
    }
    
    private initWorker() {
        const audioRecordingsWorker = new Worker(path.resolve(__dirname, 'AudioRecordingWorker.ts'));
        audioRecordingsWorker.postMessage("Start");
        audioRecordingsWorker.on('message', this.workerOnMessage);
        audioRecordingsWorker.on('error', this.workerError);
        audioRecordingsWorker.on('exit', this.workerExit);
    }
    
    private async workerError(error: any) {
        this.logger.error('Worker error: ' + error);
        await this.audioMutex.release();
    }

    private async workerExit(code: any) {
        this.logger.info('Worker exited with code ' + code);
        await this.audioMutex.release();
    }
    
    async startRecording() {
        this.logger.info("Acquire lock")
        await this.audioMutex.acquire();
        try {
            let outputFileName = path.resolve(AudioRecording.RECORDINGS_DIR, 'output' + Date.now() + '.wav');
            let audioIo = portAudio.AudioIO({
                inOptions: {
                    channelCount: 1,
                    sampleFormat: portAudio.SampleFormat16Bit,
                    sampleRate: AudioRecording.sampleRate,
                    deviceId: -1,
                    closeOnError: true
                }
            });
            let wavFileWriter = new wav.FileWriter(outputFileName, {
                channels: 1,
                sampleRate: AudioRecording.sampleRate,
                bitDepth: 16
            });
            audioIo.pipe(wavFileWriter);
            audioIo.start();
            setTimeout(() => {
                this.audioMutex.release();
                this.stopRecording(outputFileName, wavFileWriter, audioIo)
            }, AudioRecording.recordDuration);
        } catch (error) {
            this.audioMutex.release();
        }
    }
    
    private async stopRecording(outputFileName: string, wavFileWriter: FileWriter, ai: IoStreamRead) {
        ai.quit();
        const closureOutputFileName = outputFileName;
        wavFileWriter.on('finish', async () => {
            this.speechToText.writeAudioFileToTextStream(closureOutputFileName);
        });
        wavFileWriter.end();
        await this.startRecording();
    }

    private workerOnMessage(message: any) {
        this.logger.info("Thread for audio recording running")
    }
    
    public static cleanup() {
        fs.removeSync(AudioRecording.RECORDINGS_DIR);
    }
}
