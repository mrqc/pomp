import sqlite3 from 'sqlite3';
import {InternalLogger} from "./LogConfig.ts";
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseConnector {

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
                id integer auto_increment primary key,
                name varchar (40) unique, 
                baseUrl text not null,
                apiKey text not null,
                apiText not null,
                status text check(status in ('active', 'inactive')) not null
            )
        `);
        await this.database.exec(`
            create table if not exists LLMProviderModel (
                id integer auto_increment primary key,
                llmProviderId varchar(40),
                modelId varchar(70) not null,
                modelNameText not null,
                reasoning integer not null,
                inputText not null,
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
        await this.ensureIntConfig('AudioRecording', 'defaultRecordingDuration', 3000);
        await this.ensureIntConfig('AudioRecording', 'stopWaitingRecordDuration', 600);
        await this.ensureIntConfig('SpeechToText', 'secondsToLooseText', 10);
        await this.ensureStringConfig('SpeechToText', 'activationKeywords', "buddy");
        await this.ensureStringConfig('SpeechToText', 'modelName', 'small.en');
        await this.ensureBoolConfig('SpeechToText', 'splitOnWord', false);
        await this.ensureBoolConfig('SpeechToText', 'translateToEnglish', false);
        await this.ensureFloatConfig('TextToSpeech', 'textSpeed', 1.4);
        await this.ensureStringConfig('TextToSpeech', 'modelId', 'onnx-community/Kokoro-82M-v1.0-ONNX');
    }
    
    public async getLLMProvider(): Promise<any[] | null> {
        return new Promise((resolve, reject) => {
            this.database.all(
                `select * from LLMProvider`,
                [],
                (error: Error | null, rows: any[]) => {
                    if (error) {
                        this.logger.error("Error fetching llm providers: " + error);
                        reject(error);
                    } else {
                        rows.map(async row => {
                            row.models = await this.getLLMProviderModels(row.id);
                        })
                        resolve(rows && rows.length > 0 ? rows : null);
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
    
    public async getConfig(recordName: string, variableName: string): Promise<any> {
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

    public close() {
        this.database.close();
    }
}
