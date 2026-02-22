import {ExpressWrapper} from "./ExpressWrapper.ts";
import {AudioRecording} from "./AudioRecording.ts";
import { fileURLToPath } from 'url';
import path from 'path';
import {SpeechToText} from "./SpeechToText.ts";
import {TextToSpeech} from "./TextToSpeech.ts";
import {Mutex} from "es-toolkit";
import {AudioPlaying} from "./AudioPlaying.ts";
import {AgentsController} from "./AgentsController.ts";
import {InternalLogger} from "./LogConfig.ts";
import {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {DatabaseConnector} from "./DatabaseConnector.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let logger = new InternalLogger(__filename);

const audioMutex = new Mutex();
logger.info("Starting database connector")
let databaseConnector = new DatabaseConnector();
logger.info("Starting client/server synchronization")
let clientServerSynchronization = new ClientServerSynchronization();
logger.info("Starting express")
let express: ExpressWrapper = new ExpressWrapper()
logger.info("Starting text to speech")
let textToSpeech: TextToSpeech = new TextToSpeech();
logger.info("Agents controller starting")
let agentsController: AgentsController = new AgentsController(textToSpeech, clientServerSynchronization, databaseConnector);
logger.info("Starting audio playing")
let audioPlaying: AudioPlaying = new AudioPlaying(audioMutex);
logger.info("Starting speech to text")
let speechToText: SpeechToText = new SpeechToText(agentsController, clientServerSynchronization);
logger.info("Starting audio recording")
let audioRecording: AudioRecording = new AudioRecording(audioMutex, speechToText);

logger.info("Starting environment...")

async function startup() {
    logger.info("Database migration")
    await databaseConnector.migrate();
    logger.info("Express listener")
    express.init();
    logger.info("Agents controller initializing")
    await agentsController.init();
    logger.info("Audio recording")
    audioRecording.startRecording();
    logger.info("Audio playing")
    audioPlaying.init();
    logger.info("Text to speech")
    await textToSpeech.init();
    logger.info("Client/Server synchronization initializing")
    await clientServerSynchronization.init();
    textToSpeech.say("Hello!");
}

function gracefulShutdown(signal: string) {
    logger.info(`\nReceived ${signal}. Shutting down gracefully...`);
    AudioRecording.cleanup();
    SpeechToText.cleanup();
    TextToSpeech.cleanup();
    databaseConnector.close();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('exit', () => gracefulShutdown('exit'));

startup().then(r => logger.info("Listening..."));
