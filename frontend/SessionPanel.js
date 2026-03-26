import { LitElement, html, css } from "lit";
import {ClientServerSynchronization} from "./service/ClientServerSynchronization.js";
import {unsafeHTML} from "lit/directives/unsafe-html.js";

export class SessionPanel extends LitElement {
    static styles = css`
        :host { 
            display: flex;
            flex-direction: row;
            padding: 16px; 
            color: #FFF;
            height: 100%;
            box-sizing: border-box;
            width: 100%;
        }
        
        #workspace-container {
            width: 80%;
            padding-right: 16px;
            box-sizing: border-box;
            overflow-y: auto;
        }

        #content-container {
            width: 20%;
            border-left: 1px solid #444;
            padding-left: 16px;
            box-sizing: border-box;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .message {
            padding: 10px;
            background-color: #2a2a2a;
            border-radius: 4px;
        }

        .message-timestamp {
            font-size: 0.8em;
            color: #aaa;
            margin-bottom: 4px;
        }

        .message-text {
            font-size: 0.95em;
            line-height: 1.4;
            word-break: break-word;
        }
    `;

    clientServerSynchronization = null;
    
    static properties = {
        session: { type: Object },
        workspace: { type: String },
        messages: { type: Array }
    };

    constructor() {
        super();
        this.workspace = "";
        this.messages = [];
        this.session = null;
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.init();
    }

    willUpdate(changedProperties) {
        super.willUpdate(changedProperties);
        if (changedProperties.has('session')) {
            const oldSession = this.session;
            if (oldSession && this.clientServerSynchronization) {
                this.clientServerSynchronization.unsubscribeFromList("messages-of-session-" + oldSession.id, this.initialListCallback, this.deltaListCallback);
                this.clientServerSynchronization.unsubscribeFromRecordVariable("session-" + oldSession.id, "workspace", this.workspaceUpdateCallback);
            }
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('session')) {
            this.workspace = "";
            this.messages = [];
            this.initSession();
        }
    }
    
    initialListCallback = async (listOfRecords) => {
        let list = [];
        for (let messageRecord of listOfRecords) {
            await messageRecord.whenReady();
            list.push(messageRecord.get());
        }
        this.messages = list || [];
    };
    
    deltaListCallback = (newMessageRecord) => {
        this.messages = [...this.messages, newMessageRecord.get()];
    };
    
    workspaceUpdateCallback = (value) => {
        this.workspace = value;
    }

    async init() {
        if (!this.clientServerSynchronization) {
            this.clientServerSynchronization = await ClientServerSynchronization.getInstance();
        }
        this.initSession();
    }
    
    initSession() {
        if (this.session) {
            this.workspace = this.session.workspace || "";
            this.messages = this.session.messages || [];
            this.clientServerSynchronization.getAndSubscribeList("messages-of-session-" + this.session.id, this.initialListCallback, this.deltaListCallback);
            this.clientServerSynchronization.subscribeOnRecordVariable("session-" + this.session.id, "workspace", this.workspaceUpdateCallback);
        }
    }

    render() {
        if (!this.session) {
            return html`No session`;
        }
        return html`
            <div id="workspace-container">
                ${this.workspace ? unsafeHTML(this.workspace) : html``}
            </div>
            <div id="content-container">
                ${this.messages.map(message => html`
                    <div class="message">
                        <div class="message-timestamp">${(new Date(message.timestamp)).toLocaleTimeString()}</div>
                        <div class="message-text">${message.text}</div>
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('session-panel', SessionPanel);
