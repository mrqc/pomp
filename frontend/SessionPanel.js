import { LitElement, html, css } from "lit";
import {ClientServerSynchronization} from "./service/ClientServerSynchronization.js";
import {unsafeHTML} from "lit/directives/unsafe-html.js";
import { repeat } from 'lit/directives/repeat.js';
import { query } from 'lit/decorators.js';

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
            border-radius: 4px;
            cursor: pointer;
        }

        .message:hover {
            filter: brightness(1.2);
        }

        .message-type-0 /*USER_TEXT_INPUT*/{
            background-color: #2a2a2a;
        }

        .message-type-1 /*ASSISTANT*/ {
            background-color: #23262b;
        }

        .message-type-2 /*USER_ACTION_FEEDBACK*/ {
            background-color: #212d09
        }

        .message-type-3 /*EVENT*/ {
            background-color: #10112d;
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

        #input-container {
            display: flex;
            gap: 8px;
            margin-top: auto;
            padding-top: 12px;
            border-top: 1px solid #444;
        }

        #message-input {
            flex: 1;
            padding: 8px;
            background-color: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            color: #fff;
            font-size: 0.95em;
            box-sizing: border-box;
        }

        #message-input:focus {
            outline: none;
            border-color: #666;
            background-color: #333;
        }

        #submit-button {
            padding: 8px 16px;
            background-color: #0e639c;
            border: none;
            border-radius: 4px;
            color: #fff;
            font-size: 0.95em;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        #submit-button:hover {
            background-color: #1177bb;
        }

        #submit-button:active {
            background-color: #0a4a7a;
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
    
    updateWorkspace(value) {
        this.workspace = value;
        this.requestUpdate();
    }

    firstUpdated() {
        this.shadowRoot.addEventListener('click', (e) => this.handleAction(e));
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('session')) {
            this.updateWorkspace("")
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
        this.requestUpdate();
        // Wait for DOM to update before scrolling
        await this.updateComplete;
        const container = this.shadowRoot?.querySelector('#content-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    };
    
    workspaceUpdateCallback = (value) => {
        this.updateWorkspace(value);
    }

    async init() {
        await this.initSession();
    }
    
    async initSession() {
        this.clientServerSynchronization = await ClientServerSynchronization.getInstance();
        if (this.session) {
            this.updateWorkspace(this.session.workspace || "");
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
                sessionId: this.session.id,
                technicalPayload: data,
                action: action
            });
        }
        this.updateWorkspace("");
    }

    sendMessage() {
        const input = this.shadowRoot.querySelector('#message-input');
        const messageText = input.value.trim();
        
        if (!messageText) {
            return;
        }

        if (this.clientServerSynchronization && this.session) {
            this.clientServerSynchronization.sendEvent("new-session-message", {
                sessionId: this.session.id,
                text: messageText
            });
            input.value = '';
        }
    }

    handleMessageClick(message) {
        if (message.workspace) {
            this.updateWorkspace(message.workspace);
        }
    }

    render() {
        if (!this.session) {
            return html`No session`;
        }
        return html`
            <div id="workspace-container">
                ${this.workspace ? html`${unsafeHTML(this.workspace)}` : html``}
            </div>
            <div id="content-container">
                ${repeat(this.messages, (m) => m.id || m.timestamp, (message) => html`
                    <div class="message message-type-${message.type}" @click="${() => this.handleMessageClick(message)}">
                        <div class="message-timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
                        <div class="message-text">${message.text}</div>
                    </div>
                `)}
                <div id="input-container">
                    <input 
                        id="message-input" 
                        type="text" 
                        placeholder="Type a message..."
                        @keypress="${(e) => e.key === 'Enter' && this.sendMessage()}"
                    />
                    <button 
                        id="submit-button" 
                        @click="${() => this.sendMessage()}"
                    >Send</button>
                </div>
            </div>
        `;
    }
} 

customElements.define('session-panel', SessionPanel);
