import {DeepstreamClient} from "@deepstream/client";

export class ClientServerSynchronization {
    client = new DeepstreamClient('localhost:6020');
    static singleton;
    
    async init() {
        await this.client.login();
    }
    
    static async getInstance() {
        if ( !ClientServerSynchronization.singleton) {
            ClientServerSynchronization.singleton = new ClientServerSynchronization();
            await ClientServerSynchronization.singleton.init();
        }
        return ClientServerSynchronization.singleton;
    }
    
    getRecord(recordName) {
        return this.client.record.getRecord(recordName);
    }
    
    setValue(recordName, variableName, value) {
        this.client.record.getRecord(recordName).whenReady((record) => {
            record.set(variableName, value);
        });
    }
    
    subscribeOnRecord(recordName, variableName, callback) {
        this.getRecord(recordName).subscribe(variableName, (data) => {
            callback(data);
        });
    }
    
    subscribeOnEvent(eventName, callback) {
        return this.client.event.subscribe(eventName, callback);
    }
}
