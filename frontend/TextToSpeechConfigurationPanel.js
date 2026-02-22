import { LitElement, html, css } from "lit";

class TextToSpeechConfigurationPanel extends LitElement {
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
        modelId: { type: String },
        editing: { type: Boolean },
        tempConfig: { type: Object },
    };

    constructor() {
        super();
        this.modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';
        this.editing = false;
        this.tempConfig = this._getCurrentConfig();
    }

    _getCurrentConfig() {
        return {
            modelId: this.modelId,
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

    _saveConfig(e) {
        e.preventDefault();
        this.modelId = this.tempConfig.modelId;
        this.editing = false;
    }

    _updateField(e, field) {
        this.tempConfig = { ...this.tempConfig, [field]: e.target.value };
    }

    render() {
        return html`
            <div id="configuration">
                <div class="section-title" style="font-weight:700;font-size:1.25rem;color:#3B82F6;margin-bottom:18px;">Text To Speech Configuration</div>
                ${this.editing ? html`
                    <form @submit="${this._saveConfig}">
                        <div class="input-group">
                            <label>Model ID</label>
                            <input type="text" .value="${this.tempConfig.modelId}" @input="${e => this._updateField(e, 'modelId')}">
                        </div>
                        <button type="submit">Save</button>
                        <button type="button" @click="${this._cancelEdit}">Cancel</button>
                    </form>
                ` : html`
                    <div class="input-group">
                        <label>Model ID</label>
                        <div>${this.modelId}</div>
                    </div>
                    <button @click="${this._startEdit}">Edit</button>
                `}
            </div>
        `;
    }
}

customElements.define('text-to-speech-configuration-panel', TextToSpeechConfigurationPanel);
