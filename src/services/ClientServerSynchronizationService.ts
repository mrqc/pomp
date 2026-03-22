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

    private static instance: ClientServerSynchronizationService;

    private server = new Deepstream();
    private client = new DeepstreamClient("localhost:6020")
    private static logger = new InternalLogger(__filename);

    private constructor() {
        ClientServerSynchronizationService.logger.info("Starting stream server...");
        this.server.start();
    }
    
    public static getInstance(): ClientServerSynchronizationService {
        if (!ClientServerSynchronizationService.instance) {
            ClientServerSynchronizationService.instance = new ClientServerSynchronizationService();
        }
        return ClientServerSynchronizationService.instance;
    }

    async init() {
        await this.client.login()
    }
    
    loadRecordValue(recordName: string, variableName: string, value: any) {
        try {
            let record = this.client.record.getRecord(recordName);
            record.whenReady((record) => {
                ClientServerSynchronizationService.logger.info("Setting value '" + JSON.stringify(value) + "' for variable " + variableName + " on record " + recordName)
                record.set(variableName, value);
                ClientServerSynchronizationService.logger.info("Value '" + JSON.stringify(record.get(variableName)) + "' for variable " + variableName + " set on record " + recordName)
            });
        } catch (error) {
            ClientServerSynchronizationService.logger.error("Error setting value '" + value + "' for variable " + variableName + " on record " + recordName + ": " + error)
        }
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
