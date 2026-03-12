import {InternalLogger} from "./LogConfig.js";
import {
    AgentSession,
    AuthStorage,
    bashTool,
    createAgentSession,
    type CreateAgentSessionResult,
    DefaultResourceLoader,
    ModelRegistry,
    readTool,
    SessionManager
} from "@mariozechner/pi-coding-agent";
import {fileURLToPath} from "url";
import path from "path";
import type {TextToSpeech} from "./TextToSpeech.ts";
import type {Message, TextContent} from "@mariozechner/pi-ai/dist/types";
import {uuidv7} from "uuidv7";
import {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {DatabaseConnector} from "./DatabaseConnector.ts";
import {Controller} from "./Controller.ts";
import type { ProviderConfigInput } from "./mapper/ProviderConfigInput.ts";
import {Mutex} from "es-toolkit";
import type {Api} from "@mariozechner/pi-ai";
import type {AudioRecording} from "./AudioRecording.ts";
import type {SpeechToText} from "./SpeechToText.ts";
import {join} from "node:path";
import {readFile} from "node:fs/promises";

interface InternalAgentSession {
    id: string;
    agentSession: AgentSession;
    timestamp: number;
}

interface ExternalAgentSession {
    id: string,
    title: string,
    content: ExternalAgentMessage[]
}

interface ExternalAgentMessage {
    id: string,
    text: string,
    timestamp: number;
}

interface Intention {
    tagName: string,
    content: string
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentsController extends Controller {
    private logger = new InternalLogger(__filename);
    private internalAgentSessions: InternalAgentSession[] = [];
    private externalAgentSessions: ExternalAgentSession[] = [];
    private textToSpeech: TextToSpeech;
    private authStorage = new AuthStorage();
    private modelRegistry = new ModelRegistry(this.authStorage);
    private modelRegistryMutex: Mutex = new Mutex();
    
    private async getFileContent(filename: string): Promise<string> {
        const contextPath = join(__dirname, "..", filename);
        const contextContent = await readFile(contextPath, "utf-8");
        return contextContent;
    }

    private loader = new DefaultResourceLoader({
        cwd: process.cwd(),
        extensionFactories: [
            (pi) => {
                pi.on("before_agent_start", async (event, ctx) => {
                    return {
                        message: {
                            customType: "IntentionContextInformation",
                            content: await this.getFileContent("INTENTION.md") + "\n" 
                                + await this.getFileContent("OWNER.md") + "\n"
                                + await this.getFileContent("SOUL.md"),
                            display: true
                        },
                    };
                });
            }]
    });

    constructor(textToSpeech: TextToSpeech, clientServerSynchronization: ClientServerSynchronization, databaseConnector: DatabaseConnector) {
        super(clientServerSynchronization, databaseConnector, "AgentsController");
        this.textToSpeech = textToSpeech;
    }
    
    async init() {
        await this.registerProvider();
        await this.loadSkills();
        await this.loadConfigsAndSubscribe();
    }
    
    private async loadConfigsAndSubscribe() {
        let providers = await this.databaseConnector.getLLMProvider();
        this.setControllerRecordVariable("llmProviders", providers)
        this.subscribeControllerRecordVariable("llmProviders", async (value: any) => {
            this.logger.info("Received LLM providers config update")
            if (Array.isArray(value)) {
                await this.databaseConnector.deleteAllLLMProviders();
                for (let i = 0; i < value.length; i++) {
                    const providerConfig = value[i];
                    const id = i;
                    await this.databaseConnector.saveLLMProvider(id, providerConfig);
                }
                this.logger.info(`Stored ${value.length} LLM provider(s) from config update.`);
                await this.modelRegistryMutex.acquire();
                try {
                    this.modelRegistry = new ModelRegistry(this.authStorage);
                    await this.registerProvider();
                } finally {
                    this.modelRegistryMutex.release();
                }
                this.sendInfo(`Stored ${value.length} LLM provider(s) from config update.`);
            } else {
                this.logger.error("LLM Providers config update did not provide an array of ProviderConfigInput");
                this.sendError("Unable to store LLM provider(s).")
            }
        });
    }
    
    public async startSessionByActivationWordSession(text: string) {
        let llmProvider = await this.databaseConnector.getLLMProvider();
        let models = llmProvider ? llmProvider.flatMap(provider => provider.models || []) : [];
        if (llmProvider == null || llmProvider.length == 0 || models.length == 0) {
            this.textToSpeech.say("Sorry, but there are no LLM providers or models registered.");
            return;
        }
        var session: AgentSession | null = null;
        try {
            await this.modelRegistryMutex.acquire();
            let sessionCreationResult = await createAgentSession({
                tools: [readTool, bashTool],
                resourceLoader: this.loader,
                sessionManager: SessionManager.inMemory(),
                authStorage: this.authStorage,
                modelRegistry: this.modelRegistry,
            });
            session = sessionCreationResult.session;
        } finally {
            this.modelRegistryMutex.release();
        }
        if (session == null) {
            return;
        }
        let internalSession = this.addSession(session, text)
        session.subscribe((event) => {
            if ("agent_end" == event.type) {
                this.logger.info(JSON.stringify(event, null, 2));
                let messages: Message[] = event.messages.filter((message) => message.role == "assistant");
                let overallResponseContent = "";
                overallResponseContent = this.extractTextFromResponse(messages, overallResponseContent);
                let intentions = this.getIntentionContents(overallResponseContent);
                let speakIntention = intentions.filter((intention) => intention.tagName == "SPEAK")[0]
                let contentIntention = intentions.filter((intention) => intention.tagName == "CONTENT")[0]
                overallResponseContent = this.removeIntentionContents(overallResponseContent);
                this.logger.info("intentions: " + JSON.stringify(intentions))
                if (contentIntention !== undefined) {
                    this.clientServerSynchronization.loadRecordValue("SpeechContext", "content", contentIntention.content);
                }
                if (speakIntention !== undefined) {
                    this.textToSpeech.say(speakIntention.content);
                }
            }
        });
        this.logger.info("Providing prompt " + text + " to session")
        await session.prompt(text)
    }

    private removeIntentionContents(textToSay: string) {
        return textToSay.replace(/\[([a-zA-Z0-9_-]+)\]([\s\S]*?)\[\/\1\]/g, "");
    }

    private getIntentionContents(content: string): Intention[] {
        const regex = /\[([a-zA-Z0-9_-]+)\]([\s\S]*?)\[\/\1\]/g;
        
        return Array.from(content.matchAll(regex), match => ({
            tagName: match[1],
            content: match[2]
        } as Intention));
    }

    private extractTextFromResponse(messages: Message[], textToSay: string) {
        for (let message of messages) {
            if (Array.isArray(message.content)) {
                let contents = message.content.filter((content: { type: string; }) => content.type == "text");
                for (let content of contents) {
                    textToSay += (content as TextContent).text + " ";
                }
            }
        }
        return textToSay;
    }

    private addSession(session: AgentSession, text: string): InternalAgentSession {
        let internalSession = {
            id: uuidv7().toString(),
            agentSession: session,
            timestamp: Date.now()
        };
        this.internalAgentSessions.push(internalSession);
        let externalSession = {
            id: uuidv7().toString(),
            title: text.slice(0, 50) + "…",
            content: []
        }
        this.externalAgentSessions.push(externalSession)
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
