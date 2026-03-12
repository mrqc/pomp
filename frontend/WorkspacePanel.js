import { LitElement, html, css } from "lit";
import { ClientServerSynchronization } from './service/ClientServerSynchronization.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

class WorkspacePanel extends LitElement {

    static styles = css`
        :host { 
            display: block; 
            padding: 16px; 
            color: #FFF;
        }
    `;

    content = "";

    async connectedCallback() {
        super.connectedCallback();
        await this.init();
    }

    async init() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnRecordVariable("SpeechContext", "content", (data) => {
            console.log(JSON.stringify(data))
            this.content = data;
            this.requestUpdate();
        });
    }

    render() {
        return html`<div id="workspace-container">${unsafeHTML(this.content)}</div>`;
    }
}

customElements.define('workspace-panel', WorkspacePanel);
