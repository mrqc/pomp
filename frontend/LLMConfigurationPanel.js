import { LitElement, html, css } from "lit";

class LLMConfigurationPanel extends LitElement {
    static styles = css`
        :host { 
            display: block; 
            padding: 16px; 
            color: #FFF;
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            background: transparent;
        }
        .provider {
            border: 1px solid #232B4D;
            margin-bottom: 24px;
            padding: 20px;
            border-radius: 14px;
            background: #23243a;
            box-shadow: 0 2px 8px 0 rgba(35,43,77,0.08);
        }
        .models {
            margin-left: 0;
            margin-top: 18px;
        }
        .section-title {
            font-weight: 700;
            margin-top: 0;
            margin-bottom: 18px;
            font-size: 1.25rem;
            letter-spacing: 0.01em;
            color: #3B82F6;
        }
        form {
            margin-top: 12px;
            margin-bottom: 12px;
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
        input, select, textarea {
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
        input:focus, select:focus, textarea:focus {
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
        .model-box {
            border: 1px solid #232B4D;
            margin: 10px 0;
            padding: 14px;
            border-radius: 10px;
            background: #23243a;
        }
        .monospace {
            font-family: 'JetBrains Mono', 'Fira Mono', 'Menlo', monospace;
            font-size: 1.08rem;
        }
    `;

    static properties = {
        providers: { type: Array },
        editingProviderIndex: { type: Number },
        editingModelIndex: { type: Number },
        newProvider: { type: Object },
        newModel: { type: Object },
    };

    constructor() {
        super();
        this.providers = [];
        this.editingProviderIndex = null;
        this.editingModelIndex = null;
        this.newProvider = this._emptyProvider();
        this.newModel = this._emptyModel();
    }

    _emptyProvider() {
        return {
            type: '',
            baseUrl: '',
            apiKey: '',
            api: '',
            models: [],
            active: true
        };
    }

    _emptyModel() {
        return {
            id: '',
            name: '',
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 0,
            maxTokens: 0,
            active: true
        };
    }

    render() {
        return html`
            <div id="configuration">
                <div class="section-title">Registered Providers</div>
                ${this.providers.length === 0 ? html`<div>No providers registered.</div>` : ''}
                ${this.providers.map((provider, pIdx) => html`
                    <div class="provider">
                        <div class="input-group"><label>Provider Name</label><div>${provider.type}</div></div>
                        <div class="input-group"><label>Base URL</label><div>${provider.baseUrl}</div></div>
                        <div class="input-group"><label>API Key</label><div class="monospace">${provider.apiKey}</div></div>
                        <div class="input-group"><label>API</label><div>${provider.api}</div></div>
                        <div class="input-group"><label>Active</label><div>${provider.active ? 'Yes' : 'No'}</div></div>
                        <div class="models">
                            <div class="section-title">Models</div>
                            ${provider.models.length === 0 ? html`<div>No models.</div>` : ''}
                            ${provider.models.map((model, mIdx) => html`
                                <div class="model-box">
                                    <div class="input-group"><label>ID</label><div>${model.id}</div></div>
                                    <div class="input-group"><label>Name</label><div>${model.name}</div></div>
                                    <div class="input-group"><label>Reasoning</label><div>${model.reasoning ? 'Yes' : 'No'}</div></div>
                                    <div class="input-group"><label>Input</label><div>${model.input.join(', ')}</div></div>
                                    <div class="input-group"><label>Cost</label><div>input: ${model.cost.input}, output: ${model.cost.output}, cacheRead: ${model.cost.cacheRead}, cacheWrite: ${model.cost.cacheWrite}</div></div>
                                    <div class="input-group"><label>Context Window</label><div>${model.contextWindow}</div></div>
                                    <div class="input-group"><label>Max Tokens</label><div>${model.maxTokens}</div></div>
                                    <div class="input-group"><label>Active</label><div>${model.active ? 'Yes' : 'No'}</div></div>
                                    <button @click="${() => this._editModel(pIdx, mIdx)}">Edit Model</button>
                                    <button @click="${() => this._removeModel(pIdx, mIdx)}">Remove Model</button>
                                </div>
                            `)}
                            <div>
                                <button @click="${() => this._showAddModel(pIdx)}">Add Model</button>
                            </div>
                            ${this.editingProviderIndex === pIdx && this.editingModelIndex === -1 ? this._renderModelForm(pIdx, -1) : ''}
                        </div>
                        <button @click="${() => this._editProvider(pIdx)}">Edit Provider</button>
                        <button @click="${() => this._removeProvider(pIdx)}">Remove Provider</button>
                        ${this.editingProviderIndex === pIdx && this.editingModelIndex === null ? this._renderProviderForm(pIdx) : ''}
                    </div>
                `)}
                <div class="section-title">Add New Provider</div>
                ${this._renderProviderForm(null)}
            </div>
        `;
    }

    _renderProviderForm(pIdx) {
        const provider = pIdx === null ? this.newProvider : this.providers[pIdx];
        return html`
            <form @submit="${e => this._saveProvider(e, pIdx)}">
                <div class="input-group">
                    <label>Type</label>
                    <input .value="${provider.type}" @input="${e => this._updateProviderField(e, 'type', pIdx)}" required>
                </div>
                <div class="input-group">
                    <label>Base URL</label>
                    <input .value="${provider.baseUrl}" @input="${e => this._updateProviderField(e, 'baseUrl', pIdx)}" required>
                </div>
                <div class="input-group">
                    <label>API Key</label>
                    <input .value="${provider.apiKey}" @input="${e => this._updateProviderField(e, 'apiKey', pIdx)}" required>
                </div>
                <div class="input-group">
                    <label>API</label>
                    <input .value="${provider.api}" @input="${e => this._updateProviderField(e, 'api', pIdx)}" required>
                </div>
                <div class="input-group">
                    <label>Active</label>
                    <input type="checkbox" .checked="${provider.active}" @change="${e => this._updateProviderField(e, 'active', pIdx, true)}">
                </div>
                <button type="submit">${pIdx === null ? 'Add Provider' : 'Save Provider'}</button>
                ${pIdx !== null ? html`<button type="button" @click="${() => this._cancelEditProvider()}">Cancel</button>` : ''}
            </form>
        `;
    }

    _renderModelForm(pIdx, mIdx) {
        const model = mIdx === -1 ? this.newModel : this.providers[pIdx].models[mIdx];
        return html`
            <form @submit="${e => this._saveModel(e, pIdx, mIdx)}">
                <div class="input-group">
                    <label>ID</label>
                    <input .value="${model.id}" @input="${e => this._updateModelField(e, 'id', pIdx, mIdx)}" required>
                </div>
                <div class="input-group">
                    <label>Name</label>
                    <input .value="${model.name}" @input="${e => this._updateModelField(e, 'name', pIdx, mIdx)}" required>
                </div>
                <div class="input-group">
                    <label>Reasoning</label>
                    <input type="checkbox" .checked="${model.reasoning}" @change="${e => this._updateModelField(e, 'reasoning', pIdx, mIdx, true)}">
                </div>
                <div class="input-group">
                    <label>Input</label>
                    <input .value="${model.input.join(', ')}" @input="${e => this._updateModelField(e, 'input', pIdx, mIdx)}" required>
                </div>
                <div class="input-group">
                    <label>Cost (input)</label>
                    <input type="number" step="0.001" .value="${model.cost.input}" @input="${e => this._updateModelCostField(e, 'input', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Cost (output)</label>
                    <input type="number" step="0.001" .value="${model.cost.output}" @input="${e => this._updateModelCostField(e, 'output', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Cost (cacheRead)</label>
                    <input type="number" step="0.001" .value="${model.cost.cacheRead}" @input="${e => this._updateModelCostField(e, 'cacheRead', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Cost (cacheWrite)</label>
                    <input type="number" step="0.001" .value="${model.cost.cacheWrite}" @input="${e => this._updateModelCostField(e, 'cacheWrite', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Context Window</label>
                    <input type="number" .value="${model.contextWindow}" @input="${e => this._updateModelField(e, 'contextWindow', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Max Tokens</label>
                    <input type="number" .value="${model.maxTokens}" @input="${e => this._updateModelField(e, 'maxTokens', pIdx, mIdx)}">
                </div>
                <div class="input-group">
                    <label>Active</label>
                    <input type="checkbox" .checked="${model.active}" @change="${e => this._updateModelField(e, 'active', pIdx, mIdx, true)}">
                </div>
                <button type="submit">${mIdx === -1 ? 'Add Model' : 'Save Model'}</button>
                <button type="button" @click="${() => this._cancelEditModel()}">Cancel</button>
            </form>
        `;
    }

    _updateProviderField(e, field, pIdx, isCheckbox = false) {
        const value = isCheckbox ? e.target.checked : e.target.value;
        if (pIdx === null) {
            this.newProvider = { ...this.newProvider, [field]: value };
        } else {
            const providers = [...this.providers];
            providers[pIdx] = { ...providers[pIdx], [field]: value };
            this.providers = providers;
        }
    }

    _saveProvider(e, pIdx) {
        e.preventDefault();
        if (pIdx === null) {
            this.providers = [...this.providers, { ...this.newProvider, models: [] }];
            this.newProvider = this._emptyProvider();
        } else {
            this.editingProviderIndex = null;
        }
    }

    _editProvider(pIdx) {
        this.editingProviderIndex = pIdx;
        this.editingModelIndex = null;
    }

    _removeProvider(pIdx) {
        this.providers = this.providers.filter((_, idx) => idx !== pIdx);
    }

    _cancelEditProvider() {
        this.editingProviderIndex = null;
    }

    _showAddModel(pIdx) {
        this.editingProviderIndex = pIdx;
        this.editingModelIndex = -1;
        this.newModel = this._emptyModel();
    }

    _editModel(pIdx, mIdx) {
        this.editingProviderIndex = pIdx;
        this.editingModelIndex = mIdx;
    }

    _removeModel(pIdx, mIdx) {
        const providers = [...this.providers];
        providers[pIdx].models = providers[pIdx].models.filter((_, idx) => idx !== mIdx);
        this.providers = providers;
    }

    _cancelEditModel() {
        this.editingModelIndex = null;
    }

    _updateModelField(e, field, pIdx, mIdx, isCheckbox = false) {
        const value = isCheckbox ? e.target.checked : e.target.value;
        if (mIdx === -1) {
            if (field === 'input') {
                this.newModel = { ...this.newModel, input: value.split(',').map(s => s.trim()) };
            } else {
                this.newModel = { ...this.newModel, [field]: value };
            }
        } else {
            const providers = [...this.providers];
            const models = [...providers[pIdx].models];
            if (field === 'input') {
                models[mIdx] = { ...models[mIdx], input: value.split(',').map(s => s.trim()) };
            } else {
                models[mIdx] = { ...models[mIdx], [field]: value };
            }
            providers[pIdx].models = models;
            this.providers = providers;
        }
    }

    _updateModelCostField(e, costField, pIdx, mIdx) {
        const value = parseFloat(e.target.value);
        if (mIdx === -1) {
            this.newModel = { ...this.newModel, cost: { ...this.newModel.cost, [costField]: value } };
        } else {
            const providers = [...this.providers];
            const models = [...providers[pIdx].models];
            models[mIdx] = { ...models[mIdx], cost: { ...models[mIdx].cost, [costField]: value } };
            providers[pIdx].models = models;
            this.providers = providers;
        }
    }

    _saveModel(e, pIdx, mIdx) {
        e.preventDefault();
        const providers = [...this.providers];
        if (mIdx === -1) {
            providers[pIdx].models = [...providers[pIdx].models, { ...this.newModel }];
            this.newModel = this._emptyModel();
        } else {
            // nothing to do, as edits are live
        }
        this.providers = providers;
        this.editingModelIndex = null;
    }
}

customElements.define('llm-configuration-panel', LLMConfigurationPanel);
