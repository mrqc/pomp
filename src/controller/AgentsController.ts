import {InternalLogger} from "../LogConfig.js";
import {
    AgentSession,
    AuthStorage,
    bashTool,
    createAgentSession,
    DefaultResourceLoader,
    ModelRegistry,
    readTool,
    SessionManager
} from "@mariozechner/pi-coding-agent";
import {fileURLToPath} from "url";
import path from "path";
import type {TextToSpeechController} from "./TextToSpeechController.ts";
import type {Message, TextContent} from "@mariozechner/pi-ai/dist/types";
import {uuidv7} from "uuidv7";
import {ClientServerSynchronizationService} from "../services/ClientServerSynchronizationService.ts";
import {DatabaseConnectorService} from "../services/DatabaseConnectorService.ts";
import type { ProviderConfigInput } from "../mapper/ProviderConfigInput.ts";
import {Mutex} from "es-toolkit";
import {join} from "node:path";
import {readFile} from "node:fs/promises";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {type IntentionContext, IntentionContextService} from "../text-processing/IntentionContext.ts";

enum InternalAgentSessionType {
    MAIN
}

interface InternalAgentSession {
    id: string;
    agentSession: AgentSession;
    timestamp: number;
    type: InternalAgentSessionType,
    index: number
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
    private authStorage = new AuthStorage();
    private modelRegistry = new ModelRegistry(this.authStorage);
    private modelRegistryMutex: Mutex = new Mutex();
    
    private async getFileContent(filename: string): Promise<string> {
        const filepath = join(__dirname, "..", filename);
        return await readFile(filepath, "utf-8");
    }

    private loader = new DefaultResourceLoader({
        cwd: process.cwd()
    });

    constructor(textToSpeech: TextToSpeechController) {
        this.textToSpeech = textToSpeech;
    }
    
    async init() {
        await this.registerProvider();
        await this.loadSkills();
        await this.loadConfigsAndSubscribe();
    }
    
    private async loadConfigsAndSubscribe() {
        let providers = await this.databaseConnector.getLLMProvider();
        this.clientServerSynchronization.loadRecordValue("AgentsController", "llmProviders", providers);
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
                    this.modelRegistry = new ModelRegistry(this.authStorage);
                    await this.registerProvider();
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
    
    public async startSessionByActivationWord(text: string) {
        let llmProviders = await this.databaseConnector.getLLMProvider();
        let allModels = llmProviders ? llmProviders.flatMap(provider => provider.models || []) : [];
        if (llmProviders == null || llmProviders.length == 0 || allModels.length == 0) {
            this.textToSpeech.say("Sorry, but there are no LLM providers or models registered.");
            return;
        }
        let session: AgentSession | undefined = undefined;
        try {
            await this.modelRegistryMutex.acquire();
            session = this.internalAgentSessions
                .filter((anInternalSession) => 
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
        let sessionCreationResult = await createAgentSession({
            tools: [readTool, bashTool],
            resourceLoader: this.loader,
            sessionManager: SessionManager.inMemory(),
            authStorage: this.authStorage,
            modelRegistry: this.modelRegistry,
        });
        let session = sessionCreationResult.session;
        if (session == null) {
            return;
        }
        let internalSession = this.addSession(session, text)
        session.subscribe((event) => {
            if ("agent_end" == event.type) {
                this.logger.info(JSON.stringify(event, null, 2));
                let lastUserMessageIndex = -1;
                for (let i = event.messages.length - 1; i >= 0; i--) {
                    if (event.messages[i]?.role == "user") {
                        lastUserMessageIndex = i;
                        break;
                    }
                }
                let relevantMessages = lastUserMessageIndex != -1 ? event.messages.slice(lastUserMessageIndex + 1) : event.messages;
                let messages = relevantMessages.filter((message: any) => message.role == "assistant");
                let intentionContext = this.intentionContextService.getIntentionContext(messages)
                this.logger.info("intentions: " + JSON.stringify(intentionContext))
                if (intentionContext.content !== undefined) {
                    externalSession.workspace = intentionContext.content.text
                    this.clientServersynchronization.updateList("Sessions", "list", this.externalAgentSessions)
                    this.clientServerSynchronization.sendEvent("workspace-changed", {
                        sessionId: externalSession.id,
                        workspace: intentionContext.content
                    });
                }
                if (intentionContext.speak !== undefined) {
                    this.logger.info(intentionContext.speak.text)
                    this.textToSpeech.say(intentionContext.speak.text);
                    let newMessage = {
                        id: uuidv7().toString(),
                        text: intentionContext.speak.text,
                        timestamp: Date.now()
                    } as ExternalAgentMessage
                    externalSession.content.push(newMessage)
                    this.clientServerSynchronization.sendEvent("new-message", {
                        sessionId: externalSession.id,
                        message: newMessage
                    })
                }
            }
        });
        session.setSteeringMode("all");
        await session.steer(await this.getFileContent("INTENTION.md"))
        await session.steer(await this.getFileContent("OWNER.md"))
        await session.steer(await this.getFileContent("SOUL.md"))
        this.logger.info("Providing prompt " + text + " to session")
        return session;
    }

    private addSession(session: AgentSession, text: string): InternalAgentSession {
        let internalSession = {
            id: uuidv7().toString(),
            agentSession: session,
            timestamp: Date.now(),
            type: InternalAgentSessionType.MAIN,
            index: this.internalAgentSessions.length
        };
        this.internalAgentSessions.push(internalSession);
        let externalSession = {
            id: uuidv7().toString(),
            title: text.slice(0, 50) + "…",
            content: [],
            index: this.internalAgentSessions.length,
            workspace: "New Session"
        }
        this.logger.info("Adding session " + JSON.stringify(externalSession));
        this.clientServerSynchronization.loadRecordValue("Sessions", "list", this.externalAgentSessions);
        return internalSession
    }
    
    async loadSkills() {
        await this.loader.reload();
        this.logger.info("Skills:")
        this.loader.getSkills().skills.forEach(skill => {
            this.logger.info('- ' + skill.name)
        })
        this.logger.info("Extensions:")
        this.loader.getExtensions().extensions.forEach(extension => {
            this.logger.info('- ' + extension.path)
        })
    }
    
    async registerProvider() {
        let llmProvider = await this.databaseConnector.getLLMProvider();
        if (llmProvider == null) {
            return;
        }
        
        for (let provider of llmProvider) {
            let models = []
            for (let llmProviderModel of provider.models) {
                let model = {
                    id: llmProviderModel.modelId,
                    name: llmProviderModel.modelName,
                    reasoning: llmProviderModel.reasoning,
                    input: llmProviderModel.inputType.split(","),
                    cost: {
                        input: llmProviderModel.costInput,
                        output: llmProviderModel.costOutput,
                        cacheRead: llmProviderModel.costCacheRead,
                        cacheWrite: llmProviderModel.costCacheWrite
                    },
                    contextWindow: llmProviderModel.contextWindow,
                    maxTokens: llmProviderModel.maxTokens
                }
                models.push(model)
            }
            let providerConfigInput: ProviderConfigInput = {
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
                api: provider.api,
                models: models
            };
            this.modelRegistry.registerProvider(provider.name, providerConfigInput);
        }
    }
}
