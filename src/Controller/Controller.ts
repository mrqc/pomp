import {DatabaseConnector} from "../DatabaseConnector.ts";

export class Controller {
    databaseConnector: DatabaseConnector;

    constructor(databaseConnector: DatabaseConnector) {
        this.databaseConnector = databaseConnector;
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
