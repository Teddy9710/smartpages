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
    label: 'GPT / OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    apiFormat: 'openai'
  },
  gemini: {
    label: 'Gemini / Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelName: 'gemini-3-flash-preview',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    apiFormat: 'openai'
  },
  claude: {
    label: 'Claude / Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modelName: 'claude-sonnet-4-20250514',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    apiFormat: 'anthropic'
  },
  glm: {
    label: 'GLM / Z.AI',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    modelName: 'glm-4.5',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    apiFormat: 'openai'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    apiFormat: 'openai'
  },
  minimax: {
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    modelName: 'MiniMax-M1',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    apiFormat: 'openai'
  },
  kimi: {
    label: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelName: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    apiFormat: 'openai'
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelName: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/settings/keys',
    apiFormat: 'openai'
  },
  siliconflow: {
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelName: 'deepseek-ai/DeepSeek-V3',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    apiFormat: 'openai'
  },
  dashscope: {
    label: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    apiFormat: 'openai'
  },
  custom: {
    label: '自定义 OpenAI-compatible API',
    baseUrl: '',
    modelName: '',
    keyUrl: '',
    apiFormat: 'openai'
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
      apiFormat: DEFAULT_API_FORMAT,
      appLanguage: DEFAULT_APP_LANGUAGE,
      smartDescription: true,
      maxTokens: DEFAULT_MAX_TOKENS,
      promptMode: DEFAULT_PROMPT_MODE,
      outputFormat: DEFAULT_OUTPUT_FORMAT,
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
      getApi: () => this.api,
      actions: this._getReferenceDocumentActions()
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

    const appLanguageSelect = document.getElementById('app-language');
    if (appLanguageSelect) {
      const handler = () => {
        this.config.appLanguage = appLanguageSelect.value || DEFAULT_APP_LANGUAGE;
        this._applyLanguage();
      };
      appLanguageSelect.addEventListener('change', handler);
      this.cleanupFunctions.push(() => appLanguageSelect.removeEventListener('change', handler));
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
    const appLanguageSelect = document.getElementById('app-language');
    const apiProviderSelect = document.getElementById('api-provider');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');
    const maxTokensInput = document.getElementById('max-tokens');
    const outputFormatSelect = document.getElementById('output-format');
    const promptModeSelect = document.getElementById('prompt-mode');
    const defaultPromptPreview = document.getElementById('default-prompt-preview');
    const promptAppendInput = document.getElementById('prompt-append');
    const customPromptInput = document.getElementById('custom-prompt');
    const styleGuideInput = document.getElementById('style-guide');

    if (apiKeyInput && this.config.apiKey) {
      apiKeyInput.value = maskApiKey(this.config.apiKey);
      apiKeyInput.dataset.fullKey = this.config.apiKey;
    }
    if (appLanguageSelect) appLanguageSelect.value = this.config.appLanguage || DEFAULT_APP_LANGUAGE;
    if (apiProviderSelect) apiProviderSelect.value = this._inferApiProvider(this.config.baseUrl);
    if (baseUrlInput) baseUrlInput.value = this.config.baseUrl || '';
    if (modelNameInput) modelNameInput.value = this.config.modelName;
    if (smartDescCheckbox) smartDescCheckbox.checked = this.config.smartDescription;
    if (maxTokensInput) maxTokensInput.value = this.config.maxTokens || DEFAULT_MAX_TOKENS;
    if (outputFormatSelect) outputFormatSelect.value = this.config.outputFormat || DEFAULT_OUTPUT_FORMAT;
    if (promptModeSelect) promptModeSelect.value = this.config.promptMode || DEFAULT_PROMPT_MODE;
    if (defaultPromptPreview) defaultPromptPreview.value = DEFAULT_PROMPT_TEMPLATE;
    if (promptAppendInput) promptAppendInput.value = this.config.promptAppend || '';
    if (customPromptInput) customPromptInput.value = this.config.customPrompt || DEFAULT_PROMPT_TEMPLATE;
    if (styleGuideInput) styleGuideInput.value = this.config.styleGuide || '';
    this._populateDocumentExamples(this.config.documentExamples || {});
    this._syncKeyHelp();
    this._syncPromptModeVisibility();
    this._applyLanguage();
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

  _getReferenceDocumentActions() {
    return [
      { label: '设为风格指南', className: 'apply', onClick: (doc) => this._applyReferenceDocument(doc, 'style-guide') },
      { label: '用户指南示例', className: 'apply', onClick: (doc) => this._applyReferenceDocument(doc, 'example-user-guide') },
      { label: '教程示例', className: 'apply', onClick: (doc) => this._applyReferenceDocument(doc, 'example-tutorial') },
      { label: '测试示例', className: 'apply', onClick: (doc) => this._applyReferenceDocument(doc, 'example-testing') },
      { label: '问题示例', className: 'apply', onClick: (doc) => this._applyReferenceDocument(doc, 'example-bug-report') }
    ];
  }

  async _applyReferenceDocument(doc, targetId) {
    try {
      const result = await this.api.getDocumentContent(doc.id);
      if (!result.success) {
        this._showTestResult('读取参考文档失败：' + result.message, 'error');
        return;
      }
      const target = document.getElementById(targetId);
      if (!target) return;
      target.value = result.document.content || '';
      target.focus();
      this._showTestResult('已填入参考文档，请点击保存配置生效', 'success');
    } catch (error) {
      this._showTestResult('读取参考文档失败：' + error.message, 'error');
    }
  }

  _applyApiProvider(providerId) {
    const provider = ApiProviders[providerId] || ApiProviders.custom;
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');

    if (providerId !== 'custom') {
      if (baseUrlInput) baseUrlInput.value = provider.baseUrl;
      if (modelNameInput) modelNameInput.value = provider.modelName;
    }

    this.config.apiFormat = provider.apiFormat || DEFAULT_API_FORMAT;
    this._syncKeyHelp(providerId);
  }

  _syncProviderFromBaseUrl() {
    const providerSelect = document.getElementById('api-provider');
    const baseUrl = document.getElementById('base-url')?.value || '';
    if (!providerSelect) return;
    providerSelect.value = this._inferApiProvider(baseUrl);
    this.config.apiFormat = (ApiProviders[providerSelect.value] || ApiProviders.custom).apiFormat || DEFAULT_API_FORMAT;
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
    const isEn = (this.config.appLanguage || DEFAULT_APP_LANGUAGE) === 'en-US';
    if (apiKeyInput.type === 'password') { apiKeyInput.type = 'text'; toggleBtn.textContent = isEn ? 'Hide' : '隐藏'; }
    else { apiKeyInput.type = 'password'; toggleBtn.textContent = isEn ? 'Show' : '显示'; }
  }

  async saveConfig() {
    const apiKeyInput = document.getElementById('api-key');
    const appLanguageSelect = document.getElementById('app-language');
    const apiProviderSelect = document.getElementById('api-provider');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');
    const maxTokensInput = document.getElementById('max-tokens');
    const outputFormatSelect = document.getElementById('output-format');
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
      apiFormat: (ApiProviders[apiProviderSelect?.value] || ApiProviders.custom).apiFormat || DEFAULT_API_FORMAT,
      appLanguage: appLanguageSelect?.value || DEFAULT_APP_LANGUAGE,
      smartDescription: smartDescCheckbox?.checked ?? true,
      maxTokens,
      outputFormat: outputFormatSelect?.value || DEFAULT_OUTPUT_FORMAT,
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
        apiFormat: this.config.apiFormat,
        appLanguage: this.config.appLanguage,
        smartDescription: this.config.smartDescription,
        maxTokens: this.config.maxTokens,
        outputFormat: this.config.outputFormat,
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
    const apiProviderSelect = document.getElementById('api-provider');
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
    const apiFormat = (ApiProviders[apiProviderSelect?.value] || ApiProviders.custom).apiFormat || DEFAULT_API_FORMAT;

    const originalText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="icon icon-loading" aria-hidden="true"></span> 测试中...';

    try {
      const request = buildModelApiRequest(
        { apiKey, baseUrl, modelName, apiFormat, maxTokens: 5 },
        'Hi',
        { maxTokens: 5, temperature: 0 }
      );
      const response = await fetchWithTimeout(
        request.url,
        request.fetchOptions,
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

  _applyLanguage() {
    const lang = this.config.appLanguage === 'en-US' ? 'en-US' : 'zh-CN';
    document.documentElement.lang = lang;
    const isEn = lang === 'en-US';
    const text = isEn ? {
      title: 'Settings',
      subtitle: 'Model, prompt, and reference document management',
      apiHeading: 'API Configuration',
      apiDesc: 'Configure model API credentials for AI features',
      language: 'Interface Language',
      provider: 'Model Provider',
      providerHelp: 'Selecting a provider fills the Base URL, recommended model, and API format. You can still edit them.',
      baseUrl: 'Base URL (optional)',
      baseHelp: 'Leave empty to use the default OpenAI API URL',
      model: 'Model Name',
      modelHelp: 'For example: gpt-4o-mini, gemini-3-flash-preview, claude-sonnet-4-20250514',
      maxTokens: 'Max Output Tokens',
      outputFormat: 'Default Output Format',
      promptMode: 'Prompt Mode',
      test: 'Test Connection',
      save: 'Save Settings',
      docsHeading: 'Reference Document Management',
      docsDesc: 'Upload style guides or sample documents and apply them to generation settings.',
      uploadTitle: 'Drag files here or click to upload',
      uploadHelp: 'Supported formats: PDF, DOCX, TXT, MD, HTML',
      browse: 'Browse Files',
      search: 'Search documents...',
      refresh: 'Refresh',
      smartHeading: 'Smart Features',
      smartTitle: 'Enable smart task description inference',
      smartDesc: 'AI will analyze your operations and infer the task intent',
      show: 'Show',
      hide: 'Hide'
    } : {
      title: '设置',
      subtitle: '模型、提示词与文档资源管理',
      apiHeading: 'API 配置',
      apiDesc: '配置大模型 API 凭证以使用 AI 功能',
      language: '界面语言',
      provider: '模型服务商',
      providerHelp: '选择服务商会自动填入 Base URL、推荐模型和 API 格式；仍可手动修改。',
      baseUrl: 'Base URL（可选）',
      baseHelp: '留空使用默认的 OpenAI API 地址',
      model: '模型名称',
      modelHelp: '例如：gpt-4o-mini、gemini-3-flash-preview、claude-sonnet-4-20250514',
      maxTokens: '最大输出 Token',
      outputFormat: '默认输出格式',
      promptMode: '提示词模式',
      test: '测试连接',
      save: '保存设置',
      docsHeading: '参考文档管理',
      docsDesc: '上传风格指南或示例文档，然后一键应用到生成配置。',
      uploadTitle: '拖拽文件到这里或点击上传',
      uploadHelp: '支持格式: PDF, DOCX, TXT, MD, HTML',
      browse: '浏览文件',
      search: '搜索文档...',
      refresh: '刷新',
      smartHeading: '智能功能',
      smartTitle: '启用智能任务描述推测',
      smartDesc: 'AI 将自动分析您的操作并推测任务意图',
      show: '显示',
      hide: '隐藏'
    };

    document.title = `${text.title} - Smart Page Scribe`;
    const set = (selector, value) => {
      const el = document.querySelector(selector);
      if (el && value) el.textContent = value;
    };
    const setButton = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const icon = el.querySelector('.icon');
      el.textContent = '';
      if (icon) el.appendChild(icon);
      el.append(document.createTextNode(icon ? ` ${value}` : value));
    };

    set('.header h1', text.title);
    set('.header p', text.subtitle);
    set('.section:nth-of-type(1) h2', text.apiHeading);
    set('.section:nth-of-type(1) .section-desc', text.apiDesc);
    set('label[for="app-language"]', text.language);
    set('label[for="api-provider"]', text.provider);
    set('#api-provider + .help-text', text.providerHelp);
    set('label[for="base-url"]', text.baseUrl);
    set('#base-url + .help-text', text.baseHelp);
    set('label[for="model-name"]', text.model);
    set('#model-name + .help-text', text.modelHelp);
    set('label[for="max-tokens"]', text.maxTokens);
    set('label[for="output-format"]', text.outputFormat);
    set('label[for="prompt-mode"]', text.promptMode);
    setButton('#btn-test', text.test);
    setButton('#btn-save', text.save);
    set('.section:nth-of-type(2) h2', text.docsHeading);
    set('.section:nth-of-type(2) .section-desc', text.docsDesc);
    set('.upload-content h3', text.uploadTitle);
    set('.upload-help', text.uploadHelp);
    setButton('#browse-btn', text.browse);
    set('#search-documents', text.search);
    const search = document.getElementById('search-documents');
    if (search) search.placeholder = text.search;
    setButton('#refresh-documents', text.refresh);
    set('.section:nth-of-type(3) h2', text.smartHeading);
    set('.switch-title', text.smartTitle);
    set('.switch-desc', text.smartDesc);
    const toggle = document.getElementById('btn-toggle-key');
    if (toggle) toggle.textContent = document.getElementById('api-key')?.type === 'text' ? text.hide : text.show;
  }

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
