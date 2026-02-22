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
                name varchar (40) primary key, 
                value text not null
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
        
        await this.ensureIntConfig('RecordingSampleRate', 16000); //SAMPLE_RATE
        await this.ensureIntConfig('DefaultRecordingDuration', 3000); //DEFAULT_RECORD_DURATION
        await this.ensureIntConfig('StopWaitingRecordDuration', 600); //STOP_WAITING_RECORD_DURATION
        await this.ensureIntConfig('SecondsToLooseText', 10); //SECONDS_TO_LOOSE_TEXT
        await this.ensureStringConfig('WhisperModelName', 'small.en');
        await this.ensureBoolConfig('WhisperWithCuda', true);
        await this.ensureIntConfig('WhisperTimestampsLength', 2);
        await this.ensureBoolConfig('WhisperSplitOnWord', false);
        await this.ensureBoolConfig('WhisperTranslateToEnglish', false);
        await this.ensureFloatConfig('KokoroTTSSpeed', 1.4);
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
    
    public async getConfig(name: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.get(
                `select value 
                    from Configuration 
                    where name = ?`,
                [name],
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
    
    private async ensureStringConfig(name: string, value: string) {
        await this.database.exec(`
            insert or ignore into Configuration (
                name,
                value
            ) values (
                '${name}',
                '${value}'
            )
        `);
    }

    private async ensureIntConfig(name: string, value: number) {
        await this.database.exec(`
            insert or ignore into Configuration (
                name,
                value
            ) values (
                '${name}',
                '${value.toFixed(0)}'
            )
        `);
    }

    private async ensureFloatConfig(name: string, value: number) {
        await this.database.exec(`
            insert or ignore into Configuration (
                name,
                value
            ) values (
                '${name}',
                '${value.toFixed(4)}'
            )
        `);
    }

    private async ensureBoolConfig(name: string, value: boolean) {
        await this.database.exec(`
            insert or ignore into Configuration (
                name,
                value
            ) values (
                '${name}',
                '${value.toString()}'
            )
        `);
    }

    public close() {
        this.database.close();
    }
}
