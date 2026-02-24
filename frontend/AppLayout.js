import {LitElement, html, css} from 'lit';
import {SessionService, Session} from './service/SessionService.js';

class AppLayout extends LitElement {
    static styles = css`
        :host {
            display: block;
            height: 100vh;
            font-family: 'Inter', 'Roboto', Arial, sans-serif;
            background: #15171a;
            color: #f4f4f5;
            letter-spacing: 0.01em;
        }

        .container {
            display: grid;
            grid-template-rows: 56px 1fr;
            grid-template-columns: 200px 1fr;
            height: 100%;
            gap: 0;
        }

        /* Header Area */
        .header-left {
            grid-column: 1;
            grid-row: 1;
            background: #15171a;
            display: flex;
            align-items: center;
            padding-left: 24px;
            font-weight: 700;
            font-size: 1.15rem;
            letter-spacing: 0.08em;
            color: #2563eb;
            min-height: 56px;
            user-select: none;
            border-bottom: 1px solid #181a1f;
        }

        .header-right {
            grid-column: 2;
            grid-row: 1;
            background: #15171a;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            padding: 0 24px;
            border-bottom: 1px solid #181a1f;
            color: #f4f4f5;
            min-height: 56px;
        }

        /* Sidebar */
        .sidebar {
            grid-column: 1;
            grid-row: 2;
            background: #181a1f;
            color: #f4f4f5;
            padding: 24px 0 0 0;
            border-right: 1px solid #181a1f;
            min-width: 160px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .sidebar ul {
            list-style: none;
            padding: 0;
            margin: 0;
            width: 100%;
        }

        .sidebar li {
            padding: 10px 20px;
            margin: 0;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 500;
            color: #a1a1aa;
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
            border-left: 3px solid transparent;
            outline: none;
            user-select: none;
        }

        .sidebar li:hover, .sidebar li:focus {
            background: #23262b;
            color: #2563eb;
            border-left: 3px solid #2563eb;
        }

        .sidebar li.active {
            background: #23262b;
            color: #2563eb;
            border-left: 3px solid #2563eb;
        }

        .sidebar hr {
            border: none;
            border-top: 1px solid #23262b;
            margin: 8px 0 8px 0;
            width: 90%;
            align-self: center;
        }

        .sidebar .config-label {
            padding: 0 20px 4px 20px;
            font-size: 0.93rem;
            color: #6e7681;
            font-weight: 600;
            letter-spacing: 0.04em;
        }

        /* Main Content */
        .main-content {
            grid-column: 2;
            grid-row: 2;
            padding: 32px 36px;
            background: #181a1f;
            border-radius: 0;
            margin: 24px 24px 24px 0;
            color: #f4f4f5;
            border: none;
            min-height: 0;
            overflow-y: auto;
            box-shadow: none;
        }

        .main-content h2 {
            font-size: 1.6rem;
            font-weight: 700;
            margin-bottom: 16px;
            letter-spacing: 0.04em;
            color: #f4f4f5;
            border-bottom: 2px solid #2563eb;
            display: inline-block;
            padding-bottom: 4px;
            border-radius: 0;
        }

        .main-content p {
            font-size: 1.05rem;
            line-height: 1.6;
            color: #a1a1aa;
            margin-bottom: 0;
        }

        /* Accent Button */
        .accent-btn {
            background: #2563eb;
            color: #f4f4f5;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            padding: 9px 20px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
            box-shadow: none;
            margin-top: 18px;
        }

        .accent-btn:hover, .accent-btn:focus {
            background: #3b82f6;
            color: #f4f4f5;
        }
    `;

    static properties = {
        selectedPanel: {
            type: String
        },
        selectedSession: {
            type: Object
        },
    };

    sessions;
    sessionService;
    selectedSession;

    constructor() {
        super();
        this.selectedPanel = '';
        this.selectedSession = null;
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
        this.selectedSession = null;
    }

    handleSessionClick(session) {
        this.selectedPanel = 'session';
        this.selectedSession = session;
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
                            <li
                                @click="${() => this.handleSessionClick(session)}"
                                class="${this.selectedPanel === 'session' && this.selectedSession && this.selectedSession.id === session.id ? 'active' : ''}"
                                tabindex="0"
                            >${session.title}</li>`) : html`
                            <li>No sessions</li>`}
                    </ul>
                    <hr />
                    <div class="config-label">Configuration</div>
                    <ul>
                        <li @click="${() => this.handleMenuClick('llm')}" class="${['llm', ''].includes(this.selectedPanel) ? 'active' : ''}">LLM API</li>
                        <li @click="${() => this.handleMenuClick('audio-recording')}" class="${this.selectedPanel === 'audio-recording' ? 'active' : ''}">Audio Recording</li>
                        <li @click="${() => this.handleMenuClick('speech-to-text')}" class="${this.selectedPanel === 'speech-to-text' ? 'active' : ''}">Speech To Text</li>
                        <li @click="${() => this.handleMenuClick('text-to-speech')}" class="${this.selectedPanel === 'text-to-speech' ? 'active' : ''}">Text To Speech</li>
                    </ul>
                </nav>

                <main class="main-content">
                    ${this.selectedPanel === 'session' && this.selectedSession ? html`
                        <session-panel .session="${this.selectedSession}"></session-panel>
                    ` : ''}
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
