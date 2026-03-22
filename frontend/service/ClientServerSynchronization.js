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
    
    unsubscribeFromList(listName, initialCallback, deltaAddCallback) {
        let list = this.client.record.getList(listName);
        list.off(deltaAddCallback);
        list.unsubscribe(initialCallback);
    }
    
    getAndSubscribeList(listName, initialCallback, deltaAddCallback) {
        const listObject = this.client.record.getList(listName);
        listObject.whenReady((list) => {
            const currentEntries = list.getEntries();
            let entryRecords = [];
            currentEntries.forEach(recordName => {
                const recordObject = this.getRecord(recordName);
                recordObject.whenReady((record) => {
                    const data = record.get();
                    console.log(`Data for ${recordName}:`, data);
                    entryRecords.push(record);
                });
            });
            console.log('Initial state loaded:', entryRecords);
            initialCallback(entryRecords);
            list.on('entry-added', (recordName, index) => {
                console.log('DELTA: Only this item added: ', recordName);
                deltaAddCallback(this.getRecord(recordName));
            });
        });
    }
    
    setRecordVariableValue(recordName, variableName, value) {
        this.client.record.getRecord(recordName).whenReady((record) => {
            record.set(variableName, value);
        });
    }
    
    subscribeOnRecordVariable(recordName, variableName, callback) {
        this.getRecord(recordName).subscribe(variableName, (data) => {
            callback(data);
        });
    }
    
    subscribeOnEvent(eventName, callback) {
        return this.client.event.subscribe(eventName, callback);
    }
}
