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

    selectedSession = null;

    static properties = {
        session: { type: Object },
        workspace: { type: String },
        content: { type: Array }
    };

    constructor() {
        super();
        this.session = null;
        this.workspace = "";
        this.content = [];
    }

    updated(changedProperties) {
        if (changedProperties.has('session') && this.session !== this.selectedSession) {
            this.selectedSession = this.session;
            this.init();
        }
    }

    async init() {
        if (!this.selectedSession) return;
        
        console.log("Session Workspace:", this.selectedSession.workspace);
        
        this.workspace = this.selectedSession.workspace || "";
        this.content = this.selectedSession.content || [];
    }

    render() {
        return html`
            <div id="workspace-container">
                ${this.workspace ? unsafeHTML(this.workspace) : html``}
            </div>
            <div id="content-container">
                ${this.content.map(message => html`
                    <div class="message">
                        <div class="message-timestamp">${new Date(message.timestamp).toLocaleString()}</div>
                        <div class="message-text">${message.text}</div>
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('session-panel', SessionPanel);
