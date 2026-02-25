import {Deepstream} from '@deepstream/server';
import {fileURLToPath} from "url";
import path from "node:path";
import {InternalLogger} from "./LogConfig.ts";
import {DeepstreamClient} from "@deepstream/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ClientServerSynchronization {

    private server = new Deepstream();
    private client = new DeepstreamClient("localhost:6020")
    private logger = new InternalLogger(__filename);

    constructor() {
        this.logger.info("Starting stream server...");
        this.server.start();
    }
    
    async init() {
        await this.client.login()
    }
    
    loadRecordValue(recordName: string, variableName: string, value: any) {
        try {
            let record = this.client.record.getRecord(recordName);
            record.whenReady((record) => {
                this.logger.info("Setting value '" + value + "' for variable " + variableName + " on record " + recordName)
                record.set(variableName, value);
                this.logger.info("Value '" + value + "' for variable " + variableName + " set on record " + recordName)
            });
        } catch (error) {
            this.logger.error("Error setting value '" + value + "' for variable " + variableName + " on record " + recordName + ": " + error)
        }
    }
    
    subscribeOnRecord(recordName: string, variableName: string, callback: (value: any) => void) {
        try {
            let record = this.client.record.getRecord(recordName);
            record.subscribe(variableName, callback);
        } catch (error) {
            this.logger.error("Error subscribing to variable " + variableName + " on record " + recordName + ": " + error)
        }
    }
    
    sendError(message: string) {
        this.client.event.emit("Errors", message);
    }
    
    sendInfo(message: string) {
        this.client.event.emit("Infos", message)
    }
}
