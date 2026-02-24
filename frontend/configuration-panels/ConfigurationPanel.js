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
    
    async getConfig(variableName) {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        let record = clientServerSync.getRecord(this.recordName);
        return new Promise((resolve, reject) => {
            record.whenReady(rec => {
                try {
                    const value = rec.get(variableName);
                    console.log("value" + value + " for " + variableName);
                    resolve(value);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
    
    async setConfig(variableName, value) {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.setValue(this.recordName, variableName, value);
    }

    async subscribeOnErrors() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnEvent("Errors", (data) => {
            console.log(JSON.stringify(data));
            toast.show(data, 5000, 'error');
        })
    }

    async subscribeOnInfos() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnEvent("Infos", (data) => {
            console.log(JSON.stringify(data));
            toast.show(data, 3000, 'success');
        })
    }
}
