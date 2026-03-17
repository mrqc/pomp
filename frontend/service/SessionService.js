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
    workspace;
    constructor(id, title, content, workspace) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.workspace = workspace;
    }
}

export class SessionService {
    
    clientServerSynchronization;

    async subscribe(callback) {
        this.clientServerSynchronization = await ClientServerSynchronization.getInstance();
        this.clientServerSynchronization.subscribeOnRecordVariable('Sessions', 'list', (sessions) => {
            if (Array.isArray(sessions)) {
                for (let session of sessions) {
                    this.clientServerSynchronization.subscribeOnRecordVariable("Sessions", "list[" + session.index + "].workspace", (workspaceData) => {
                        console.log("new workspace: " + workspaceData)
                        session.workspace = workspaceData;
                    });
                    this.clientServerSynchronization.subscribeOnRecordVariable("Sessions", "list[" + session.index + "].newMessage", (newMessage) => {
                        console.log("new message: " + JSON.stringify(newMessage))
                        if (!session.content) {
                            session.content = [];
                        }
                        session.content = [...session.content, newMessage];
                    });
                }
                callback(sessions);
            }
        });
    }
}
