import { LitElement, html, css } from "lit";

class SpeechToTextConfigurationPanel extends LitElement {
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
        input[type="checkbox"] {
            width: auto;
            margin-right: 8px;
            accent-color: #3B82F6;
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
        secondsToLooseText: { type: Number },
        activationKeywords: { type: String },
        modelName: { type: String },
        translateToEnglish: { type: Boolean },
        splitOnWord: { type: Boolean },
        editing: { type: Boolean },
        tempConfig: { type: Object },
    };

    constructor() {
        super();
        this.secondsToLooseText = 10;
        this.activationKeywords = "buddy";
        this.modelName = "default";
        this.translateToEnglish = false;
        this.splitOnWord = false;
        this.editing = false;
        this.tempConfig = this._getCurrentConfig();
    }

    _getCurrentConfig() {
        return {
            secondsToLooseText: this.secondsToLooseText,
            activationKeywords: this.activationKeywords,
            modelName: this.modelName,
            translateToEnglish: this.translateToEnglish,
            splitOnWord: this.splitOnWord,
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
        this.secondsToLooseText = Number(this.tempConfig.secondsToLooseText);
        this.activationKeywords = this.tempConfig.activationKeywords;
        this.modelName = this.tempConfig.modelName;
        this.translateToEnglish = !!this.tempConfig.translateToEnglish;
        this.splitOnWord = !!this.tempConfig.splitOnWord;
        this.editing = false;
    }

    _updateField(e, field) {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        this.tempConfig = { ...this.tempConfig, [field]: value };
    }

    render() {
        return html`
            <div id="configuration">
                <div class="section-title" style="font-weight:700;font-size:1.25rem;color:#3B82F6;margin-bottom:18px;">Speech To Text Configuration</div>
                ${this.editing ? html`
                    <form @submit="${this._saveConfig}">
                        <div class="input-group">
                            <label>Seconds To Loose Text</label>
                            <input type="number" .value="${this.tempConfig.secondsToLooseText}" min="1" step="1" @input="${e => this._updateField(e, 'secondsToLooseText')}">
                        </div>
                        <div class="input-group">
                            <label>Activation Keywords</label>
                            <input type="text" .value="${this.tempConfig.activationKeywords}" @input="${e => this._updateField(e, 'activationKeywords')}">
                        </div>
                        <div class="input-group">
                            <label>Model Name</label>
                            <input type="text" .value="${this.tempConfig.modelName}" @input="${e => this._updateField(e, 'modelName')}">
                        </div>
                        <div class="input-group">
                            <label><input type="checkbox" .checked="${this.tempConfig.translateToEnglish}" @change="${e => this._updateField(e, 'translateToEnglish')}">Translate To English</label>
                        </div>
                        <div class="input-group">
                            <label><input type="checkbox" .checked="${this.tempConfig.splitOnWord}" @change="${e => this._updateField(e, 'splitOnWord')}">Split On Word</label>
                        </div>
                        <button type="submit">Save</button>
                        <button type="button" @click="${this._cancelEdit}">Cancel</button>
                    </form>
                ` : html`
                    <div class="input-group">
                        <label>Seconds To Loose Text</label>
                        <div>${this.secondsToLooseText}</div>
                    </div>
                    <div class="input-group">
                        <label>Activation Keywords</label>
                        <div>${this.activationKeywords}</div>
                    </div>
                    <div class="input-group">
                        <label>Model Name</label>
                        <div>${this.modelName}</div>
                    </div>
                    <div class="input-group">
                        <label>Translate To English</label>
                        <div>${this.translateToEnglish ? 'Yes' : 'No'}</div>
                    </div>
                    <div class="input-group">
                        <label>Split On Word</label>
                        <div>${this.splitOnWord ? 'Yes' : 'No'}</div>
                    </div>
                    <button @click="${this._startEdit}">Edit</button>
                `}
            </div>
        `;
    }
}

customElements.define('speech-to-text-configuration-panel', SpeechToTextConfigurationPanel);
