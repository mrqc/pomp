import path from "node:path";
import type {IoStreamRead} from "naudiodon-no-segfault";
import * as portAudio from "naudiodon-no-segfault";
import * as wav from "wav";
import {FileWriter} from "wav";
import fs from "fs-extra";
import {fileURLToPath} from "url";
import {SpeechToTextController} from "./SpeechToTextController.ts";
import {Mutex} from "es-toolkit";
import {InternalLogger} from "../LogConfig.ts";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";
import {TextToSpeechController} from "./TextToSpeechController.ts";
import {AudioPlayingController} from "./AudioPlayingController.ts";
import {type AgentsController, ConversationStatus} from "./AgentsController.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioRecordingController {
    private readonly databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private readonly clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private static readonly RECORDINGS_DIR = path.resolve(__dirname, 'recordings');
    private static sampleRate = 16000;
    public static defaultRecordingDuration = 0.25;
    private readonly logger = new InternalLogger(__filename);
    private speechToText: SpeechToTextController | undefined;
    private audioMutex: Mutex | undefined;
    private audioDevice: IoStreamRead | null = null;
    private currentWavFileWriter: FileWriter | null = null;
    private agentsController: AgentsController | null = null;
    private textToSpeech: TextToSpeechController | null = null;
    private isRecording: boolean = false;
    private currentOutputFileName: string | null = null;
    public silentCount = 0;
    private audioPlaying: AudioPlayingController | undefined;

    constructor() {
        AudioRecordingController.cleanup();
        fs.ensureDirSync(AudioRecordingController.RECORDINGS_DIR);
    }
    
    async init(audioMutex: Mutex, 
               speechToText: SpeechToTextController, 
               textToSpeech: TextToSpeechController, 
               audioPlaying: AudioPlayingController,
               agentsController: AgentsController) {
        this.startRecording = this.startRecording.bind(this);
        this.textToSpeech = textToSpeech;
        this.audioMutex = audioMutex;
        this.speechToText = speechToText;
        this.audioPlaying = audioPlaying;
        this.agentsController = agentsController;
        await this.loadConfigsAndSubscribe();
    }

    private async loadConfigsAndSubscribe() {
        AudioRecordingController.sampleRate = await this.databaseConnector.getIntegerConfig("AudioRecording", "sampleRate");
        AudioRecordingController.defaultRecordingDuration = await this.databaseConnector.getFloatConfig("AudioRecording", "defaultRecordingDuration");
        await this.clientServerSynchronization.setRecord("AudioRecording", "sampleRate", AudioRecordingController.sampleRate);
        await this.clientServerSynchronization.setRecord("AudioRecording", "defaultRecordingDuration", AudioRecordingController.defaultRecordingDuration);
        this.clientServerSynchronization.subscribeOnRecordVariable("AudioRecording","sampleRate", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "sampleRate", value);
            AudioRecordingController.sampleRate = await this.databaseConnector.getIntegerConfig("AudioRecording", "sampleRate");
            this.clientServerSynchronization.sendGuiInfo("Sample rate changed to " + AudioRecordingController.sampleRate)
        });
        this.clientServerSynchronization.subscribeOnRecordVariable("AudioRecording", "defaultRecordingDuration", async (value: any) => {
            await this.databaseConnector.setConfig("AudioRecording", "defaultRecordingDuration", value);
            AudioRecordingController.defaultRecordingDuration = await this.databaseConnector.getFloatConfig("AudioRecording", "defaultRecordingDuration");
            this.clientServerSynchronization.sendGuiInfo("Default recording duration changed to " + AudioRecordingController.defaultRecordingDuration)
        });
    }
    
    private waitingForAdditionalInputOver(): boolean {
        if (this.speechToText?.currentSessionId == undefined) {
            return false;
        }
        if (this.agentsController?.getAgentSession(this.speechToText.currentSessionId)?.conversation == ConversationStatus.WAIT && this.silentCount < 3) {
            return false;
        }
        if (this.agentsController?.getAgentSession(this.speechToText.currentSessionId)?.conversation == ConversationStatus.ONGOING && this.silentCount < 3) {
            return false
        }
        return true;
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
            this.audioMutex!.release();
            return null;
        } else {
            selectedDeviceId = inputDevices[0]?.id ?? -1;
        }
        let audioIo = portAudio.AudioIO({
            inOptions: {
                channelCount: 1,
                sampleFormat: portAudio.SampleFormat16Bit,
                sampleRate: AudioRecordingController.sampleRate,
                deviceId: selectedDeviceId,
                closeOnError: true,
                framesPerBuffer: AudioRecordingController.sampleRate * AudioRecordingController.defaultRecordingDuration
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
                this.logger.info("silenceCount = " + this.silentCount + " wantsToSay = " + this.textToSpeech?.wantsToSaySomething() + " isPlaying = " + this.audioPlaying!.isPlaying)
                if (this.silentCount == 0) {
                    this.stopRecording();
                } else if (this.textToSpeech?.wantsToSaySomething() && !this.audioPlaying!.isPlaying) {
                    this.stopRecording();
                } else if (this.waitingForAdditionalInputOver()) {
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
        await this.audioMutex!.acquire();
        try {
            this.currentOutputFileName = path.resolve(AudioRecordingController.RECORDINGS_DIR, 'output' + Date.now() + '.wav');
            let audioIo = this.initAudioDevice();
            if (audioIo == null) {
                this.audioMutex!.release(); // Explicitly release if init fails and we acquired lock
                return;
            }
            if (this.currentWavFileWriter) {
                this.currentWavFileWriter.end();
            }
            this.currentWavFileWriter = new wav.FileWriter(this.currentOutputFileName, {
                channels: 1,
                sampleRate: AudioRecordingController.sampleRate,
                bitDepth: 16
            });
            this.isRecording = true;
        } catch (error) {
            this.logger.error("Error in startRecording: " + error);
            this.audioMutex!.release();
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
                this.speechToText!.writeAudioFileToTextStream(this.currentOutputFileName);
            });
            writer.end();
            this.currentWavFileWriter = null;
        }
        this.audioMutex!.release();
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
            fs.removeSync(AudioRecordingController.RECORDINGS_DIR);
        }
    }
}
