import { LitElement, html, css } from "lit";
import {ClientServerSynchronization} from "./service/ClientServerSynchronization.js";
import {unsafeHTML} from "lit/directives/unsafe-html.js";
import { cache } from 'lit/directives/cache.js';
import { repeat } from 'lit/directives/repeat.js';

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
                this.clientServerSynchronization.unsubscribeFromList("messages-of-session-" + oldSession.id, this.initialMessageListCallback, this.deltaMessageListCallback);
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
    
    initialMessageListCallback = async (listOfRecords) => {
        let list = [];
        for (let messageRecord of listOfRecords) {
            await messageRecord.whenReady();
            list.push(messageRecord.get());
        }
        this.messages = list || [];
    };
    
    deltaMessageListCallback = async (newMessageRecord) => {
        await newMessageRecord.whenReady();
        let newMessage = newMessageRecord.get();
        console.log("message: " + JSON.stringify(newMessage));
        if (Object.keys(newMessage).length === 0 && newMessage.constructor === Object) {
            return;
        }
        if (this.messages.filter(message => message.id === newMessage.id).length === 0) { 
            this.messages = [...this.messages, newMessage];
        }
    };
    
    workspaceUpdateCallback = (value) => {
        this.workspace = value;
    }

    async init() {
        await this.initSession();
    }
    
    async initSession() {
        this.clientServerSynchronization = await ClientServerSynchronization.getInstance();
        if (this.session) {
            this.workspace = this.session.workspace || "";
            this.messages = this.session.messages || [];
            this.clientServerSynchronization.getAndSubscribeList("messages-of-session-" + this.session.id, this.initialMessageListCallback, this.deltaMessageListCallback);
            this.clientServerSynchronization.subscribeOnRecordVariable("session-" + this.session.id, "workspace", this.workspaceUpdateCallback);
        }
    }

    handleAction(e) {
        const action = e.target.getAttribute('data-action');
        if (action == null) {
            return;
        }
        let form = this.renderRoot.querySelector('#workspace-container form');
        if (form) {
            const formData = new FormData(form);
            const data = {};
            for (const key of formData.keys()) {
                const values = formData.getAll(key);
                data[key] = values.length > 1 ? values : values[0];
            }
            console.log(data);
            this.clientServerSynchronization.sendEvent("prompt-ui-response", {
                technicalPayload: data,
                action: action
            });
        }
        this.renderRoot.getElementById('workspace-container').innerHTML = "";
    }

    renderWorkspace() {
        try {
            if (!this.workspace) {
                return html``;
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(this.workspace, 'text/html');
            const errorNode = doc.querySelector('parsererror');

            if (errorNode) {
                setTimeout(() => {
                    this.renderWorkspace()
                }, 100);
            }

            return unsafeHTML(this.workspace);
        } catch (e) {
            setTimeout(() => {
                this.renderWorkspace()
            }, 100);
            return "Wait";
        }
        //cache(this.workspace ? unsafeHTML(this.workspace) : html``)
    }

    render() {
        if (!this.session) {
            return html`No session`;
        }
        return html`
            <div id="workspace-container" @click="${this.handleAction}">
                ${this.renderWorkspace()}
            </div>
            <div id="content-container">
                ${repeat(this.messages, (m) => m.id || m.timestamp, (message) => html`
                    <div class="message">
                        <div class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
                        <div class="message-text">${message.text}</div>
                    </div>
                `)}
            </div>
        `;
    }
} 

customElements.define('session-panel', SessionPanel);
