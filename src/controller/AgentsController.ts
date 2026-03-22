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

interface InternalAgentSession {
    id: string;
    agentSession: AgentSession;
    timestamp: number;
    type: InternalAgentSessionType,
    workspace: string
}

interface PromptResponseMessage {
    id: string;
    text: string;
    timestamp: number;
}

interface ExternalAgentSession {
    id: string;
    title: string;
    content: [];
    workspace: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentsController {
    private intentionContextService = new IntentionContextService();
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();
    private clientServerSynchronization: ClientServerSynchronizationService = ClientServerSynchronizationService.getInstance();
    private logger = new InternalLogger(__filename);
    private internalAgentSessions: InternalAgentSession[] = [];
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
                for (let i = 0; i < value.length; i++) {
                    const providerConfig = value[i];
                    const id = i;
                    await this.databaseConnector.saveLLMProvider(id, providerConfig);
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
        let session: AgentSession | undefined = undefined;
        try {
            await this.modelRegistryMutex.acquire();
            session = this.internalAgentSessions.filter((anInternalSession) => 
                    anInternalSession.type == InternalAgentSessionType.MAIN)[0]?.agentSession
            if (session == undefined) {
                session = await this.createSession(text)
                if (session != undefined) {
                    await session.prompt(text)
                }
            } else {
                await session.followUp(text)
            }
        } finally {
            this.modelRegistryMutex.release();
        }
    }
    
    private async createSession(text: string): Promise<AgentSession | undefined> {
        let session = await this.llmSessionsService.getNewSession();
        if (session == null) {
            return;
        }
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
                    let newMessage = {
                        id: uuidv7().toString(),
                        text: intentionContext.speakIntention.text,
                        timestamp: Date.now()
                    } as PromptResponseMessage;
                    this.clientServerSynchronization.addListEntry("messages-of-session-" + internalSession.id, "message-" + newMessage.id, newMessage);
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
        return session;
    }

    private addSession(session: AgentSession, text: string): InternalAgentSession {
        let internalSession = {
            id: uuidv7().toString(),
            agentSession: session,
            timestamp: Date.now(),
            type: InternalAgentSessionType.MAIN,
            workspace: "New Session"
        } as InternalAgentSession;
        this.internalAgentSessions.push(internalSession);
        let externalSession = {
            id: internalSession.id,
            title: text.slice(0, 50) + "…",
            content: [],
            workspace: "New Session"
        } as ExternalAgentSession;
        this.logger.info("Adding session " + JSON.stringify(externalSession));
        this.clientServerSynchronization.addListEntry("sessions", "session-" + externalSession.id, externalSession);
        return internalSession
    }
}
