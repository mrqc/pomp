import {InternalLogger} from "../LogConfig.js";
import {
    AgentSession,
} from "@mariozechner/pi-coding-agent";
import {fileURLToPath} from "url";
import path from "path";
import type {TextToSpeechController} from "./TextToSpeechController.ts";
import {uuidv7} from "uuidv7";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";
import {Mutex} from "es-toolkit";
import {join} from "node:path";
import {readFile} from "node:fs/promises";
import {IntentionContextService} from "../text-processing/IntentionContext.ts";
import {LLMSessionsService} from "../services/LLMSessionsService.ts";
import { jsonToPlainText } from "json-to-plain-text";


export enum InternalAgentSessionType {
    USER_TEXT_INITIATED,
    USER_VOICE_INITIATED
}

export enum AgentSessionMessageType {
    USER_INPUT,
    ASSISTANT,
    USER_FEEDBACK
}

export interface AgentSessionProvisioning {
    id: string;
    timestamp: number;
    type: InternalAgentSessionType;
    workspace: string;
    title: string;
}

export interface InternalAgentSessionProvisioning extends AgentSessionProvisioning {
    agentSession: AgentSession;
    messages: AgentSessionMessage[];
}

export interface AgentSessionMessage {
    id: string;
    text: string;
    timestamp: number;
    type: AgentSessionMessageType;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentsController {
    private readonly intentionContextService = new IntentionContextService();
    private readonly databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private readonly clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private readonly logger = new InternalLogger(__filename);
    private readonly agentSessions: InternalAgentSessionProvisioning[] = [];
    private readonly textToSpeech: TextToSpeechController;
    private readonly modelRegistryMutex: Mutex = new Mutex();
    private readonly llmSessionsService = new LLMSessionsService();
    
    private async getFileContent(filename: string): Promise<string> {
        const filepath = join(__dirname, "..", "..", filename);
        return await readFile(filepath, "utf-8");
    }

    constructor(textToSpeech: TextToSpeechController) {
        this.textToSpeech = textToSpeech;
    }
    
    async init() {
        await this.loadConfigsAndSubscribe();
    }
    
    private async loadConfigsAndSubscribe() {
        let providers = await this.databaseConnector.getLLMProvider();
        this.clientServerSynchronization.setRecord("AgentsController", "llmProviders", providers);
        this.clientServerSynchronization.subscribeOnRecordVariable("AgentsController", "llmProviders", async (value: any)=>  {
            this.logger.info("Received LLM providers config update")
            if (Array.isArray(value)) {
                await this.databaseConnector.deleteAllLLMProviders();
                for (let index = 0; index < value.length; index++) {
                    const providerConfig = value[index];
                    await this.databaseConnector.saveLLMProvider(index, providerConfig);
                }
                this.logger.info(`Stored ${value.length} LLM provider(s) from config update.`);
                try {
                    await this.modelRegistryMutex.acquire();
                    await this.llmSessionsService.init();
                    await this.llmSessionsService.registerProvider();
                } finally {
                    this.modelRegistryMutex.release();
                }
                this.clientServerSynchronization.sendGuiInfo(`Stored ${value.length} LLM provider(s) from config update.`);
            } else {
                this.logger.error("LLM Providers config update did not provide an array of ProviderConfigInput");
                this.clientServerSynchronization.sendGuiError("Unable to store LLM provider(s).")
            }
        });
        this.clientServerSynchronization.subscribeOnEvent("new-session-via-message", (newMessageEvent) => {
            this.prompt(newMessageEvent.text,
                AgentSessionMessageType.USER_INPUT,
                null,
                InternalAgentSessionType.USER_TEXT_INITIATED);
        });
        this.clientServerSynchronization.subscribeOnEvent("prompt-ui-response", (data: any) => {
            this.prompt(`${JSON.stringify(data.technicalPayload)} 
                The action performed is ${data.action} which you must consider when providing a response.`,
                AgentSessionMessageType.USER_FEEDBACK,
                data.sessionId,
                InternalAgentSessionType.USER_TEXT_INITIATED);
        });
        this.clientServerSynchronization.subscribeOnEvent("new-session-message", (data: any) => {
            this.prompt(data.text, AgentSessionMessageType.USER_INPUT, data.sessionId, InternalAgentSessionType.USER_TEXT_INITIATED);
        });
    }
    
    public async prompt(text: string, messageType: AgentSessionMessageType, sessionId: string | null, sessionType: InternalAgentSessionType) {
        if ( !await this.llmSessionsService.isLLMProviderAndModelsConfigured()) {
            this.textToSpeech.say("Sorry, but there are no LLM providers or models registered.");
            return;
        }
        this.logger.info("Creating session with prompt: " + text)
        let session: InternalAgentSessionProvisioning | undefined = undefined;
        try {
            await this.modelRegistryMutex.acquire();
            if (sessionId != null) {
                session = this.agentSessions.find((anInternalSession) => anInternalSession.id == sessionId)
            }
            session ??= await this.createSession(text, sessionType);
            this.logger.info("Found session: " + (session != undefined))
            this.addMessageToSession(text, session, messageType);
            if (session.agentSession.isStreaming) {
                this.logger.info("Followup: " + text)
                await session.agentSession.followUp(text);
            } else {
                this.logger.info("Prompting: " + text)
                await session.agentSession.prompt(text);
            }
        } finally {
            this.modelRegistryMutex.release();
        }
    }
    private addMessageToSession(text: string, internalSession: InternalAgentSessionProvisioning, type: AgentSessionMessageType) {
        let newMessage = {
            id: uuidv7().toString(),
            text: text,
            timestamp: Date.now(),
            type: type
        } as AgentSessionMessage;
        internalSession.messages.push(newMessage);
        let messageToSend: AgentSessionMessage = newMessage;
        if (type == AgentSessionMessageType.USER_FEEDBACK) {
            messageToSend.text = jsonToPlainText(JSON.parse(text));
        }
        this.clientServerSynchronization.addListEntry(
            "messages-of-session-" + internalSession.id, 
            "message-" + messageToSend.id,
            messageToSend);
    }
    
    private async createSession(text: string, type: InternalAgentSessionType): Promise<InternalAgentSessionProvisioning> {
        this.logger.info("Creating new session")
        let session = await this.llmSessionsService.getNewSession();
        this.logger.info("Session created")
        let internalSession = this.addSession(session, text, type)
        this.logger.info("Session added")
        session.subscribe((event) => {
            if ("agent_end" == event.type) {
                this.logger.info(JSON.stringify(event, null, 2));
                let lastUserMessageIndex = -1;
                for (let messageIndex = event.messages.length - 1; messageIndex >= 0; messageIndex--) {
                    if (event.messages[messageIndex]?.role == "user") {
                        lastUserMessageIndex = messageIndex;
                        break;
                    }
                }
                let relevantMessages = lastUserMessageIndex == -1 ? event.messages : event.messages.slice(lastUserMessageIndex + 1);
                let assistantMessages = relevantMessages.filter((message: any) => message.role == "assistant");
                let intentionContext = this.intentionContextService.getIntentionContext(assistantMessages)
                this.logger.info("intentions: " + JSON.stringify(intentionContext))
                if (intentionContext.contentIntention !== undefined) {
                    internalSession.workspace = intentionContext.contentIntention.text;
                    this.clientServerSynchronization.setRecord("session-" + internalSession.id, "workspace", intentionContext.contentIntention.text)
                }
                if (intentionContext.speakIntention !== undefined) {
                    this.textToSpeech.say(intentionContext.speakIntention.text);
                    this.addMessageToSession(intentionContext.speakIntention.text, internalSession, AgentSessionMessageType.ASSISTANT);
                }
            }
        });
        session.setSteeringMode("all");
        this.logger.info("Steered session");
        await session.steer(await this.getFileContent("INTENTION.md"))
        await session.steer(await this.getFileContent("OWNER.md"))
        await session.steer(await this.getFileContent("SOUL.md"))
        this.logger.info("Providing prompt " + text + " to session")
        return internalSession;
    }

    private addSession(newAgentSession: AgentSession, text: string, type: InternalAgentSessionType): InternalAgentSessionProvisioning {
        this.logger.info("Trying to add session")
        let newSession = {
            id: uuidv7().toString(),
            agentSession: newAgentSession,
            timestamp: Date.now(),
            type: type,
            workspace: "New Session",
            messages: [],
            title: text.slice(0, 50) + "…"
        } as InternalAgentSessionProvisioning;
        this.logger.info("Adding session " + newSession.id);
        this.agentSessions.push(newSession);
        this.logger.info("Decomposing session");
        const { agentSession, messages, ...provisioningOnly } = newSession;
        this.logger.info("Send session to client: " + JSON.stringify(provisioningOnly));
        this.clientServerSynchronization.addListEntry("sessions", "session-" + newSession.id, provisioningOnly as AgentSessionProvisioning);
        this.addMessageToSession(text, newSession, AgentSessionMessageType.USER_INPUT);
        return newSession
    }
}
