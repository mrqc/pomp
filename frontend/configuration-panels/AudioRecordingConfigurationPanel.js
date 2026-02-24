import { LitElement, html, css } from "lit";
import { ConfigurationPanel } from "./ConfigurationPanel.js";


class AudioRecordingConfigurationPanel extends ConfigurationPanel {
    static styles = css`
        :host { 
            display: block; 
            padding: 16px; 
            color: #FFF;
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            background: transparent;
        }
        .input-group {
            display: flex;
            flex-direction: column;
            margin-bottom: 18px;
        }
        label {
            font-size: 1.08rem;
            font-weight: 500;
            margin-bottom: 7px;
            color: #B3C7F9;
            letter-spacing: 0.01em;
        }
        input {
            font-size: 1.13rem;
            padding: 12px 14px;
            border-radius: 8px;
            border: 1.5px solid #3B82F6;
            background: #23243a;
            color: #fff;
            outline: none;
            margin: 0;
            transition: border-color 0.2s;
            width: 100%;
            box-sizing: border-box;
        }
        input:focus {
            border-color: #60A5FA;
        }
        button {
            margin: 4px 8px 4px 0;
            padding: 8px 18px;
            border-radius: 6px;
            border: none;
            background: #3B82F6;
            color: #fff;
            font-size: 1.08rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.18s;
        }
        button:hover {
            background: #2563EB;
        }
    `;

    static properties = {
        sampleRate: { type: Number },
        defaultRecordingDuration: { type: Number },
        stopWaitingRecordDuration: { type: Number },
        editing: { type: Boolean },
        tempConfig: { type: Object },
    };

    constructor() {
        super("AudioRecording");
        this.editing = false;
        this.tempConfig = this._getCurrentConfig();
    }
    
    async connectedCallback() {
        super.connectedCallback();
        this.sampleRate = await this.getConfig("sampleRate");
        this.defaultRecordingDuration = await this.getConfig("defaultRecordingDuration");
        this.stopWaitingRecordDuration = await this.getConfig("stopWaitingRecordDuration");
        this.requestUpdate();
    }

    _getCurrentConfig() {
        return {
            sampleRate: this.sampleRate,
            defaultRecordingDuration: this.defaultRecordingDuration,
            stopWaitingRecordDuration: this.stopWaitingRecordDuration,
        };
    }

    _startEdit() {
        this.editing = true;
        this.tempConfig = this._getCurrentConfig();
    }

    _cancelEdit() {
        this.editing = false;
        this.tempConfig = this._getCurrentConfig();
    }

    async _saveConfig(e) {
        e.preventDefault();
        this.sampleRate = Number(this.tempConfig.sampleRate);
        this.defaultRecordingDuration = Number(this.tempConfig.defaultRecordingDuration);
        this.stopWaitingRecordDuration = Number(this.tempConfig.stopWaitingRecordDuration);
        await this.setConfig("sampleRate", this.sampleRate);
        await this.setConfig("defaultRecordingDuration", this.defaultRecordingDuration);
        await this.setConfig("stopWaitingRecordDuration", this.stopWaitingRecordDuration);
        this.editing = false;
    }

    _updateField(e, field) {
        this.tempConfig = { ...this.tempConfig, [field]: e.target.value };
    }

    render() {
        return html`
            <div id="configuration">
                <div class="section-title" style="font-weight:700;font-size:1.25rem;color:#3B82F6;margin-bottom:18px;">Audio Recording Configuration</div>
                ${this.editing ? html`
                    <form @submit="${this._saveConfig}">
                        <div class="input-group">
                            <label>Sample Rate</label>
                            <input type="number" .value="${this.tempConfig.sampleRate}" min="8000" max="48000" step="1000" @input="${e => this._updateField(e, 'sampleRate')}">
                        </div>
                        <div class="input-group">
                            <label>Default Recording Duration (ms)</label>
                            <input type="number" .value="${this.tempConfig.defaultRecordingDuration}" min="100" step="100" @input="${e => this._updateField(e, 'defaultRecordingDuration')}">
                        </div>
                        <div class="input-group">
                            <label>Stop Waiting Record Duration (ms)</label>
                            <input type="number" .value="${this.tempConfig.stopWaitingRecordDuration}" min="100" step="10" @input="${e => this._updateField(e, 'stopWaitingRecordDuration')}">
                        </div>
                        <button type="submit">Save</button>
                        <button type="button" @click="${this._cancelEdit}">Cancel</button>
                    </form>
                ` : html`
                    <div class="input-group">
                        <label>Sample Rate</label>
                        <div>${this.sampleRate}</div>
                    </div>
                    <div class="input-group">
                        <label>Default Recording Duration (ms)</label>
                        <div>${this.defaultRecordingDuration}</div>
                    </div>
                    <div class="input-group">
                        <label>Stop Waiting Record Duration (ms)</label>
                        <div>${this.stopWaitingRecordDuration}</div>
                    </div>
                    <button @click="${this._startEdit}">Edit</button>
                `}
            </div>
        `;
    }
}

customElements.define('audio-recording-configuration-panel', AudioRecordingConfigurationPanel);
