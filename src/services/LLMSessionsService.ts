import {
    type AgentSession,
    AuthStorage,
    bashTool,
    createAgentSession,
    DefaultResourceLoader,
    ModelRegistry,
    readTool,
    SessionManager
} from "@mariozechner/pi-coding-agent";
import type {ProviderConfigInput} from "../mapper/ProviderConfigInput.ts";
import {InternalLogger} from "../LogConfig.ts";
import {DatabaseConnectorService} from "./DatabaseConnectorService.ts";
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LLMSessionsService {
    private authStorage = new AuthStorage();
    private modelRegistry = new ModelRegistry(this.authStorage);
    private loader = new DefaultResourceLoader({ cwd: process.cwd() });
    private logger = new InternalLogger(__filename);
    private databaseConnector: DatabaseConnectorService = DatabaseConnectorService.getInstance();

    public async init() {
        await this.loadSkills();
        this.modelRegistry = new ModelRegistry(this.authStorage);
    }

    async getNewSession(): Promise<AgentSession> {
        let sessionCreationResult = await createAgentSession({
            tools: [readTool, bashTool],
            resourceLoader: this.loader,
            sessionManager: SessionManager.inMemory(),
            authStorage: this.authStorage,
            modelRegistry: this.modelRegistry,
        });
        return sessionCreationResult.session;
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
    
    async isLLMProviderAndModelsConfigured(): Promise<Boolean> {
        let llmProviders = await this.databaseConnector.getLLMProvider();
        let allModels = llmProviders ? llmProviders.flatMap(provider => provider.models || []) : [];
        if (llmProviders == null || llmProviders.length == 0 || allModels.length == 0) {
            return false;
        }
        return true;
    }
}
