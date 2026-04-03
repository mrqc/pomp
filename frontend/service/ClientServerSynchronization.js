import {DeepstreamClient} from "@deepstream/client";

export class ClientServerSynchronization {
    client = new DeepstreamClient('localhost:6020');
    
    async init() {
        await this.client.login();
    }
    
    static async getInstance() {
        if (!globalThis.clientServerSynchronizationInstance) {
            globalThis.clientServerSynchronizationInstance = new ClientServerSynchronization();
            await globalThis.clientServerSynchronizationInstance.init();
        }
        return globalThis.clientServerSynchronizationInstance;
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
            console.log("whenReady for list " + listName);
            const currentEntries = list.getEntries();
            let records = [];
            currentEntries.forEach(recordName => {
                console.log("list entry " + recordName);
                records.push(this.getRecord(recordName));
            });
            console.log('Initial state loaded:', records);
            initialCallback(records);
            list.on('entry-added', (recordName, index) => {
                console.log('DELTA: Only this item added:', recordName);
                let record = this.getRecord(recordName);
                record.whenReady((record) => {
                    const data = record.get();
                    if (Object.keys(data).length > 0) {
                        deltaAddCallback(record);
                    } else {
                        const loadHandler = (data) => {
                            if (Object.keys(data).length > 0) {
                                record.unsubscribe(loadHandler);
                                deltaAddCallback(record);
                            }
                        };
                        record.subscribe(loadHandler, true);
                    }
                });
            });
        });
    }
    
    setRecordVariableValue(recordName, variableName, value) {
        this.client.record.getRecord(recordName).whenReady((record) => {
            record.set(variableName, value);
        });
    }
    
    subscribeOnRecordVariable(recordName, variableName, callback) {
        this.getRecord(recordName).subscribe(variableName, callback, true);
    }

    unsubscribeFromRecordVariable(recordName, variableName, callback) {
        this.getRecord(recordName).unsubscribe(variableName, callback);
    }
    
    subscribeOnEvent(eventName, callback) {
        return this.client.event.subscribe(eventName, callback);
    }
    
    sendEvent(eventName, value) {
        this.client.event.emit(eventName, value);
    }
}
