import { LitElement, html, css } from "lit";
import {ClientServerSynchronization} from "../service/ClientServerSynchronization.js";
import { toast, ToastKind } from 'lit-toaster';

export class ConfigurationPanel extends LitElement {

    recordName;
    
    constructor(recordName) {
        super();
        this.recordName = recordName;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.subscribeOnErrors();
        await this.subscribeOnInfos();
    }
    
    async getRecordVariable(variableName) {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        let record = clientServerSync.getRecord(this.recordName);
        console.log("retrieving configuration value of " + this.recordName + " and var " + variableName);
        return new Promise((resolve, reject) => {
            record.whenReady(rec => {
                try {
                    const value = rec.get(variableName);
                    console.log("Configuration value for " + variableName, value);
                    resolve(value);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
    
    async setRecordVariable(variableName, value) {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.setRecordVariableValue(this.recordName, variableName, value);
    }

    async subscribeOnErrors() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnEvent("Errors", (data) => {
            console.log("Errors: " + JSON.stringify(data));
            toast.show(data, 5000, 'error');
        })
    }

    async subscribeOnInfos() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnEvent("Infos", (data) => {
            console.log("Infos: " + JSON.stringify(data));
            toast.show(data, 3000, 'success');
        })
    }
}
