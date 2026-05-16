/**
 * Smart Page Scribe - Settings Manager
 *
 * Manages the extension settings page including API configuration,
 * document management, and feature toggles.
 * Uses DocUIHelper for shared document management logic.
 *
 * @module settings
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_API_KEY_LENGTH = 10;

const ApiProviders = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  kimi: {
    label: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys'
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelName: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/settings/keys'
  },
  siliconflow: {
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelName: 'deepseek-ai/DeepSeek-V3',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak'
  },
  dashscope: {
    label: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1'
  },
  custom: {
    label: '自定义 OpenAI-compatible API',
    baseUrl: '',
    modelName: '',
    keyUrl: ''
  }
};

// ============================================================================
// SETTINGS MANAGER CLASS
// ============================================================================

class SettingsManager {
  constructor() {
    this.config = {
      apiKey: '',
      baseUrl: '',
      modelName: 'gpt-3.5-turbo',
      smartDescription: true,
      maxTokens: DEFAULT_MAX_TOKENS,
      promptMode: DEFAULT_PROMPT_MODE,
      promptAppend: '',
      customPrompt: DEFAULT_PROMPT_TEMPLATE,
      styleGuide: '',
      documentExamples: {}
    };
    this.api = new DocumentApi();
    this.docUI = new DocUIHelper({
      api: this.api,
      source: '',
      onNotify: (msg, type) => alert(msg),
      getApi: () => this.api
    });
    this.cleanupFunctions = [];
    this.init();
  }

  async init() {
    this.config = await loadConfig();
    this._bindEvents();
    this._initDocumentManagement();
    this._populateForm();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  _bindEvents() {
    this._bindButton('btn-save', () => this.saveConfig());
    this._bindButton('btn-test', () => this.testConnection());
    this._bindButton('btn-toggle-key', () => this._toggleApiKeyVisibility());

    const apiProviderSelect = document.getElementById('api-provider');
    if (apiProviderSelect) {
      const handler = () => this._applyApiProvider(apiProviderSelect.value);
      apiProviderSelect.addEventListener('change', handler);
      this.cleanupFunctions.push(() => apiProviderSelect.removeEventListener('change', handler));
    }

    const baseUrlInput = document.getElementById('base-url');
    if (baseUrlInput) {
      const handler = () => this._syncProviderFromBaseUrl();
      baseUrlInput.addEventListener('input', handler);
      this.cleanupFunctions.push(() => baseUrlInput.removeEventListener('input', handler));
    }

    const promptModeSelect = document.getElementById('prompt-mode');
    if (promptModeSelect) {
      const handler = () => this._syncPromptModeVisibility();
      promptModeSelect.addEventListener('change', handler);
      this.cleanupFunctions.push(() => promptModeSelect.removeEventListener('change', handler));
    }

    const smartDescCheckbox = document.getElementById('smart-description');
    if (smartDescCheckbox) {
      smartDescCheckbox.addEventListener('change', (e) => { this.config.smartDescription = e.target.checked; });
      this.cleanupFunctions.push(() => { smartDescCheckbox.removeEventListener('change', this.config.smartDescription); });
    }
    this._bindDocumentUploadEvents();
  }

  _bindButton(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
      const wrappedHandler = handler.bind(this);
      button.addEventListener('click', wrappedHandler);
      this.cleanupFunctions.push(() => button.removeEventListener('click', wrappedHandler));
    }
  }

  _bindDocumentUploadEvents() {
    const d = this.docUI;
    const browseBtn = document.getElementById('browse-btn');
    const fileInput = document.getElementById('document-file');
    const uploadArea = document.getElementById('upload-area');
    const refreshBtn = document.getElementById('refresh-documents');
    const searchInput = document.getElementById('search-documents');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => d.handleFileSelect(e));
    }
    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput?.click());
      uploadArea.addEventListener('dragover', (e) => d.handleDragOver(e));
      uploadArea.addEventListener('dragleave', (e) => d.handleDragLeave(e));
      uploadArea.addEventListener('drop', (e) => d.handleDrop(e));
    }
    if (refreshBtn) refreshBtn.addEventListener('click', () => d.loadDocumentsList());
    if (searchInput) searchInput.addEventListener('input', debounce((e) => d.loadDocumentsList(e.target.value)));
  }

  // ========================================================================
  // CONFIGURATION MANAGEMENT
  // ========================================================================

  _populateForm() {
    const apiKeyInput = document.getElementById('api-key');
    const apiProviderSelect = document.getElementById('api-provider');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');
    const maxTokensInput = document.getElementById('max-tokens');
    const promptModeSelect = document.getElementById('prompt-mode');
    const defaultPromptPreview = document.getElementById('default-prompt-preview');
    const promptAppendInput = document.getElementById('prompt-append');
    const customPromptInput = document.getElementById('custom-prompt');
    const styleGuideInput = document.getElementById('style-guide');

    if (apiKeyInput && this.config.apiKey) {
      apiKeyInput.value = maskApiKey(this.config.apiKey);
      apiKeyInput.dataset.fullKey = this.config.apiKey;
    }
    if (apiProviderSelect) apiProviderSelect.value = this._inferApiProvider(this.config.baseUrl);
    if (baseUrlInput) baseUrlInput.value = this.config.baseUrl || '';
    if (modelNameInput) modelNameInput.value = this.config.modelName;
    if (smartDescCheckbox) smartDescCheckbox.checked = this.config.smartDescription;
    if (maxTokensInput) maxTokensInput.value = this.config.maxTokens || DEFAULT_MAX_TOKENS;
    if (promptModeSelect) promptModeSelect.value = this.config.promptMode || DEFAULT_PROMPT_MODE;
    if (defaultPromptPreview) defaultPromptPreview.value = DEFAULT_PROMPT_TEMPLATE;
    if (promptAppendInput) promptAppendInput.value = this.config.promptAppend || '';
    if (customPromptInput) customPromptInput.value = this.config.customPrompt || DEFAULT_PROMPT_TEMPLATE;
    if (styleGuideInput) styleGuideInput.value = this.config.styleGuide || '';
    this._populateDocumentExamples(this.config.documentExamples || {});
    this._syncKeyHelp();
    this._syncPromptModeVisibility();
  }

  _populateDocumentExamples(examples) {
    Object.entries(this._getExampleInputs()).forEach(([type, element]) => {
      if (element) element.value = examples[type] || '';
    });
  }

  _getExampleInputs() {
    return {
      'user-guide': document.getElementById('example-user-guide'),
      tutorial: document.getElementById('example-tutorial'),
      testing: document.getElementById('example-testing'),
      'bug-report': document.getElementById('example-bug-report')
    };
  }

  _collectDocumentExamples() {
    return Object.fromEntries(
      Object.entries(this._getExampleInputs())
        .map(([type, element]) => [type, element?.value.trim() || ''])
        .filter(([, value]) => value)
    );
  }

  _applyApiProvider(providerId) {
    const provider = ApiProviders[providerId] || ApiProviders.custom;
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');

    if (providerId !== 'custom') {
      if (baseUrlInput) baseUrlInput.value = provider.baseUrl;
      if (modelNameInput) modelNameInput.value = provider.modelName;
    }

    this._syncKeyHelp(providerId);
  }

  _syncProviderFromBaseUrl() {
    const providerSelect = document.getElementById('api-provider');
    const baseUrl = document.getElementById('base-url')?.value || '';
    if (!providerSelect) return;
    providerSelect.value = this._inferApiProvider(baseUrl);
    this._syncKeyHelp(providerSelect.value);
  }

  _inferApiProvider(baseUrl) {
    const normalized = this._normalizeBaseUrl(baseUrl);
    const matched = Object.entries(ApiProviders).find(([id, provider]) => (
      id !== 'custom' && this._normalizeBaseUrl(provider.baseUrl) === normalized
    ));
    return matched?.[0] || 'custom';
  }

  _normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '').toLowerCase();
  }

  _syncKeyHelp(providerId = document.getElementById('api-provider')?.value || 'custom') {
    const help = document.getElementById('api-key-help');
    const provider = ApiProviders[providerId] || ApiProviders.custom;
    if (!help) return;

    help.replaceChildren();
    if (!provider.keyUrl) {
      help.textContent = '自定义服务商请在对应平台创建 API Key，并确认接口兼容 /chat/completions。';
      return;
    }

    help.append(
      document.createTextNode(`当前选择 ${provider.label}，`),
      createElement('a', {
        href: provider.keyUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        textContent: '去获取 API Key'
      }),
      document.createTextNode('。')
    );
  }

  _syncPromptModeVisibility() {
    const promptMode = document.getElementById('prompt-mode')?.value || DEFAULT_PROMPT_MODE;
    const appendGroup = document.getElementById('prompt-append-group');
    const customGroup = document.getElementById('custom-prompt-group');

    appendGroup?.classList.toggle('hidden', promptMode !== 'append');
    customGroup?.classList.toggle('hidden', promptMode !== 'custom');
  }

  _toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('api-key');
    const toggleBtn = document.getElementById('btn-toggle-key');
    if (!apiKeyInput || !toggleBtn) return;
    if (apiKeyInput.type === 'password') { apiKeyInput.type = 'text'; toggleBtn.textContent = '隐藏'; }
    else { apiKeyInput.type = 'password'; toggleBtn.textContent = '显示'; }
  }

  async saveConfig() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');
    const maxTokensInput = document.getElementById('max-tokens');
    const promptModeSelect = document.getElementById('prompt-mode');
    const promptAppendInput = document.getElementById('prompt-append');
    const customPromptInput = document.getElementById('custom-prompt');
    const styleGuideInput = document.getElementById('style-guide');

    let apiKey = apiKeyInput?.dataset.fullKey || apiKeyInput?.value || '';
    const inputKeyValue = apiKeyInput?.value || '';
    if (inputKeyValue !== maskApiKey(apiKey)) apiKey = inputKeyValue.trim();

    if (!apiKey) { this._showTestResult('请输入API Key', 'error'); return; }
    if (apiKey.length < MIN_API_KEY_LENGTH) { this._showTestResult('API Key长度不足，请检查', 'error'); return; }
    const maxTokens = this._parseMaxTokens(maxTokensInput?.value);
    if (!maxTokens) {
      this._showTestResult(`最大输出 Token 需要在 ${MIN_MAX_TOKENS}-${MAX_MAX_TOKENS} 之间`, 'error');
      return;
    }

    const promptMode = promptModeSelect?.value || DEFAULT_PROMPT_MODE;
    const customPrompt = customPromptInput?.value.trim() || DEFAULT_PROMPT_TEMPLATE;
    if (promptMode === 'custom' && !customPrompt) {
      this._showTestResult('请输入自定义提示词，或切换为追加模式', 'error');
      return;
    }

    this.config = {
      apiKey,
      baseUrl: baseUrlInput?.value.trim() || '',
      modelName: modelNameInput?.value.trim() || 'gpt-3.5-turbo',
      smartDescription: smartDescCheckbox?.checked ?? true,
      maxTokens,
      promptMode,
      promptAppend: promptAppendInput?.value.trim() || '',
      customPrompt,
      styleGuide: styleGuideInput?.value.trim() || '',
      documentExamples: this._collectDocumentExamples()
    };

    try {
      await storagePromise('local', 'set', {
        apiKey: this.config.apiKey, baseUrl: this.config.baseUrl,
        modelName: this.config.modelName,
        smartDescription: this.config.smartDescription,
        maxTokens: this.config.maxTokens,
        promptMode: this.config.promptMode,
        promptAppend: this.config.promptAppend,
        customPrompt: this.config.customPrompt,
        styleGuide: this.config.styleGuide,
        documentExamples: this.config.documentExamples
      });
      if (apiKeyInput) { apiKeyInput.dataset.fullKey = this.config.apiKey; apiKeyInput.value = maskApiKey(this.config.apiKey); }
      this._showTestResult('✅ 配置已保存', 'success');
      setTimeout(() => this._hideTestResult(), 3000);
    } catch (error) {
      this._showTestResult('保存失败：' + error.message, 'error');
    }
  }

  _parseMaxTokens(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOKENS;
    if (parsed < MIN_MAX_TOKENS || parsed > MAX_MAX_TOKENS) return null;
    return parsed;
  }

  async testConnection() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const testBtn = document.getElementById('btn-test');
    if (!apiKeyInput || !testBtn) return;

    let apiKey = apiKeyInput.dataset.fullKey || apiKeyInput.value;
    if (apiKeyInput.value !== maskApiKey(apiKey)) apiKey = apiKeyInput.value.trim();
    const baseUrl = baseUrlInput?.value.trim() || 'https://api.openai.com/v1';
    const modelName = modelNameInput?.value.trim() || 'gpt-3.5-turbo';

    if (!apiKey) { this._showTestResult('请先输入API Key', 'error'); return; }
    if (apiKey.length < MIN_API_KEY_LENGTH) { this._showTestResult('API Key长度不足，请检查', 'error'); return; }
    const urlValidation = validateUrl(baseUrl);
    if (!urlValidation.valid) { this._showTestResult(urlValidation.error, 'error'); return; }

    const originalText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="icon icon-loading" aria-hidden="true"></span> 测试中...';

    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }) },
        API_TEST_TIMEOUT
      );
      if (response.ok) this._showTestResult('✅ 连接成功！API配置有效', 'success');
      else {
        const errorData = await response.json().catch(() => ({}));
        this._showTestResult('连接失败：' + (errorData.error?.message || response.statusText || '未知错误'), 'error');
      }
    } catch (error) {
      this._showTestResult('连接失败：' + ((error.name === 'AbortError') ? '连接超时，请检查网络连接或API地址' : error.message), 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = originalText;
    }
  }

  _showTestResult(message, type) {
    const resultDiv = document.getElementById('test-result');
    if (resultDiv) { resultDiv.textContent = message; resultDiv.className = 'test-result ' + type; resultDiv.classList.remove('hidden'); }
  }

  _hideTestResult() { document.getElementById('test-result')?.classList.add('hidden'); }

  // ========================================================================
  // DOCUMENT MANAGEMENT (delegated to DocUIHelper)
  // ========================================================================

  _initDocumentManagement() { this.docUI.loadDocumentsList(); }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let settingsManager = null;
document.addEventListener('DOMContentLoaded', () => { settingsManager = new SettingsManager(); });
