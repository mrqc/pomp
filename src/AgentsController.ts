import {InternalLogger} from "./LogConfig.js";
import {AgentSession, AuthStorage, bashTool, createAgentSession, DefaultResourceLoader, ModelRegistry, readTool, SessionManager} from "@mariozechner/pi-coding-agent";
import {fileURLToPath} from "url";
import path from "path";
import type {TextToSpeech} from "./TextToSpeech.ts";
import type {Message, TextContent} from "@mariozechner/pi-ai/dist/types";
import {uuidv7} from "uuidv7";
import {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {DatabaseConnector} from "./DatabaseConnector.ts";

export class InternalAgentSession {
    
    private agentSession: AgentSession;
    private timestamp: number;

    constructor(agentSession: AgentSession, timestamp: number) {
        this.agentSession = agentSession;
        this.timestamp = timestamp;
    }
    
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentsController {
    private logger = new InternalLogger(__filename);
    private internalAgentSessions: InternalAgentSession[] = [];
    private externalAgentSessions: ExternalAgentSession[] = [];
    private textToSpeech: TextToSpeech;
    private clientServerSynchronization: ClientServerSynchronization;
    private authStorage = new AuthStorage();
    private modelRegistry = new ModelRegistry(this.authStorage);
    private databaseConnector: DatabaseConnector;

    private loader = new DefaultResourceLoader({
        cwd: process.cwd(),
    });

    constructor(textToSpeech: TextToSpeech, clientServerSynchronization: ClientServerSynchronization, databaseConnector: DatabaseConnector) {
        this.textToSpeech = textToSpeech;
        this.clientServerSynchronization = clientServerSynchronization;
        this.databaseConnector = databaseConnector;
    }

    async init() {
        await this.registerProvider();
        await this.loadSkills();
    }
    
    public async startSessionByActivationWordSession(text: string) {
        const { session } = await createAgentSession({
            tools: [readTool, bashTool],
            resourceLoader: this.loader,
            sessionManager: SessionManager.inMemory(),
            authStorage: this.authStorage,
            modelRegistry: this.modelRegistry,
        });
        session.subscribe((event) => {
            if ("agent_end" == event.type) {
                this.logger.info(JSON.stringify(event, null, 2));
                let messages: Message[] = event.messages.filter((message) => message.role == "assistant");
                let textToSay = "";
                for (let message of messages) {
                    if (Array.isArray(message.content)) {
                        let contents = message.content.filter((content: { type: string; }) => content.type == "text");
                        for (let content of contents) {
                            textToSay += (content as TextContent).text + " ";
                        }
                    }
                }
                this.textToSpeech.say(textToSay);
            }
        });
        this.addSession(session, text)
        this.logger.info("Providing prompt " + text + " to session")
        await session.prompt(text)
    }
    
    private addSession(session: AgentSession, text: string) {
        let internalSession = new InternalAgentSession(
            session,
            Date.now()
        );
        this.internalAgentSessions.push(internalSession);
        let externalSession = {
            id: uuidv7().toString(),
            title: text.slice(0, 50) + "…",
            content: []
        }
        this.externalAgentSessions.push(externalSession)
        this.logger.info("Adding session " + JSON.stringify(externalSession));
        this.clientServerSynchronization.setValue("Sessions", "list", this.externalAgentSessions);
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
            this.modelRegistry.registerProvider(provider.name, {
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
                api: provider.api,
                models: provider.models
            });
        }
        
    }
}
