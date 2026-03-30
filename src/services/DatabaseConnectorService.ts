import sqlite3 from 'sqlite3';
import {InternalLogger} from "../LogConfig.ts";
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseConnectorService {
    private static instance: DatabaseConnectorService;
    private logger = new InternalLogger(__filename);
    private database = new sqlite3.Database('./database.sqlite', (error: Error | null) => {
        if (error) {
            this.logger.error("Could not open database: " + error)
        } else {
            this.logger.info("Database opened")
        }
    });

    public async migrate() {
        await this.database.exec(`
            create table if not exists Configuration (
                recordName varchar (40), 
                variableName varchar (40), 
                value text not null,
                primary key (recordName, variableName)
            )
        `);

        await this.database.exec(`
            create table if not exists LLMProvider (
                id integer primary key autoincrement,
                name varchar (40) unique, 
                baseUrl text not null,
                apiKey text not null,
                api text not null,
                status text check(status in ('active', 'inactive')) not null
            )
        `);
        
        await this.database.exec(`
            create table if not exists LLMProviderModel (
                id integer primary key autoincrement,
                llmProviderId integer not null,
                modelId text not null,
                modelName text not null,
                reasoning integer not null,
                inputType text not null,
                costInput real not null,
                costOutput real not null,
                costCacheRead real not null,
                costCacheWrite real not null,
                contextWindow integer not null,
                maxTokens integer not null,
                status text check(status in ('active', 'inactive')) not null,
                foreign key (llmProviderId) references llmProvider(id),
                unique(llmProviderId, modelId)
            )
        `);
        await this.ensureIntConfig('AudioRecording', 'sampleRate', 16000);
        await this.ensureFloatConfig('AudioRecording', 'defaultRecordingDuration', 0.25);
        await this.ensureIntConfig('SpeechToText', 'secondsToLooseText', 10);
        await this.ensureStringConfig('SpeechToText', 'activationKeywords', "buddy");
        await this.ensureStringConfig('SpeechToText', 'modelName', 'tiny.en');
        await this.ensureBoolConfig('SpeechToText', 'splitOnWord', false);
        await this.ensureBoolConfig('SpeechToText', 'translateToEnglish', false);
        await this.ensureFloatConfig('TextToSpeech', 'textSpeed', 1.3);
        await this.ensureStringConfig('TextToSpeech', 'modelId', 'onnx-community/Kokoro-82M-v1.0-ONNX');
    }
    
    public async getLLMProvider(): Promise<any[] | null> {
        return new Promise((resolve, reject) => {
            this.database.all(
                `select * from LLMProvider`,
                [],
                async (error: Error | null, rows: any[]) => {
                    if (error) {
                        this.logger.error("Error fetching llm providers: " + error);
                        reject(error);
                    } else {
                        try {
                            if (rows && rows.length > 0) {
                                const promises = rows.map(async row => {
                                    try {
                                        row.models = await this.getLLMProviderModels(row.id) || [];
                                    } catch (err) {
                                        this.logger.error(`Failed to load models for provider ${row.id}: ${err}`);
                                        row.models = [];
                                    }
                                });
                                await Promise.all(promises);
                                resolve(rows);
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            this.logger.error("Error processing llm providers: " + e);
                            reject(e);
                        }
                    }
                }
            );
        })
    }
    
    public async getLLMProviderModels(llmProviderId: number): Promise<any[] | null> {
        return new Promise((resolve, reject) => {
            this.database.all(
                `select * 
                    from LLMProviderModel
                    where llmProviderId = ?`,
                [llmProviderId],
                (error: Error | null, rows: any[]) => {
                    if (error) {
                        this.logger.error("Error fetching llm provider models: " + error);
                        reject(error);
                    } else {
                        resolve(rows && rows.length > 0 ? rows : null);
                    }
                }
            );
        });
    }
    
    public async getStringConfig(recordName: string, variableName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value
                    from Configuration
                    where variableName = ?
                        and recordName = ?`,
                [variableName, recordName],
                (error: string, row: { value: unknown; }) => {
                    if (error) {
                        this.logger.error("Error fetching config: " + error);
                        reject(error);
                    } else {
                        resolve(row ? row.value : null);
                    }
                }
            );
        });
    }

    public async getIntegerConfig(recordName: string, variableName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value
                    from Configuration
                    where variableName = ?
                        and recordName = ?`,
                [variableName, recordName],
                (error: string, row: { value: unknown; }) => {
                    if (error) {
                        this.logger.error("Error fetching config: " + error);
                        reject(error);
                    } else {
                        if (typeof row.value === "string") {
                            resolve(row ? parseInt(row.value) : null);
                        } else {
                            reject(`Error: Value ${row.value} is not an integer`);
                        }
                    }
                }
            );
        });
    }

    public async getFloatConfig(recordName: string, variableName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value
                    from Configuration
                    where variableName = ?
                        and recordName = ?`,
                [variableName, recordName],
                (error: string, row: { value: unknown; }) => {
                    if (error) {
                        this.logger.error("Error fetching config: " + error);
                        reject(error);
                    } else {
                        if (typeof row.value === "string") {
                            resolve(row ? parseFloat(row.value) : null);
                        } else {
                            reject(`Error: Value ${row.value} is not a float`);
                        }
                    }
                }
            );
        });
    }

    public async getBooleanConfig(recordName: string, variableName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value
                    from Configuration
                    where variableName = ?
                        and recordName = ?`,
                [variableName, recordName],
                (error: string, row: { value: unknown; }) => {
                    if (error) {
                        this.logger.error("Error fetching config: " + error);
                        reject(error);
                    } else {
                        if (typeof row.value === "string") {
                            resolve(row ? JSON.parse(row.value) : null);
                        } else {
                            reject(`Error: Value ${row.value} is not a boolean`);
                        }
                    }
                }
            );
        });
    }

    async getStringArrayConfig(recordName: string, variableName: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value
                    from Configuration
                    where variableName = ?
                        and recordName = ?`,
                [variableName, recordName],
                (error: string, row: { value: unknown; }) => {
                    if (error) {
                        this.logger.error("Error fetching config: " + error);
                        reject(error);
                    } else {
                        if (typeof row.value === "string") {
                            resolve(row ? 
                                row.value.split(",")
                                    .map((aKeyword: string) => aKeyword.trim()) 
                                : []);
                        } else {
                            reject(`Error: Value ${row.value} is not string values separated by ,`);
                        }
                    }
                }
            );
        });
    
    }
    
    private async ensureStringConfig(recordName: string, variableName: string, value: string) {
        await this.database.exec(`
            insert or ignore into Configuration (
                recordName,
                variableName,
                value
            ) values (
                '${recordName}',
                '${variableName}',
                '${value}'
            )
        `);
    }

    private async ensureIntConfig(recordName: string, variableName: string, value: number) {
        await this.database.exec(`
            insert or ignore into Configuration (
                recordName,
                variableName,
                value
            ) values (
                '${recordName}',
                '${variableName}',
                '${value.toFixed(0)}'
            )
        `);
    }

    private async ensureFloatConfig(recordName: string, variableName: string, value: number) {
        await this.database.exec(`
            insert or ignore into Configuration (
                recordName,
                variableName,
                value
            ) values (
                '${recordName}',
                '${variableName}',
                '${value.toFixed(4)}'
            )
        `);
    }

    private async ensureBoolConfig(recordName: string, variableName: string, value: boolean) {
        await this.database.exec(`
            insert or ignore into Configuration (
                recordName,
                variableName,
                value
            ) values (
                '${recordName}',
                '${variableName}',
                '${value.toString()}'
            )
        `);
    }

    public async setConfig(recordName: string, variableName: string, value: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.run(
                `insert or replace into Configuration (recordName, variableName, value) values (?, ?, ?)`,
                [recordName, variableName, value],
                (error: Error | null) => {
                    if (error) {
                        this.logger.error("Error setting config: " + error);
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    public async saveLLMProvider(providerId: number, providerConfig: any): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const name = providerConfig.name || `provider_${providerId}`;
            const baseUrl = providerConfig.baseUrl || '';
            const apiKey = providerConfig.apiKey || '';
            const api = providerConfig.api || '';
            const status = providerConfig.status || 'active';
            this.database.run(
                `insert or replace into LLMProvider (id, name, baseUrl, apiKey, api, status) values (?, ?, ?, ?, ?, ?)`,
                [providerId, name, baseUrl, apiKey, api, status],
                (error: Error | null) => {
                    if (error) {
                        this.logger.error("Error saving LLMProvider: " + error);
                        reject(error);
                        return;
                    }
                    // Upsert models if present
                    if (Array.isArray(providerConfig.models)) {
                        const modelOps = providerConfig.models.map((model: any, idx: number) => {
                            return new Promise<void>((res, rej) => {
                                const id = idx;
                                const modelId = model.modelId;
                                const modelName = model.modelName;
                                const reasoning = model.reasoning ? 1 : 0;
                                const inputType = model.inputType;
                                const costInput = model.costInput ?? 0;
                                const costOutput = model.costOutput ?? 0;
                                const costCacheRead = model.costCacheRead ?? 0;
                                const costCacheWrite = model.costCacheWrite ?? 0;
                                const contextWindow = model.contextWindow ?? 0;
                                const maxTokens = model.maxTokens ?? 0;
                                const status = model.status || 'active';
                                this.database.run(
                                    `insert or replace into LLMProviderModel (id, llmProviderId, modelId, modelName, reasoning, inputType, costInput, costOutput, costCacheRead, costCacheWrite, contextWindow, maxTokens, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [id, providerId, modelId, modelName, reasoning, inputType, costInput, costOutput, costCacheRead, costCacheWrite, contextWindow, maxTokens, status],
                                    (err: Error | null) => {
                                        if (err) {
                                            this.logger.error("Error saving LLMProviderModel: " + err);
                                            rej(err);
                                        } else {
                                            res();
                                        }
                                    }
                                );
                            });
                        });
                        Promise.all(modelOps)
                            .then(() => resolve())
                            .catch(reject);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    public async deleteAllLLMProviders(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.exec(`
                delete from LLMProviderModel;
                delete from LLMProvider;
            `, (error: Error | null) => {
                if (error) {
                    this.logger.error("Error deleting all LLM providers: " + error);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    public close() {
        this.database.close();
    }

    static getInstance() {
        if (!DatabaseConnectorService.instance) {
            DatabaseConnectorService.instance = new DatabaseConnectorService();
        }
        return DatabaseConnectorService.instance;
    }
}
