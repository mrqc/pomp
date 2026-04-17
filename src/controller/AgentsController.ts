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
import {readFile, appendFile} from "node:fs/promises";
import {IntentionContextService} from "../text-processing/IntentionContext.ts";
import {LLMSessionsService} from "../services/LLMSessionsService.ts";
import {jsonToPlainText} from "json-to-plain-text";
import type {AssistantMessage} from "@mariozechner/pi-ai";

export enum AgentSessionMessageType {
    USER_TEXT_INPUT,
    ASSISTANT,
    USER_ACTION_FEEDBACK,
    EVENT,
    PROCEEDING_INFORMATION
}

enum StreamSpeakIntentionState {
    WAIT_FOR_TAG,
    TAG_COMPLETE,
    SPOKE
}

export enum ConversationStatus {
    NO_CONVERSATION,
    ONGOING,
    WAIT
}

export interface AgentSessionProvisioning {
    id: string;
    timestamp: number;
    workspace: string;
    title: string;
    /**
     * This is used to provide a fast user experience. When the content is streamed
     * from the LLM to the client the SPEAK tag is extracted. If it is complete the
     * content is immediately streamed to speak.
     */
    ongoingStreamSpeakIntentionExtracted: StreamSpeakIntentionState;

    /**
     * is ONGOING if the LLM thinks that the user has to provide an answer or slt
     * is WAIT if the LLM thinks that the user input was interrupted or incomplete
     */
    conversation: ConversationStatus
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
    private textToSpeech: TextToSpeechController | undefined;
    private readonly modelRegistryMutex: Mutex = new Mutex();
    private readonly llmSessionsService = new LLMSessionsService();
    
    private async getFileContent(filename: string): Promise<string> {
        try {
            const filepath = join(__dirname, "..", "..", filename);
            return await readFile(filepath, "utf-8");
        } catch (error) {
            this.logger.error("Error while getting file: " + error);
            return "Currently there is no information available.";
        }
    }
    
    private async appendToFile(content: string, filename: string) {
        try {
            const filepath = join(__dirname, "..", "..", filename);
            await appendFile(filepath, content);
        } catch (error) {
            this.logger.error("Error while getting file: " + error);
        }
    }

    async init(textToSpeech: TextToSpeechController) {
        this.textToSpeech = textToSpeech;
        await this.loadConfigsAndSubscribe();
    }
    
    private async loadConfigsAndSubscribe() {
        let providers = await this.databaseConnector.getLLMProvider();
        await this.clientServerSynchronization.setRecord("AgentsController", "llmProviders", providers);
        this.clientServerSynchronization.subscribeOnRecordVariable("AgentsController", "llmProviders", async (value: any)=>  {
            this.logger.info("Received LLM providers config update")
            if (Array.isArray(value) && value.length > 0) {
                try {
                    await this.modelRegistryMutex.acquire();
                    await this.databaseConnector.deleteAllLLMProviders();
                    for (let index = 0; index < value.length; index++) {
                        const providerConfig = value[index];
                        this.logger.info("Storing " + JSON.stringify(providerConfig) + " as LLM provider config");
                        await this.databaseConnector.saveLLMProvider(index, providerConfig);
                    }
                    this.logger.info(`Stored ${value.length} LLM provider(s) from config update.`);
                    await this.llmSessionsService.init();
                    await this.llmSessionsService.registerProvider();
                } finally {
                    this.logger.info("LLM providers updated")
                    this.modelRegistryMutex.release();
                }
                this.clientServerSynchronization.sendGuiInfo(`Stored ${value.length} LLM provider(s) from config update.`);
            } else {
                this.logger.error("LLM Providers config update did not provide an array of ProviderConfigInput");
                this.clientServerSynchronization.sendGuiError("Unable to store LLM provider(s).")
            }
        });
        this.clientServerSynchronization.subscribeOnEvent("conversation-emergency-stop", (cancelEvent) => {
            let session = this.getAgentSession(cancelEvent.sessionId);
            if (session == undefined) {
                return;
            }
            session.conversation = ConversationStatus.NO_CONVERSATION;
            this.addMessageToSession(
                "No actual user inputs expected anymore.",
                null,
                session,
                AgentSessionMessageType.EVENT);
        });
        this.clientServerSynchronization.subscribeOnEvent("new-session-via-message", (newMessageEvent) => {
            this.prompt(newMessageEvent.text,
                AgentSessionMessageType.USER_TEXT_INPUT,
                null);
        });
        this.clientServerSynchronization.subscribeOnEvent("prompt-ui-response", (data: any) => {
            try {
                let jsonData = JSON.stringify(data.technicalPayload);
                this.prompt(`${jsonData} 
                The action performed is ${data.action} which you must consider when providing a response.`,
                    AgentSessionMessageType.USER_ACTION_FEEDBACK,
                    data.sessionId);
            } catch (error) {
                this.logger.error(`Error handling prompt-ui-response ${data.technicalPayload} for event: ` + error);
                this.prompt(`The action performed is ${data.action} which you must consider when providing a response.`,
                    AgentSessionMessageType.USER_ACTION_FEEDBACK,
                    data.sessionId);
            }
        });
        this.clientServerSynchronization.subscribeOnEvent("new-session-message", (data: any) => {
            this.prompt(data.text, AgentSessionMessageType.USER_TEXT_INPUT, data.sessionId);
        });
    }
    
    public getAgentSession(sessionId: string) {
        return this.agentSessions.find((anInternalSession) => anInternalSession.id == sessionId)
    }
    
    private isStopSentence(text: string): boolean {
        if (!text.trim()) {
            return false;
        }
        const words = text
            .toLowerCase()
            .replaceAll(/[^\w\s]/g, '')
            .split(/\s+/);
        const totalWords = words.length;
        const stopCount = words.filter(word => word === 'stop').length;
        return stopCount > totalWords / 2;
    }
    
    public async prompt(text: string, messageType: AgentSessionMessageType, sessionId: string | null) {
        if ( !await this.llmSessionsService.isLLMProviderAndModelsConfigured()) {
            this.textToSpeech!.say("Sorry, but there are no LLM providers or models registered.");
            return;
        }
        if (this.isStopSentence(text)) {
            this.textToSpeech!.cancelSpeech();
            this.textToSpeech!.say("Sorry");
            return;
        }
        this.logger.info("Creating session with prompt: " + text)
        let session: InternalAgentSessionProvisioning | undefined = undefined;
        try {
            this.logger.info("Requesting mutex")
            await this.modelRegistryMutex.acquire();
            this.logger.info("Trying to get session for id " + sessionId)
            if (sessionId != null) {
                session = this.getAgentSession(sessionId);
            }
            this.logger.info("Found session: " + (session != undefined));
            session ??= await this.createSession(text, null);
            this.logger.info("Session is: " + (session != undefined))
            this.addMessageToSession(text, null, session, messageType);
            this.logger.info("Message added to session: " + session.id)
            this.logger.info("Providing prompt " + text + " to session")
            
            if (session.agentSession.isStreaming) {
                this.logger.info("Followup: " + text)
                await session.agentSession.followUp(text);
            } else if (session.agentSession.getSteeringMessages().length > 0) {
                this.logger.info("Steering: " + text)
                await session.agentSession.steer(text);
                await session.agentSession.prompt("");
            } else {
                this.logger.info("Prompting: " + text)
                await session.agentSession.prompt(text);
            }
        } finally {
            this.modelRegistryMutex.release();
        }
    }
    
    private addMessageToSession(text: string, 
                                workspace: string | null,
                                internalSession: InternalAgentSessionProvisioning, 
                                type: AgentSessionMessageType) {
        let newMessage = {
            id: uuidv7().toString(),
            text: text,
            timestamp: Date.now(),
            type: type,
            workspace: workspace
        } as AgentSessionMessage;
        this.logger.info(`Adding message ${newMessage.text} with timestamp ${newMessage.timestamp}`)
        internalSession.messages.push(newMessage);
        let messageToSend: AgentSessionMessage = newMessage;
        if (type == AgentSessionMessageType.USER_ACTION_FEEDBACK) {
            try {
                messageToSend.text = jsonToPlainText(JSON.parse(text));
            } catch (exception) {
                this.logger.info(`Could not parse text ${text} as JSON for USER_ACTION_FEEDBACK, sending raw text. Error: ${exception}`)
                messageToSend.text = text;
            }
        }
        this.clientServerSynchronization.addListEntry(
            "messages-of-session-" + internalSession.id, 
            "message-" + messageToSend.id,
            messageToSend);
    }
    
    private async createSession(text: string, workspace: string | null): Promise<InternalAgentSessionProvisioning> {
        this.logger.info("Creating new session")
        let session = await this.llmSessionsService.getNewSession();
        this.logger.info("Session created")
        let internalSession = this.addSession(session, text, workspace)
        this.logger.info("Session added")
        session.subscribe((event) => {
            if ("message_update" == event.type) {
                let intentionContext = this.intentionContextService.getIntentionContext([event.message])
                if (intentionContext.speakIntention !== undefined 
                    && intentionContext.speakIntention.text.trim() !== ""
                    && internalSession.ongoingStreamSpeakIntentionExtracted == StreamSpeakIntentionState.WAIT_FOR_TAG) {
                    internalSession.ongoingStreamSpeakIntentionExtracted = StreamSpeakIntentionState.TAG_COMPLETE;
                    this.textToSpeech!.say(intentionContext.speakIntention.text);
                    internalSession.ongoingStreamSpeakIntentionExtracted = StreamSpeakIntentionState.SPOKE;
                }
            } else if ("agent_end" == event.type) {
                this.logger.info(JSON.stringify(event, null, 2));
                this.logger.info("Received event of type " + event.type + " for session " + internalSession.id);
                let lastUserMessageIndex = -1;
                for (let messageIndex = event.messages.length - 1; messageIndex >= 0; messageIndex--) {
                    if (event.messages[messageIndex]?.role == "user") {
                        lastUserMessageIndex = messageIndex;
                        break;
                    }
                }
                internalSession.ongoingStreamSpeakIntentionExtracted = StreamSpeakIntentionState.WAIT_FOR_TAG;
                let relevantMessages = lastUserMessageIndex == -1 ? event.messages : event.messages.slice(lastUserMessageIndex + 1);
                let assistantMessages = relevantMessages.filter((message: any) => ["assistant", "toolResult"].includes(message.role));
                let contentIntentionText = null;
                let intentionContext = this.intentionContextService.getIntentionContext(assistantMessages)
                if (intentionContext.contentIntention !== undefined) {
                    internalSession.workspace = intentionContext.contentIntention.text;
                    contentIntentionText = intentionContext.contentIntention.text;
                    this.clientServerSynchronization.setRecord("session-" + internalSession.id, "workspace", intentionContext.contentIntention.text);
                }

                if (intentionContext.speakIntention !== undefined 
                        && intentionContext.speakIntention.text.trim() !== "") {
                    this.addMessageToSession(
                        intentionContext.speakIntention.text, 
                        contentIntentionText,
                        internalSession, 
                        AgentSessionMessageType.ASSISTANT);
                }

                if (intentionContext.longTermMemoryIntention !== undefined 
                        && intentionContext.longTermMemoryIntention.text.trim() != "") {
                    try {
                        this.appendToFile(intentionContext.longTermMemoryIntention.text, "LONGTERMMEMORY.md");
                        console.log('File updated successfully.');
                    } catch {
                        console.log('Error writting to long term memory file.');
                    }
                }
                
                if (intentionContext.waitIntention !== undefined) {
                    internalSession.conversation = ConversationStatus.WAIT;
                    this.addMessageToSession(
                        "Just proceed...",
                        null,
                        internalSession,
                        AgentSessionMessageType.PROCEEDING_INFORMATION);
                } else if (intentionContext.conversationIntention === undefined) {
                    internalSession.conversation = ConversationStatus.NO_CONVERSATION;
                } else {
                    internalSession.conversation = ConversationStatus.ONGOING;
                    this.addMessageToSession(
                        "Go on...",
                        null,
                        internalSession,
                        AgentSessionMessageType.PROCEEDING_INFORMATION);
                }
            }
        });
        session.setSteeringMode("all");
        let interimMessage = {
            role: "assistant",
            content: [{
                type: "text",
                text: "..."
            }],
            api: "openapi-completion",
            provider: "google",
            model: "gemma3",
            stopReason: "stop",
            usage: {
                input: 1,
                output: 1,
                cacheRead: 1,
                cacheWrite: 1,
                totalTokens: 1,
                cost: {
                    input: 1,
                    output: 1,
                    cacheRead: 1,
                    cacheWrite: 1,
                    total: 1,
                }
            }
        };
        session.agent.steer({
            ...interimMessage,
            timestamp: Date.now()
        } as AssistantMessage);
        await session.steer(
            await this.getFileContent("INTENTION.md") + "\n" +
            await this.getFileContent("OWNER.md") + "\n" +
            await this.getFileContent("SOUL.md") + "\n" +
            await this.getFileContent("AGENTS.md") + "\n" +
            "Here is context information which is maybe needed: " + (await this.getFileContent("LONGTERMMEMORY.md"))
        );
        session.agent.steer({
            ...interimMessage,
            timestamp: Date.now()
        } as AssistantMessage);
        this.logger.info("Steered session");
        return internalSession;
    }

    private addSession(newAgentSession: AgentSession, text: string, workspace: string | null): InternalAgentSessionProvisioning {
        this.logger.info("Trying to add session")
        let newSession = {
            id: uuidv7().toString(),
            agentSession: newAgentSession,
            timestamp: Date.now(),
            workspace: "New Session",
            messages: [],
            title: text.slice(0, 50) + "…",
            ongoingStreamSpeakIntentionExtracted: StreamSpeakIntentionState.WAIT_FOR_TAG,
            conversation: ConversationStatus.NO_CONVERSATION
        } as InternalAgentSessionProvisioning;
        this.logger.info("Adding session " + newSession.id);
        this.agentSessions.push(newSession);
        this.logger.info("Decomposing session");
        const { agentSession, messages, ...provisioningOnly } = newSession;
        this.logger.info("Send session to client: " + JSON.stringify(provisioningOnly));
        this.clientServerSynchronization.addListEntry("sessions", "session-" + newSession.id, provisioningOnly as AgentSessionProvisioning);
        this.addMessageToSession(text, workspace, newSession, AgentSessionMessageType.USER_TEXT_INPUT);
        return newSession
    }
}
