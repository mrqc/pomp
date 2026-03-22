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

enum InternalAgentSessionType {
    MAIN
}
enum AgentSessionMessageType {
    USER,
    ASSISTANT
}

interface AgentSessionProvisioning {
    id: string;
    timestamp: number;
    type: InternalAgentSessionType;
    workspace: string;
    title: string;
}

interface InternalAgentSessionProvisioning extends AgentSessionProvisioning {
    agentSession: AgentSession;
    messages: AgentSessionMessage[];
}

interface AgentSessionMessage {
    id: string;
    text: string;
    timestamp: number;
    type: AgentSessionMessageType;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentsController {
    private intentionContextService = new IntentionContextService();
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private logger = new InternalLogger(__filename);
    private agentSessions: InternalAgentSessionProvisioning[] = [];
    private textToSpeech: TextToSpeechController;
    private modelRegistryMutex: Mutex = new Mutex();
    private llmSessionsService = new LLMSessionsService();
    
    private async getFileContent(filename: string): Promise<string> {
        const filepath = join(__dirname, "..", filename);
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
    }
    
    public async prompt(text: string) {
        if ( !await this.llmSessionsService.isLLMProviderAndModelsConfigured()) {
            this.textToSpeech.say("Sorry, but there are no LLM providers or models registered.");
            return;
        }
        let session: InternalAgentSessionProvisioning | undefined = undefined;
        try {
            await this.modelRegistryMutex.acquire();
            session = this.agentSessions.filter((anInternalSession) => anInternalSession.type == InternalAgentSessionType.MAIN)[0]
            if (session == undefined) {
                session = await this.createSession(text);
                if (session != undefined) {
                    await session.agentSession.prompt(text);
                }
            } else {
                await session.agentSession.followUp(text);
            }
            this.addMessageToSession(text, session, AgentSessionMessageType.USER);
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
        this.clientServerSynchronization.addListEntry("messages-of-session-" + internalSession.id, "message-" + newMessage.id, newMessage);
    }
    
    private async createSession(text: string): Promise<InternalAgentSessionProvisioning> {
        let session = await this.llmSessionsService.getNewSession();
        let internalSession = this.addSession(session, text)
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
                let relevantMessages = lastUserMessageIndex != -1 ? event.messages.slice(lastUserMessageIndex + 1) : event.messages;
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
        await session.steer(await this.getFileContent("INTENTION.md"))
        await session.steer(await this.getFileContent("OWNER.md"))
        await session.steer(await this.getFileContent("SOUL.md"))
        if (!session.isStreaming) {
            await session.agent.continue();
        }
        this.logger.info("Providing prompt " + text + " to session")
        return internalSession;
    }

    private addSession(session: AgentSession, text: string): InternalAgentSessionProvisioning {
        let newSession = {
            id: uuidv7().toString(),
            agentSession: session,
            timestamp: Date.now(),
            type: InternalAgentSessionType.MAIN,
            workspace: "New Session",
            messages: [],
            title: text.slice(0, 50) + "…"
        } as InternalAgentSessionProvisioning;
        this.agentSessions.push(newSession);
        this.logger.info("Adding session " + JSON.stringify(newSession));
        const { agentSession, messages, ...provisioningOnly } = newSession;
        this.clientServerSynchronization.addListEntry("sessions", "session-" + newSession.id, provisioningOnly as AgentSessionProvisioning);
        return newSession
    }
}
