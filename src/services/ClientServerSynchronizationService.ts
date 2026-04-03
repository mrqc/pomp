import {Deepstream} from '@deepstream/server';
import {fileURLToPath} from "url";
import path from "node:path";
import {InternalLogger} from "../LogConfig.ts";
import {DeepstreamClient} from "@deepstream/client";
import type {FailureEvent} from '../events/FailureEvent.ts';
import type {InfoEvent} from "../events/InfoEvent.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ClientServerSynchronizationService {

    private server = new Deepstream();
    private client = new DeepstreamClient("localhost:6020")
    private static logger = new InternalLogger(__filename);

    private constructor() {
        ClientServerSynchronizationService.logger.info("Starting stream server...");
        this.server.start();
    }

    public static getInstance(): ClientServerSynchronizationService {
        if (!(globalThis as any).clientServerSynchronizationServiceInstance) {
            (globalThis as any).clientServerSynchronizationServiceInstance = new ClientServerSynchronizationService();
        }
        return (globalThis as any).clientServerSynchronizationServiceInstance;
    }

    async init() {
        await this.client.login()
    }

    async setRecord(recordName: string, variableName: string, value: any): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                let record = this.client.record.getRecord(recordName);
                record.whenReady((record) => {
                    try {
                        ClientServerSynchronizationService.logger.info("Setting value '" + JSON.stringify(value) + "' for variable " + variableName + " on record " + recordName)
                        record.set(variableName, value);
                        ClientServerSynchronizationService.logger.info("Value '" + JSON.stringify(record.get(variableName)) + "' for variable " + variableName + " set on record " + recordName)
                        resolve();
                    } catch (e) {
                        ClientServerSynchronizationService.logger.error("Error inside whenReady for record " + recordName + ": " + e);
                        reject(e);
                    }
                });
            } catch (error) {
                ClientServerSynchronizationService.logger.error("Error setting value '" + value + "' for variable " + variableName + " on record " + recordName + ": " + error)
                reject(error);
            }
        });
    }
    subscribeOnRecordVariable(recordName: string, variableName: string, callback: (value: any) => void) {
        try {
            let record = this.client.record.getRecord(recordName);
            record.subscribe(variableName, callback);
        } catch (error) {
            ClientServerSynchronizationService.logger.error("Error subscribing to variable " + variableName + " on record " + recordName + ": " + error)
        }
    }
    
    addListEntry(listName: string, entryName: string, value: any) {
        try {
            let record = this.client.record.getRecord(entryName);
            record.set(value);
            const list = this.client.record.getList(listName);
            list.addEntry(entryName);
        } catch (error) {
            ClientServerSynchronizationService.logger.error("Error adding entry " + entryName + " to list " + listName + ": " + error);
        }
    }
    
    subscribeOnEvent(eventName: string, callback: (data: any) => void) {
        this.client.event.subscribe(eventName, callback);
    }
    
    sendEvent(eventName: string, data: any) {
        this.client.event.emit(eventName, data);
    }

    sendGuiError(message: string) {
        this.sendEvent("error", {
            message
        } as FailureEvent)
    }
    
    sendGuiInfo(message: string) {
        this.sendEvent("info", {
            message
        } as InfoEvent)
    }
}
