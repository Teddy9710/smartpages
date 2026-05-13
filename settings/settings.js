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

// ============================================================================
// SETTINGS MANAGER CLASS
// ============================================================================

class SettingsManager {
  constructor() {
    this.config = { apiKey: '', baseUrl: '', modelName: 'gpt-3.5-turbo', smartDescription: true };
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
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');

    if (apiKeyInput && this.config.apiKey) {
      apiKeyInput.value = maskApiKey(this.config.apiKey);
      apiKeyInput.dataset.fullKey = this.config.apiKey;
    }
    if (baseUrlInput) baseUrlInput.value = this.config.baseUrl || '';
    if (modelNameInput) modelNameInput.value = this.config.modelName;
    if (smartDescCheckbox) smartDescCheckbox.checked = this.config.smartDescription;
  }

  _toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('api-key');
    const toggleBtn = document.getElementById('btn-toggle-key');
    if (!apiKeyInput || !toggleBtn) return;
    if (apiKeyInput.type === 'password') { apiKeyInput.type = 'text'; toggleBtn.textContent = '👁 隐藏'; }
    else { apiKeyInput.type = 'password'; toggleBtn.textContent = '👁 显示'; }
  }

  async saveConfig() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');

    let apiKey = apiKeyInput?.dataset.fullKey || apiKeyInput?.value || '';
    const inputKeyValue = apiKeyInput?.value || '';
    if (inputKeyValue !== maskApiKey(apiKey)) apiKey = inputKeyValue.trim();

    if (!apiKey) { this._showTestResult('请输入API Key', 'error'); return; }
    if (apiKey.length < MIN_API_KEY_LENGTH) { this._showTestResult('API Key长度不足，请检查', 'error'); return; }

    this.config = {
      apiKey,
      baseUrl: baseUrlInput?.value.trim() || '',
      modelName: modelNameInput?.value.trim() || 'gpt-3.5-turbo',
      smartDescription: smartDescCheckbox?.checked ?? true
    };

    try {
      await storagePromise('local', 'set', {
        apiKey: this.config.apiKey, baseUrl: this.config.baseUrl,
        modelName: this.config.modelName, smartDescription: this.config.smartDescription
      });
      if (apiKeyInput) { apiKeyInput.dataset.fullKey = this.config.apiKey; apiKeyInput.value = maskApiKey(this.config.apiKey); }
      this._showTestResult('✅ 配置已保存', 'success');
      setTimeout(() => this._hideTestResult(), 3000);
    } catch (error) {
      this._showTestResult('保存失败：' + error.message, 'error');
    }
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
    testBtn.innerHTML = '<span class="icon">⏳</span> 测试中...';

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
