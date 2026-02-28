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
import {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {Controller} from "./Controller.ts";
import type {DatabaseConnector} from "./DatabaseConnector.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioRecording extends Controller {

    private static readonly RECORDINGS_DIR = path.resolve(__dirname, 'recordings');
    private static sampleRate = 16000;
    public static defaultRecordingDuration = 2000;
    public static stopWaitingRecordDuration = 600;
    public static recordDuration = AudioRecording.defaultRecordingDuration;
    private logger = new InternalLogger(__filename);
    private speechToText: SpeechToText;
    private audioMutex: Mutex;

    constructor(audioMutex: Mutex, speechToText: SpeechToText, clientServerSynchronization: ClientServerSynchronization, databaseConnector: DatabaseConnector) {
        super(clientServerSynchronization, databaseConnector, "AudioRecording");
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
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        AudioRecording.sampleRate = await this.getControllerRecordIntegerConfiguration("sampleRate");
        AudioRecording.defaultRecordingDuration = await this.getControllerRecordIntegerConfiguration("defaultRecordingDuration");
        AudioRecording.stopWaitingRecordDuration = await this.getControllerRecordIntegerConfiguration("stopWaitingRecordDuration");
        this.loadControllerConfiguration("sampleRate", AudioRecording.sampleRate);
        this.loadControllerConfiguration("defaultRecordingDuration", AudioRecording.defaultRecordingDuration);
        this.loadControllerConfiguration("stopWaitingRecordDuration", AudioRecording.stopWaitingRecordDuration);
        this.subscribeControllerRecord("sampleRate", async (value: any) => {
            await this.setControllerRecordConfiguration("sampleRate", value);
            AudioRecording.sampleRate = await this.getControllerRecordIntegerConfiguration("sampleRate");
            this.sendInfo("Sample rate changed to " + AudioRecording.sampleRate)
        });
        this.subscribeControllerRecord("defaultRecordingDuration", async (value: any) => {
            await this.setControllerRecordConfiguration("defaultRecordingDuration", value);
            AudioRecording.defaultRecordingDuration = await this.getControllerRecordIntegerConfiguration("defaultRecordingDuration");
            this.sendInfo("Default recording duration changed to " + AudioRecording.defaultRecordingDuration)
        });
        this.subscribeControllerRecord("stopWaitingRecordDuration", async (value: any) => {
            await this.setControllerRecordConfiguration("stopWaitingRecordDuration", value);
            AudioRecording.stopWaitingRecordDuration = await this.getControllerRecordIntegerConfiguration("stopWaitingRecordDuration");
            this.sendInfo("Stop waiting record duration changed to " + AudioRecording.stopWaitingRecordDuration)
        });
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
            this.logger.info("1");
            let outputFileName = path.resolve(AudioRecording.RECORDINGS_DIR, 'output' + Date.now() + '.wav');
            this.logger.info("2");
            const inputDevices = portAudio.getDevices().filter((d: any) => d.maxInputChannels > 0);
            this.logger.info("Available input devices: " + JSON.stringify(inputDevices));
            let selectedDeviceId = -1;
            if (inputDevices.length === 0) {
                this.logger.error("No input audio devices found. Please check your system settings and permissions.");
                this.audioMutex.release();
                return;
            } else {
                selectedDeviceId = inputDevices[0]?.id ?? -1;
            }
            let audioIo = portAudio.AudioIO({
                inOptions: {
                    channelCount: 1,
                    sampleFormat: portAudio.SampleFormat16Bit,
                    sampleRate: AudioRecording.sampleRate,
                    deviceId: selectedDeviceId,
                    closeOnError: true
                }
            });
            this.logger.info("3");
            let wavFileWriter = new wav.FileWriter(outputFileName, {
                channels: 1,
                sampleRate: AudioRecording.sampleRate,
                bitDepth: 16
            });
            this.logger.info("4");
            audioIo.pipe(wavFileWriter);
            this.logger.info("5");
            audioIo.start();
            this.logger.info("6");
            setTimeout(() => {
                this.logger.info("6");
                this.audioMutex.release();
                this.logger.info("7");
                this.stopRecording(outputFileName, wavFileWriter, audioIo)
                this.logger.info("8");
            }, AudioRecording.recordDuration);
            this.logger.info("9");
        } catch (error) {
            this.logger.error("Error in startRecording: " + error);
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
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(AudioRecording.RECORDINGS_DIR);
        }
    }
}
