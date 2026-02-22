import { ClientServerSynchronization } from './ClientServerSynchronization.js';

export class Message {
    id;
    text;
    timestamp;
    constructor(id, text, timestamp) {
        this.id = id;
        this.text = text;
        this.timestamp = timestamp;
    }
}

export class Session {
    id;
    title;
    content;
    constructor(id, title, content) {
        this.id = id;
        this.title = title;
        this.content = content;
    }
}

export class SessionService {
    
    clientServerSynchronization;

    async subscribe(callback) {
        this.clientServerSynchronization = await ClientServerSynchronization.getInstance();
        this.clientServerSynchronization.subscribeOnRecord('Sessions', 'list', callback);
    }
}
