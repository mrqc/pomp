import { LitElement, html, css } from "lit";
import { ClientServerSynchronization } from './service/ClientServerSynchronization.js';


class AudioStreamContext extends LitElement {
    
    static styles = css`
        :host { 
            display: block; 
            padding: 16px; 
            color: #FFF;
        }
    `;
    
    speechContextRecord;
    speechContext = "";
    
    async connectedCallback() {
        super.connectedCallback();
        await this.init();
    }

    async init() {
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.subscribeOnRecord("SpeechContext", "text", (data) => {
            this.speechContext = data;
            this.requestUpdate();
        });
    }

    render() {
        return html`<div id="speech-context">Context Window: ${this.speechContext}</div>`;
    }
}

customElements.define('audio-stream-context', AudioStreamContext);
