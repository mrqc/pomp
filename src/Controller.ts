import {ClientServerSynchronization} from "./ClientServerSynchronization.ts";
import {DatabaseConnector} from "./DatabaseConnector.ts";

export class Controller {
    clientServerSynchronization: ClientServerSynchronization;
    databaseConnector: DatabaseConnector;
    private recordName: string;

    constructor(clientServerSynchronization: ClientServerSynchronization, 
                databaseConnector: DatabaseConnector,
                recordName: string) {
        this.clientServerSynchronization = clientServerSynchronization;
        this.databaseConnector = databaseConnector;
        this.recordName = recordName;
    }
    
    subscribeControllerRecord(variableName: string, callback: (value: any) => void) {
        this.clientServerSynchronization.subscribe(this.recordName, variableName, callback);
    }
    
    async setControllerRecordConfiguration(variableName: string, value: any) {
        await this.databaseConnector.setConfig(this.recordName, variableName, value);
    }

    async getControllerRecordStringConfiguration(variableName: string): Promise<string> {
        return await this.databaseConnector.getStringConfig(this.recordName, variableName);
    }

    async getControllerRecordStringArrayConfiguration(variableName: string): Promise<string[]> {
        return await this.databaseConnector.getStringArrayConfig(this.recordName, variableName);
    }

    async getControllerRecordIntegerConfiguration(variableName: string): Promise<number> {
        return await this.databaseConnector.getIntegerConfig(this.recordName, variableName);
    }

    async getControllerRecordFloatConfiguration(variableName: string): Promise<number> {
        return await this.databaseConnector.getFloatConfig(this.recordName, variableName);
    }

    async getControllerRecordBooleanConfiguration(variableName: string): Promise<boolean> {
        return await this.databaseConnector.getBooleanConfig(this.recordName, variableName);
    }
    
}
