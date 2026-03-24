import { LitElement, html, css } from "lit";
import { ClientServerSynchronization } from './service/ClientServerSynchronization.js';


class AudioStreamContextPanel extends LitElement {
    
    static styles = css`
        :host { 
            display: block; 
            padding: 16px; 
            color: #FFF;
        }
    `;
    
    speechContext = "";
    
    async connectedCallback() {
        super.connectedCallback();
        await this.init();
    }

    async init() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnRecordVariable("SpeechContext", "text", (data) => {
            this.speechContext = data;
            this.requestUpdate();
        });
    }

    render() {
        return html`<div id="speech-context">Context Window: ${this.speechContext}</div>`;
    }
}

customElements.define('audio-stream-context', AudioStreamContextPanel);
