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
    
    async getControllerRecordConfiguration(variableName: string) {
        return await this.databaseConnector.getConfig(this.recordName, variableName);
    }
    
}
