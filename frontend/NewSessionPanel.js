import {LitElement, html, css} from 'lit';
import {ClientServerSynchronization} from "./service/ClientServerSynchronization.js";

class NewSessionPanel extends LitElement {
    static styles = css`
        :host {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            width: 100%;
        }

        .container {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            max-width: 600px;
            gap: 16px;
        }

        textarea {
            width: 100%;
            height: 150px;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #3f3f46;
            background: #272a30;
            color: #f4f4f5;
            font-family: inherit;
            font-size: 1rem;
            resize: vertical;
        }

        textarea:focus {
            outline: none;
            border-color: #2563eb;
        }

        .send-btn {
            background: #2563eb;
            color: #f4f4f5;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            padding: 10px 24px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
        }

        .send-btn:hover, .send-btn:focus {
            background: #3b82f6;
            color: #f4f4f5;
        }
    `;

    async handleSend() {
        const textarea = this.shadowRoot.querySelector('textarea');
        const text = textarea.value;
        const clientServerSync = await ClientServerSynchronization.getInstance();
        clientServerSync.setValue("Sessions", "newSession", text);
        textarea.value = '';
    }

    render() {
        return html`
            <div class="container">
                <textarea placeholder="Type your message here..."></textarea>
                <button class="send-btn" @click="${this.handleSend}">Send</button>
            </div>
        `;
    }
}

customElements.define('new-session-panel', NewSessionPanel);
