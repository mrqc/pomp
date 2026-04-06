import {ExpressWrapperController} from "./controller/ExpressWrapperController.ts";
import {AudioRecordingController} from "./controller/AudioRecordingController.ts";
import { fileURLToPath } from 'url';
import path from 'path';
import {SpeechToTextController} from "./controller/SpeechToTextController.ts";
import {TextToSpeechController} from "./controller/TextToSpeechController.ts";
import {Mutex} from "es-toolkit";
import {AudioPlayingController} from "./controller/AudioPlayingController.ts";
import {AgentsController} from "./controller/AgentsController.ts";
import {InternalLogger} from "./LogConfig.ts";
import {ClientServerSynchronizationService} from "./services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "./services/DatabaseConnectorService.ts";
import {Configuration} from "./Configuration.ts";
import {Tools} from "./Tools.ts";
import {MultiMCPClient, multiMcpClient} from "./mcp/client/MultiMCPClient.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let logger = new InternalLogger(__filename);

const audioMutex = new Mutex();
logger.info("Starting database connector")
let configuration = new Configuration();
let databaseConnector = DatabaseConnectorService.getInstance();
await databaseConnector.migrate();
logger.info("Starting client/server synchronization")
let clientServerSynchronization = ClientServerSynchronizationService.getInstance();
logger.info("Starting express")
let express: ExpressWrapperController = new ExpressWrapperController(configuration)
logger.info("Starting text to speech")
let textToSpeech: TextToSpeechController = new TextToSpeechController();
logger.info("Starting audio playing")
let audioPlaying: AudioPlayingController = new AudioPlayingController(audioMutex);
logger.info("Agents controller starting")
let agentsController: AgentsController = new AgentsController(textToSpeech);
logger.info("Starting speech to text")
let speechToText: SpeechToTextController = new SpeechToTextController(agentsController);
logger.info("Starting audio recording")
let audioRecording: AudioRecordingController = new AudioRecordingController(audioMutex, speechToText, textToSpeech, audioPlaying);
logger.info("Starting MCP Server")

logger.info("Starting environment...")

async function startup() {
    logger.info("Setting rootPath to " + process.cwd());
    multiMcpClient.rootPath = process.cwd();
    logger.info("Express listener");
    express.init();
    logger.info("Agents controller initializing")
    await agentsController.init();
    logger.info("Audio recording")
    await audioRecording.init();
    logger.info("Audio playing")
    audioPlaying.init();
    logger.info("Text to speech")
    await textToSpeech.init();
    logger.info("Client/Server synchronization initializing")
    await clientServerSynchronization.init();
    logger.info("Speech to text initializing");
    await speechToText.init();
    logger.info("MCP Server initialization")
    audioRecording.startRecording();
    textToSpeech.say("Hello!");
}

async function gracefulShutdown(signal: string) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await multiMcpClient.shutdown();
    audioRecording.stopAndCleanupAudioDevice();
    AudioRecordingController.cleanup();
    SpeechToTextController.cleanup();
    TextToSpeechController.cleanup();
    databaseConnector.close();
    audioPlaying.close();
    Tools.cleanup();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('exit', () => gracefulShutdown('exit'));

startup().then(r => logger.info("Listening..."));
