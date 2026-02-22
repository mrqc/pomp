import {LitElement, html, css} from 'lit';
import {SessionService, Session} from './service/SessionService.js';


class AppLayout extends LitElement {
    static styles = css`
        :host {
            display: block;
            height: 100vh;
            font-family: 'Inter', 'Roboto', Arial, sans-serif;
            background: #18181b;
            color: #f4f4f5;
            letter-spacing: 0.01em;
        }

        .container {
            display: grid;
            grid-template-rows: 64px 1fr;
            grid-template-columns: 240px 1fr;
            height: 100%;
            gap: 0;
        }

        /* Header Area */

        .header-left {
            grid-column: 1;
            grid-row: 1;
            background: #18181b;
            display: flex;
            align-items: center;
            padding-left: 32px;
            font-weight: 700;
            font-size: 1.25rem;
            border-bottom: 1px solid #27272a;
            border-right: 1px solid #27272a;
            letter-spacing: 0.08em;
            color: #2563eb; /* changed to synthetic, bright, tech mood blue */
            min-height: 64px;
            user-select: none;
        }

        .header-right {
            grid-column: 2;
            grid-row: 1;
            background: #18181b;
            display: flex;
            align-items: center;
            justify-content: flex-start; /* changed from flex-end to flex-start for left alignment */
            padding: 0 32px;
            border-bottom: 1px solid #27272a;
            color: #f4f4f5;
            min-height: 64px;
        }

        /* Sidebar */

        .sidebar {
            grid-column: 1;
            grid-row: 2;
            background: #18181b;
            color: #f4f4f5;
            padding: 32px 0 0 0;
            border-right: 1px solid #27272a;
            min-width: 200px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .sidebar ul {
            list-style: none;
            padding: 0 0 0 0;
            margin: 0;
            width: 100%;
        }

        .sidebar li {
            padding: 12px 32px;
            margin: 0;
            border-radius: 12px 0 0 12px;
            font-size: 1.08rem;
            font-weight: 500;
            color: #a1a1aa;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
            border-left: 4px solid transparent;
            outline: none;
            user-select: none;
        }

        .sidebar li:hover, .sidebar li:focus {
            background: #27272a;
            color: #2563eb; /* changed to synthetic, bright, tech mood blue */
            border-left: 4px solid #2563eb; /* changed to synthetic, bright, tech mood blue */
        }

        .sidebar li.active {
            background: #27272a;
            color: #2563eb; /* changed to synthetic, bright, tech mood blue */
            border-left: 4px solid #2563eb; /* changed to synthetic, bright, tech mood blue */
        }

        /* Main Content */

        .main-content {
            grid-column: 2;
            grid-row: 2;
            padding: 40px 48px;
            background: #232329;
            border-radius: 12px;
            box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.12);
            margin: 32px 32px 32px 0;
            color: #f4f4f5;
            border: 1px solid #27272a;
            min-height: 0;
            overflow-y: auto;
        }

        .main-content h2 {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 18px;
            letter-spacing: 0.04em;
            color: #f4f4f5;
            border-bottom: 3px solid #2563eb; /* changed to synthetic, bright, tech mood blue */
            display: inline-block;
            padding-bottom: 6px;
            border-radius: 0;
        }

        .main-content p {
            font-size: 1.1rem;
            line-height: 1.7;
            color: #a1a1aa;
            margin-bottom: 0;
        }

        /* Example button style for accent */

        .accent-btn {
            background: #2563eb; /* changed to synthetic, bright, tech mood blue */
            color: #f4f4f5; /* changed from #18181b to a light color for contrast */
            font-weight: 600;
            border: none;
            border-radius: 12px;
            padding: 10px 24px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
            box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
            margin-top: 24px;
        }

        .accent-btn:hover, .accent-btn:focus {
            background: #3b82f6; /* lighter synthetic blue for hover */
            color: #f4f4f5;
        }
    `;

    static properties = {
        selectedPanel: {
            type: String
        },
    };

    sessions;
    sessionService;

    constructor() {
        super();
        this.selectedPanel = '';
        this.sessionService = new SessionService();
    }

    async connectedCallback() {
        super.connectedCallback();
        await this.init();
    }

    async init() {
        await this.subscribeSessions();
    }

    handleMenuClick(panel) {
        this.selectedPanel = panel;
    }

    async subscribeSessions() {
        await this.sessionService.subscribe((data) => {
            console.log(JSON.stringify(data));
            this.sessions = data;
            this.requestUpdate();
        });
    }

    render() {
        return html`
            <div class="container">
                <div class="header-left">Buddy</div>
                <div class="header-right">
                    <div>
                        <audio-stream-context></audio-stream-context>
                    </div>
                </div>

                <nav class="sidebar">
                    <ul>
                        ${this.sessions && this.sessions.length > 0 ? this.sessions.map(session => html`
                            <li>${session.title}</li>`) : html`
                            <li>No sessions</li>`}
                    </ul>
                    <hr style="border: none; border-top: 1px solid #27272a; margin: 8px 0 8px 0; width: 90%; align-self: center;"/>
                    <div style="padding: 0 32px 4px 32px; font-size: 0.95rem; color: #a1a1aa; font-weight: 600; letter-spacing: 0.04em;">Configuration</div>
                    <ul>
                        <li @click="${() => this.handleMenuClick('llm')}" class="${['llm', ''].includes(this.selectedPanel) ? 'active' : ''}">LLM API</li>
                        <li @click="${() => this.handleMenuClick('audio-recording')}" class="${this.selectedPanel === 'audio-recording' ? 'active' : ''}">Audio
                            Recording
                        </li>
                        <li @click="${() => this.handleMenuClick('speech-to-text')}" class="${this.selectedPanel === 'speech-to-text' ? 'active' : ''}">Speech To Text
                        </li>
                        <li @click="${() => this.handleMenuClick('text-to-speech')}" class="${this.selectedPanel === 'text-to-speech' ? 'active' : ''}">Text To Speech
                        </li>
                    </ul>
                </nav>

                <main class="main-content">
                    ${['llm', ''].includes(this.selectedPanel) ? html`
                        <llm-configuration-panel></llm-configuration-panel>` : ''}
                    ${this.selectedPanel === 'audio-recording' ? html`
                        <audio-recording-configuration-panel></audio-recording-configuration-panel>` : ''}
                    ${this.selectedPanel === 'speech-to-text' ? html`
                        <speech-to-text-configuration-panel></speech-to-text-configuration-panel>` : ''}
                    ${this.selectedPanel === 'text-to-speech' ? html`
                        <text-to-speech-configuration-panel></text-to-speech-configuration-panel>` : ''}
                </main>
            </div>
        `;
    }
}

customElements.define('app-layout', AppLayout);
