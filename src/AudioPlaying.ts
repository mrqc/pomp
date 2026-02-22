import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import wavPlayer from 'node-wav-player';
import type {Mutex} from "es-toolkit";
import {fileURLToPath} from "url";
import {InternalLogger} from "./LogConfig.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AudioFile {
    filePath: string;
    timestamp: number;
}

export class AudioPlaying {
    private static readonly RECORDINGS_DIR = path.resolve(__dirname, 'audio-outputs');
    private audioMutex: Mutex;
    private queue: AudioFile[] = [];
    private isPlaying: boolean = false;
    private watcher: any;
    private logger = new InternalLogger(__filename);

    constructor(audioMutex: Mutex) {
        this.audioMutex = audioMutex;
    }
    
    public init() {
        fs.ensureDirSync(AudioPlaying.RECORDINGS_DIR);
        this.watchDirectory();
        this.initExistingFiles();
    }
    
    private watchDirectory() {
        this.watcher = chokidar.watch(AudioPlaying.RECORDINGS_DIR, {
            persistent: true,
            ignoreInitial: false,
            usePolling: true,
        });
        this.watcher.on('add', async (filePath: string) => {
            this.logger.info("File added: " + filePath)
            await this.onFileAdded(filePath);
        });
    }

    private initExistingFiles() {
        this.putExistingFilesToQueue();
        this.sortQueue();
    }
    
    private putExistingFilesToQueue() {
        const files = fs.readdirSync(AudioPlaying.RECORDINGS_DIR)
            .filter(aFile => /^output-(\d+)\.wav$/.test(aFile))
            .map(aFile => ({
                filePath: path.join(AudioPlaying.RECORDINGS_DIR, aFile),
                timestamp: this.extractTimestamp(aFile)
            }))
            .filter(aAudioFile => aAudioFile.timestamp !== null) as AudioFile[];
        this.queue.push(...files);
    }

    private extractTimestamp(filename: string): number | null {
        const match = filename.match(/^output-(\d+)\.wav$/);
        return match && match[1] ? parseInt(match[1], 10) : null;
    }

    private async onFileAdded(filePath: string) {
        const filename = path.basename(filePath);
        const timestamp = this.extractTimestamp(filename);
        if (timestamp !== null) {
            this.queue.push({filePath, timestamp});
            this.sortQueue();
            this.playNext();
        }
    }

    private sortQueue() {
        this.queue.sort((a, b) => a.timestamp - b.timestamp);
    }

    private async playNext() {
        if (this.isPlaying) {
            return;
        }
        this.logger.info("Acquire lock")
        await this.audioMutex.acquire();
        if (this.queue.length === 0) {
            this.audioMutex.release();
            return;
        }
        this.isPlaying = true;
        const next = this.queue.shift();
        if ( !next) {
            this.isPlaying = false;
            this.audioMutex.release();
            return;
        }
        try {
            await wavPlayer.play({
                path: next.filePath,
                sync: true
            });
        } catch (err) {
            console.error('Error playing file:', next.filePath, err);
        } finally {
            this.isPlaying = false;
            this.audioMutex.release();
            this.playNext();
        }
    }

    public close() {
        this.watcher.close();
    }
}
