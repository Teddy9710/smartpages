/**
 * Smart Page Scribe - Settings Manager
 *
 * Manages the extension settings page including:
 * - API configuration
 * - Document management
 * - Feature toggles
 *
 * @module settings
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {number} TEST_TIMEOUT - API test timeout in milliseconds */
const TEST_TIMEOUT = 10000;

/** @constant {number} MIN_API_KEY_LENGTH - Minimum API key length */
const MIN_API_KEY_LENGTH = 10;

// ============================================================================
// SETTINGS MANAGER CLASS
// ============================================================================

/**
 * Manages the settings page UI and functionality
 * @class
 */
class SettingsManager {
  constructor() {
    /** @type {Config} */
    this.config = {
      apiKey: '',
      baseUrl: '',
      modelName: 'gpt-3.5-turbo',
      smartDescription: true
    };

    /** @type {DocumentUploader} */
    this.uploader = new DocumentUploader();

    /** @type {DocumentApi} */
    this.api = new DocumentApi();

    /** @type {Array<Function>} Cleanup functions */
    this.cleanupFunctions = [];

    this.init();
  }

  /**
   * Initializes the settings manager
   * @async
   */
  async init() {
    await this._loadConfig();
    this._bindEvents();
    this._initDocumentManagement();
    this._populateForm();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  /**
   * Binds all UI events
   * @private
   */
  _bindEvents() {
    // API Configuration buttons
    this._bindButton('btn-save', () => this.saveConfig());
    this._bindButton('btn-test', () => this.testConnection());
    this._bindButton('btn-toggle-key', () => this._toggleApiKeyVisibility());

    // Smart description toggle
    const smartDescCheckbox = document.getElementById('smart-description');
    if (smartDescCheckbox) {
      smartDescCheckbox.addEventListener('change', (e) => {
        this.config.smartDescription = e.target.checked;
      });
      this.cleanupFunctions.push(() => {
        smartDescCheckbox.removeEventListener('change', this.config.smartDescription);
      });
    }

    // Document upload events
    this._bindDocumentUploadEvents();
  }

  /**
   * Binds a button click event
   * @private
   * @param {string} buttonId - Button element ID
   * @param {Function} handler - Click handler
   */
  _bindButton(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
      const wrappedHandler = handler.bind(this);
      button.addEventListener('click', wrappedHandler);
      this.cleanupFunctions.push(() => {
        button.removeEventListener('click', wrappedHandler);
      });
    } else {
      console.warn(`[Scribe:Settings] Button '${buttonId}' not found`);
    }
  }

  /**
   * Binds document upload events
   * @private
   */
  _bindDocumentUploadEvents() {
    const browseBtn = document.getElementById('browse-btn');
    const fileInput = document.getElementById('document-file');
    const uploadArea = document.getElementById('upload-area');
    const refreshBtn = document.getElementById('refresh-documents');
    const searchInput = document.getElementById('search-documents');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
    }

    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput?.click());
      uploadArea.addEventListener('dragover', (e) => this._handleDragOver(e));
      uploadArea.addEventListener('dragleave', (e) => this._handleDragLeave(e));
      uploadArea.addEventListener('drop', (e) => this._handleDrop(e));
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadDocumentsList());
    }

    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        this.loadDocumentsList(e.target.value);
      }));
    }
  }

  // ========================================================================
  // CONFIGURATION MANAGEMENT
  // ========================================================================

  /**
   * Loads configuration from storage
   * @private
   * @async
   */
  async _loadConfig() {
    try {
      const result = await storagePromise('local', 'get', [
        'apiKey', 'baseUrl', 'modelName', 'smartDescription'
      ]);

      if (result.apiKey) this.config.apiKey = result.apiKey;
      if (result.baseUrl) this.config.baseUrl = result.baseUrl;
      if (result.modelName) this.config.modelName = result.modelName;
      if (result.smartDescription !== undefined) {
        this.config.smartDescription = result.smartDescription;
      }
    } catch (error) {
      console.error('[Scribe:Settings] Failed to load config:', error);
    }
  }

  /**
   * Populates the form with current configuration
   * @private
   */
  _populateForm() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');

    if (apiKeyInput && this.config.apiKey) {
      apiKeyInput.value = maskApiKey(this.config.apiKey);
      apiKeyInput.dataset.fullKey = this.config.apiKey;
    }

    if (baseUrlInput) {
      baseUrlInput.value = this.config.baseUrl || '';
    }

    if (modelNameInput) {
      modelNameInput.value = this.config.modelName;
    }

    if (smartDescCheckbox) {
      smartDescCheckbox.checked = this.config.smartDescription;
    }
  }

  /**
   * Toggles API key visibility
   * @private
   */
  _toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('api-key');
    const toggleBtn = document.getElementById('btn-toggle-key');

    if (!apiKeyInput || !toggleBtn) return;

    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '👁 隐藏';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁 显示';
    }
  }

  /**
   * Saves the current configuration
   * @async
   */
  async saveConfig() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const smartDescCheckbox = document.getElementById('smart-description');

    // Get API key (from data attribute or input)
    let apiKey = apiKeyInput?.dataset.fullKey || apiKeyInput?.value || '';
    const inputKeyValue = apiKeyInput?.value || '';

    // Check if user modified the API key
    if (inputKeyValue !== maskApiKey(apiKey)) {
      apiKey = inputKeyValue.trim();
    }

    // Validate API key
    if (!apiKey) {
      this._showTestResult('请输入API Key', 'error');
      return;
    }

    if (apiKey.length < MIN_API_KEY_LENGTH) {
      this._showTestResult('API Key长度不足，请检查', 'error');
      return;
    }

    // Build config object
    this.config = {
      apiKey,
      baseUrl: baseUrlInput?.value.trim() || '',
      modelName: modelNameInput?.value.trim() || 'gpt-3.5-turbo',
      smartDescription: smartDescCheckbox?.checked ?? true
    };

    try {
      await storagePromise('local', 'set', {
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        modelName: this.config.modelName,
        smartDescription: this.config.smartDescription
      });

      // Update data attribute and display
      if (apiKeyInput) {
        apiKeyInput.dataset.fullKey = this.config.apiKey;
        apiKeyInput.value = maskApiKey(this.config.apiKey);
      }

      this._showTestResult('✅ 配置已保存', 'success');

      // Auto-hide after 3 seconds
      setTimeout(() => {
        this._hideTestResult();
      }, 3000);
    } catch (error) {
      console.error('[Scribe:Settings] Failed to save config:', error);
      this._showTestResult('保存失败：' + error.message, 'error');
    }
  }

  /**
   * Tests the API connection
   * @async
   */
  async testConnection() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrlInput = document.getElementById('base-url');
    const modelNameInput = document.getElementById('model-name');
    const testBtn = document.getElementById('btn-test');

    if (!apiKeyInput || !testBtn) {
      console.error('[Scribe:Settings] Required elements not found');
      return;
    }

    // Get current values
    let apiKey = apiKeyInput.dataset.fullKey || apiKeyInput.value;
    if (apiKeyInput.value !== maskApiKey(apiKey)) {
      apiKey = apiKeyInput.value.trim();
    }

    const baseUrl = baseUrlInput?.value.trim() || 'https://api.openai.com/v1';
    const modelName = modelNameInput?.value.trim() || 'gpt-3.5-turbo';

    // Validate inputs
    if (!apiKey) {
      this._showTestResult('请先输入API Key', 'error');
      return;
    }

    if (apiKey.length < MIN_API_KEY_LENGTH) {
      this._showTestResult('API Key长度不足，请检查', 'error');
      return;
    }

    const urlValidation = validateUrl(baseUrl);
    if (!urlValidation.valid) {
      this._showTestResult(urlValidation.error, 'error');
      return;
    }

    // Show loading state
    const originalText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="icon">⏳</span> 测试中...';

    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        },
        TEST_TIMEOUT
      );

      if (response.ok) {
        this._showTestResult('✅ 连接成功！API配置有效', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || response.statusText || '未知错误';
        this._showTestResult('连接失败：' + errMsg, 'error');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this._showTestResult('连接超时，请检查网络连接或API地址', 'error');
      } else {
        this._showTestResult('连接失败：' + error.message, 'error');
      }
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = originalText;
    }
  }

  /**
   * Shows the test result message
   * @private
   * @param {string} message - Result message
   * @param {string} type - Result type ('success' or 'error')
   */
  _showTestResult(message, type) {
    const resultDiv = document.getElementById('test-result');
    if (resultDiv) {
      resultDiv.textContent = message;
      resultDiv.className = `test-result ${type}`;
      resultDiv.classList.remove('hidden');
    }
  }

  /**
   * Hides the test result message
   * @private
   */
  _hideTestResult() {
    const resultDiv = document.getElementById('test-result');
    if (resultDiv) {
      resultDiv.classList.add('hidden');
    }
  }

  // ========================================================================
  // DOCUMENT MANAGEMENT
  // ========================================================================

  /**
   * Initializes document management
   * @private
   */
  _initDocumentManagement() {
    this.loadDocumentsList();
  }

  /**
   * Handles file selection
   * @private
   * @param {Event} event - File input change event
   */
  _handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
      this._processFile(files[0]);
    }
  }

  /**
   * Handles drag over event
   * @private
   * @param {DragEvent} event - Drag event
   */
  _handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('upload-area')?.classList.add('dragover');
  }

  /**
   * Handles drag leave event
   * @private
   * @param {DragEvent} event - Drag event
   */
  _handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('upload-area')?.classList.remove('dragover');
  }

  /**
   * Handles drop event
   * @private
   * @param {DragEvent} event - Drop event
   */
  async _handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    document.getElementById('upload-area')?.classList.remove('dragover');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      await this._processFile(files[0]);
    }
  }

  /**
   * Processes an uploaded file
   * @private
   * @param {File} file - File to process
   */
  async _processFile(file) {
    if (!isSupportedFileFormat(file)) {
      this._showUploadResult('不支持的文件格式。支持的格式: ' + SUPPORTED_FILE_FORMATS.join(', '), 'error');
      return;
    }

    if (!isValidFileSize(file)) {
      this._showUploadResult('文件过大，请上传 5MB 以内的文件', 'error');
      return;
    }

    this._showProgress(0, '准备上传...');

    try {
      this._showProgress(30, '正在读取文件...');

      const result = await this.api.handleUploadRequest(file);

      if (result.success) {
        this._showProgress(100, '上传完成！');
        this._showUploadResult('文档上传成功！', 'success');

        setTimeout(() => {
          this.loadDocumentsList();
          this._hideProgress();
        }, 1000);
      } else {
        this._showUploadResult(result.message, 'error');
        this._hideProgress();
      }
    } catch (error) {
      this._showUploadResult(`上传失败: ${error.message}`, 'error');
      this._hideProgress();
    }
  }

  /**
   * Shows upload progress
   * @private
   * @param {number} percent - Progress percentage
   * @param {string} text - Progress text
   */
  _showProgress(percent, text) {
    const container = document.getElementById('upload-progress');
    const bar = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');

    if (container) container.classList.remove('hidden');
    if (bar) bar.style.width = percent + '%';
    if (textEl) textEl.textContent = text || percent + '%';
  }

  /**
   * Hides upload progress
   * @private
   */
  _hideProgress() {
    document.getElementById('upload-progress')?.classList.add('hidden');
  }

  /**
   * Shows upload result message
   * @private
   * @param {string} message - Result message
   * @param {string} type - Message type ('success' or 'error')
   */
  _showUploadResult(message, type) {
    const resultDiv = document.getElementById('upload-result');
    if (resultDiv) {
      resultDiv.textContent = message;
      resultDiv.className = `upload-result ${type}`;
      resultDiv.classList.remove('hidden');

      setTimeout(() => {
        resultDiv.classList.add('hidden');
      }, 3000);
    }
  }

  /**
   * Loads the documents list
   * @param {string} [filter=''] - Optional filter string
   */
  async loadDocumentsList(filter = '') {
    const container = document.getElementById('documents-list');
    if (!container) return;

    container.innerHTML = '';
    container.appendChild(createElement('div', { className: 'loading-placeholder' }, '正在加载文档列表...'));

    try {
      const result = await this.api.getDocumentsList();

      if (result.success) {
        const filteredDocs = filter
          ? result.documents.filter(doc =>
              doc.name.toLowerCase().includes(filter.toLowerCase())
            )
          : result.documents;

        if (filteredDocs.length > 0) {
          container.innerHTML = '';
          filteredDocs.forEach(doc => {
            container.appendChild(this._createDocumentItemElement(doc));
          });
        } else {
          container.innerHTML = '';
          container.appendChild(createElement('div', { className: 'no-documents' }, '暂无文档'));
        }
      } else {
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'no-documents' }, `加载失败: ${result.message}`));
      }
    } catch (error) {
      container.innerHTML = '';
      container.appendChild(createElement('div', { className: 'no-documents' }, `加载失败: ${error.message}`));
    }
  }

  /**
   * Creates a document item element
   * @private
   * @param {Object} doc - Document data
   * @returns {HTMLElement} Document item element
   */
  _createDocumentItemElement(doc) {
    const docItem = createElement('div', { className: 'doc-item' });

    const docInfo = createElement('div', { className: 'doc-info' }, [
      createElement('div', {
        className: 'doc-name',
        textContent: doc.name
      }),
      createElement('div', { className: 'doc-meta' }, [
        createElement('span', {}, `大小: ${formatFileSize(doc.size)}`),
        createElement('span', {}, `类型: ${doc.type || 'unknown'}`),
        createElement('span', {}, `上传时间: ${formatDate(doc.uploadTime)}`)
      ])
    ]);

    const docActions = createElement('div', { className: 'doc-actions' }, [
      createElement('button', {
        className: 'doc-action-btn view',
        textContent: '👁 查看',
        onclick: () => this._viewDocument(doc.id)
      }),
      createElement('button', {
        className: 'doc-action-btn delete',
        textContent: '🗑 删除',
        onclick: () => this._deleteDocument(doc.id)
      })
    ]);

    docItem.appendChild(docInfo);
    docItem.appendChild(docActions);

    return docItem;
  }

  /**
   * Views a document
   * @private
   * @param {string} docId - Document ID
   */
  async _viewDocument(docId) {
    try {
      const result = await this.api.getDocumentContent(docId);

      if (result.success) {
        const contentWindow = window.open('', '_blank');
        if (!contentWindow) {
          alert('无法打开新窗口，请检查弹出窗口设置');
          return;
        }

        contentWindow.document.open();
        contentWindow.document.write('<!DOCTYPE html><html><head><title></title>');
        contentWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;line-height:1.6}.header{background:#f5f5f5;padding:15px;border-radius:5px;margin-bottom:20px}.content{white-space:pre-wrap}</style>');
        contentWindow.document.write('</head><body>');

        const headerDiv = contentWindow.document.createElement('div');
        headerDiv.className = 'header';

        const h1 = contentWindow.document.createElement('h1');
        h1.textContent = result.document.name;
        headerDiv.appendChild(h1);

        const metaP = contentWindow.document.createElement('p');
        metaP.textContent = `大小: ${formatFileSize(result.document.size)} | ` +
                           `类型: ${result.document.type} | ` +
                           `上传时间: ${formatDate(result.document.uploadTime)}`;
        headerDiv.appendChild(metaP);

        contentWindow.document.body.appendChild(headerDiv);

        const contentDiv = contentWindow.document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.textContent = result.document.content;
        contentWindow.document.body.appendChild(contentDiv);

        contentWindow.document.write('</body></html>');
        contentWindow.document.close();
      } else {
        alert('查看文档失败: ' + result.message);
      }
    } catch (error) {
      alert('查看文档失败: ' + error.message);
    }
  }

  /**
   * Deletes a document
   * @private
   * @param {string} docId - Document ID
   */
  async _deleteDocument(docId) {
    if (confirm('确定要删除这个文档吗？此操作不可恢复。')) {
      try {
        const result = await this.api.deleteDocument(docId);

        if (result.success) {
          alert('文档删除成功！');
          this.loadDocumentsList();
        } else {
          alert(`删除失败: ${result.message}`);
        }
      } catch (error) {
        alert(`删除失败: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/** @type {SettingsManager|null} */
let settingsManager = null;

/**
 * Initializes the settings page when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  settingsManager = new SettingsManager();
});
