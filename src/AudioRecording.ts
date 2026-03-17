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
import {TextToSpeech} from "./TextToSpeech.ts";
import {AudioPlaying} from "./AudioPlaying.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioRecording extends Controller {

    private static readonly RECORDINGS_DIR = path.resolve(__dirname, 'recordings');
    private static sampleRate = 16000;
    public static defaultRecordingDuration = 0.25;
    private logger = new InternalLogger(__filename);
    private speechToText: SpeechToText;
    private audioMutex: Mutex;
    private audioDevice: IoStreamRead | null = null;
    private currentWavFileWriter: FileWriter | null = null;
    private textToSpeech: TextToSpeech | null = null;
    private isRecording: boolean = false;
    private currentOutputFileName: string | null = null;
    public silentCount = 0;
    private audioPlaying: AudioPlaying;

    constructor(audioMutex: Mutex, speechToText: SpeechToText, clientServerSynchronization: ClientServerSynchronization, databaseConnector: DatabaseConnector, textToSpeech: TextToSpeech, audioPlaying: AudioPlaying) {
        super(clientServerSynchronization, databaseConnector, "AudioRecording");
        AudioRecording.cleanup();
        this.startRecording = this.startRecording.bind(this);
        this.textToSpeech = textToSpeech;
        this.audioMutex = audioMutex;
        this.speechToText = speechToText;
        this.audioPlaying = audioPlaying;
        fs.ensureDirSync(AudioRecording.RECORDINGS_DIR);
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        AudioRecording.sampleRate = await this.getControllerRecordIntegerConfiguration("sampleRate");
        AudioRecording.defaultRecordingDuration = await this.getControllerRecordFloatConfiguration("defaultRecordingDuration");
        this.setControllerRecordVariable("sampleRate", AudioRecording.sampleRate);
        this.setControllerRecordVariable("defaultRecordingDuration", AudioRecording.defaultRecordingDuration);
        this.subscribeControllerRecordVariable("sampleRate", async (value: any) => {
            await this.setControllerRecordConfiguration("sampleRate", value);
            AudioRecording.sampleRate = await this.getControllerRecordIntegerConfiguration("sampleRate");
            this.sendInfo("Sample rate changed to " + AudioRecording.sampleRate)
        });
        this.subscribeControllerRecordVariable("defaultRecordingDuration", async (value: any) => {
            await this.setControllerRecordConfiguration("defaultRecordingDuration", value);
            AudioRecording.defaultRecordingDuration = await this.getControllerRecordFloatConfiguration("defaultRecordingDuration");
            this.sendInfo("Default recording duration changed to " + AudioRecording.defaultRecordingDuration)
        });
    }

    private initAudioDevice(): IoStreamRead | null {
        this.logger.info("Initializing Audio Device");
        if (this.audioDevice != null) {
            return this.audioDevice;
        }
        const inputDevices = portAudio.getDevices().filter((d: any) => d.maxInputChannels > 0);
        this.logger.info("Available input devices: " + JSON.stringify(inputDevices));
        let selectedDeviceId = -1;
        if (inputDevices.length === 0) {
            this.logger.error("No input audio devices found. Please check your system settings and permissions.");
            this.audioMutex.release();
            return null;
        } else {
            selectedDeviceId = inputDevices[0]?.id ?? -1;
        }
        let audioIo = portAudio.AudioIO({
            inOptions: {
                channelCount: 1,
                sampleFormat: portAudio.SampleFormat16Bit,
                sampleRate: AudioRecording.sampleRate,
                deviceId: selectedDeviceId,
                closeOnError: true,
                framesPerBuffer: AudioRecording.sampleRate * AudioRecording.defaultRecordingDuration
            }
        });
        // Attach data event handler for manual writing
        audioIo.on('data', (chunk: Buffer) => {
            // Silence detection logic
            const threshold = 500; 
            let silent = true;
            for (let i = 0; i < chunk.length; i += 2) {
                // Read 16-bit signed integer (little endian)
                const sample = chunk.readInt16LE(i);
                if (Math.abs(sample) > threshold) {
                    silent = false;
                    break;
                }
            }
            if (silent) {
                this.logger.info('Silence detected in audio chunk');
                this.logger.info("silenceCount = " + this.silentCount + " wantsToSay = " + this.textToSpeech?.wantsToSaySomething() + " isPlaying = " + this.audioPlaying.isPlaying)
                if (this.silentCount == 0) {
                    this.stopRecording();
                } else if (this.textToSpeech?.wantsToSaySomething() && !this.audioPlaying.isPlaying) {
                    this.stopRecording();
                }
                this.silentCount++;
            } else {
                this.silentCount = 0;
                if (this.isRecording && this.currentWavFileWriter) {
                    this.currentWavFileWriter.write(chunk);
                }
            }
        });
        audioIo.start();
        this.audioDevice = audioIo;
        this.logger.info("Audio Device initialized");
        return audioIo;
    }
    
    async startRecording() {
        this.logger.info("Acquire lock")
        await this.audioMutex.acquire();
        try {
            this.currentOutputFileName = path.resolve(AudioRecording.RECORDINGS_DIR, 'output' + Date.now() + '.wav');
            let audioIo = this.initAudioDevice();
            if (audioIo == null) {
                this.audioMutex.release(); // Explicitly release if init fails and we acquired lock
                return;
            }
            if (this.currentWavFileWriter) {
                this.currentWavFileWriter.end();
            }
            this.currentWavFileWriter = new wav.FileWriter(this.currentOutputFileName, {
                channels: 1,
                sampleRate: AudioRecording.sampleRate,
                bitDepth: 16
            });
            this.isRecording = true;
        } catch (error) {
            this.logger.error("Error in startRecording: " + error);
            this.audioMutex.release();
        }
    }
    
    private async stopRecording() {
        if (!this.isRecording) {
            return;
        }
        this.isRecording = false;
        const writer = this.currentWavFileWriter;
        if (writer) {
            writer.on('finish', async () => {
                if (this.currentOutputFileName == null) {
                    return;
                }
                this.speechToText.writeAudioFileToTextStream(this.currentOutputFileName);
            });
            writer.end();
            this.currentWavFileWriter = null;
        }
        this.audioMutex.release();
        await this.startRecording();
    }

    public stopAndCleanupAudioDevice() {
        if (this.audioDevice) {
            this.audioDevice.quit();
            this.audioDevice = null;
        }
        if (this.currentWavFileWriter) {
            this.currentWavFileWriter.end();
            this.currentWavFileWriter = null;
        }
        this.isRecording = false;
    }

    public static cleanup() {
        if ( !InternalLogger.isDebug()) {
            fs.removeSync(AudioRecording.RECORDINGS_DIR);
        }
    }
}
