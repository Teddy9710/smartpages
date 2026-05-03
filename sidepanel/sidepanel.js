/**
 * Smart Page Scribe - Side Panel Manager
 *
 * Manages the side panel UI for document generation and editing.
 * Handles document management, AI-powered content generation, and markdown editing.
 *
 * @module sidepanel
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {Object} StateViews - Available state views */
const StateViews = {
  EMPTY: 'empty',
  LOADING: 'loading',
  DESCRIPTION: 'description',
  EDITOR: 'document-editor',
  ERROR: 'error',
  DOCUMENTS: 'documents'
};

/** @constant {Object} DefaultDescriptions - Default document descriptions */
const DefaultDescriptions = [
  { value: 'user-guide', label: '用户操作指南', description: '生成一份详细的用户操作指南' },
  { value: 'tutorial', label: '教程文档', description: '生成一份新手教程文档' },
  { value: 'testing', label: '测试用例', description: '生成测试用例文档' },
  { value: 'bug-report', label: '问题报告', description: '生成问题报告文档' }
];

// ============================================================================
// SIDEPANEL MANAGER CLASS
// ============================================================================

/**
 * Manages the side panel UI and functionality
 * @class
 */
class SidePanelManager {
  constructor() {
    /** @type {string} */
    this.currentState = StateViews.EMPTY;

    /** @type {Session|null} */
    this.session = null;

    /** @type {Config|null} */
    this.config = null;

    /** @type {DocumentUploader} */
    this.documentUploader = new DocumentUploader();

    /** @type {DocumentApi} */
    this.documentApi = new DocumentApi();

    /** @type {Array<Function>} Array of cleanup functions */
    this.cleanupFunctions = [];

    this.init();
  }

  /**
   * Initializes the side panel manager
   * @async
   */
  async init() {
    this._bindEvents();
    await this._checkForPendingSession();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  /**
   * Binds all UI events
   * @private
   */
  _bindEvents() {
    // Main action buttons
    this._bindButton('btn-new', () => this.newDocument());
    this._bindButton('btn-start-here', () => this.startRecordingHere());
    this._bindButton('btn-generate', () => this.generateDocument());
    this._bindButton('btn-retry', () => this.retry());
    this._bindButton('btn-preview', () => this.switchToPreview());
    this._bindButton('btn-edit', () => this.switchToEdit());
    this._bindButton('btn-copy', () => this.copyDocument());
    this._bindButton('btn-download', () => this.downloadDocument());

    // Document management buttons
    this._bindButton('btn-documents', () => this.showDocumentsPanel());
    this._bindButton('btn-close-documents', () => this.hideDocumentsPanel());

    // Document upload events
    this._bindDocumentUploadEvents('sidepanel');
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
      console.warn(`[Scribe:SidePanel] Button '${buttonId}' not found`);
    }
  }

  /**
   * Binds document upload events for a specific source
   * @private
   * @param {string} source - Source identifier ('sidepanel' or 'settings')
   */
  _bindDocumentUploadEvents(source) {
    const browseBtn = document.getElementById(`${source}-browse-btn`);
    const fileInput = document.getElementById(`${source}-document-file`);
    const uploadArea = document.getElementById(`${source}-upload-area`);
    const refreshBtn = document.getElementById(`${source}-refresh-documents`);
    const searchInput = document.getElementById(`${source}-search-documents`);

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this._handleFileSelect(e, source));
    }

    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput?.click());
      uploadArea.addEventListener('dragover', (e) => this._handleDragOver(e, source));
      uploadArea.addEventListener('dragleave', (e) => this._handleDragLeave(e, source));
      uploadArea.addEventListener('drop', (e) => this._handleDrop(e, source));
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadDocumentsList(source));
    }

    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        this.searchDocuments(e.target.value, source);
      }));
    }
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  /**
   * Checks for a pending session on load
   * @private
   * @async
   */
  async _checkForPendingSession() {
    try {
      const response = await sendMessage({ type: 'GET_RECORDING_STATE' });

      if (response?.state?.state === 'stopped' && response?.session) {
        this.session = response.session;
        this._showDescriptionSelector();
      } else {
        this._showEmptyState();
      }
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to get recording state:', error);
      this._showEmptyState();
    }
  }

  /**
   * Sets the current state view
   * @param {string} newState - New state
   */
  setState(newState) {
    // Hide all state views
    document.querySelectorAll('.state-view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });

    // Show new state view
    const newStateElement = document.getElementById(`${newState}-state`);
    if (newStateElement) {
      newStateElement.classList.remove('hidden');
      newStateElement.classList.add('active');
    }

    this.currentState = newState;
  }

  /**
   * Shows the empty state
   * @private
   */
  _showEmptyState() {
    this.setState(StateViews.EMPTY);
  }

  /**
   * Shows the loading state
   * @param {string} [text='正在处理...'] - Loading text
   */
  showLoadingState(text = '正在处理...') {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.textContent = text;
    }
    this.setState(StateViews.LOADING);
  }

  /**
   * Shows the description selector
   * @private
   */
  _showDescriptionSelector() {
    this.setState(StateViews.DESCRIPTION);
    this._renderDescriptionOptions();
  }

  /**
   * Shows the error state
   * @param {string} message - Error message
   */
  showErrorState(message) {
    const errorMessageEl = document.getElementById('error-message');
    if (errorMessageEl) {
      errorMessageEl.textContent = message;
    }
    this.setState(StateViews.ERROR);
  }

  /**
   * Shows the editor
   */
  showEditor() {
    this.setState(StateViews.EDITOR);
  }

  /**
   * Shows the documents panel
   */
  showDocumentsPanel() {
    this.setState(StateViews.DOCUMENTS);
    this.loadDocumentsList('sidepanel');
  }

  /**
   * Hides the documents panel
   */
  hideDocumentsPanel() {
    this._showEmptyState();
  }

  // ========================================================================
  // DESCRIPTION OPTIONS
  // ========================================================================

  /**
   * Renders the description options
   * @private
   */
  _renderDescriptionOptions() {
    const container = document.getElementById('description-list');
    if (!container) return;

    container.innerHTML = '';

    DefaultDescriptions.forEach(desc => {
      const option = createElement('div', { className: 'description-option' }, [
        createElement('input', {
          type: 'radio',
          name: 'description',
          value: desc.value,
          id: `desc-${desc.value}`,
          checked: desc === DefaultDescriptions[0]
        }),
        createElement('label', {
          htmlFor: `desc-${desc.value}`,
          textContent: desc.label
        })
      ]);

      container.appendChild(option);
    });
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  /**
   * Starts a new recording from the side panel
   * @async
   */
  async startRecordingHere() {
    try {
      const [tab] = await queryTabs({ active: true, currentWindow: true });

      if (!tab) {
        throw new ExtensionError('无法获取当前标签页', 'TAB_ERROR');
      }

      const response = await sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id
      });

      if (response?.error) {
        throw new ExtensionError(response.error, 'RECORDING_ERROR');
      }

      window.close();
    } catch (error) {
      this._showError('启动录制失败: ' + error.message);
    }
  }

  /**
   * Generates a document from the recorded session
   * @async
   */
  async generateDocument() {
    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';

      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description')?.value?.trim();
        if (!description) {
          this._showError('请输入自定义描述');
          return;
        }
      } else {
        const selectedDesc = DefaultDescriptions.find(d => d.value === selectedValue);
        description = selectedDesc?.description || '';
      }

      this.showLoadingState('正在生成文档...');

      const config = await this._loadConfig();
      if (!config.apiKey) {
        throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');
      }

      const prompt = this._buildGenerationPrompt(description);

      const response = await fetchWithTimeout(
        config.baseUrl + '/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(
          `API调用失败: ${errorData.error?.message || response.statusText}`,
          'API_ERROR'
        );
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();

      this.showEditor();
      this._setEditorContent(content);

    } catch (error) {
      console.error('[Scribe:SidePanel] Generation failed:', error);
      this.showErrorState(error.message || '生成文档失败，请重试');
    }
  }

  /**
   * Builds the AI generation prompt
   * @private
   * @param {string} description - User's description
   * @returns {string} Generated prompt
   */
  _buildGenerationPrompt(description) {
    let stepsText = '';
    if (this.session?.steps?.length > 0) {
      stepsText = this.session.steps.map((step, index) =>
        `${index + 1}. ${step.type}: ${step.action || step.element || step.text || '未知操作'}`
      ).join('\n');
    }

    return `根据以下网页操作步骤生成一份详细的文档：

${stepsText}

任务描述：${description}

请生成一份结构清晰、内容详实的Markdown格式文档，包含：
1. 操作概述
2. 详细步骤说明
3. 注意事项
4. 可能遇到的问题及解决方案

要求：
- 使用标准Markdown格式
- 结构清晰，层次分明
- 语言简洁明了
- 适合非技术人员阅读`;
  }

  /**
   * Sets the editor content and updates preview
   * @private
   * @param {string} content - Markdown content
   */
  _setEditorContent(content) {
    const editor = document.getElementById('markdown-editor');
    if (editor) {
      editor.value = content;
      this._updatePreview(content);
    }
  }

  /**
   * Updates the markdown preview
   * @private
   * @param {string} markdown - Markdown content
   */
  _updatePreview(markdown) {
    // marked.js is now bundled locally via sidepanel.html
    this._renderMarkdown(markdown);
  }

  /**
   * Renders markdown to HTML (with XSS protection)
   * @private
   * @param {string} markdown - Markdown content
   */
  _renderMarkdown(markdown) {
    const previewDiv = document.getElementById('markdown-preview');
    if (previewDiv && typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      const rawHtml = marked.parse(markdown);

      // Use safe HTML setting
      safeSetInnerHTML(previewDiv, rawHtml, true);
    }
  }

  /**
   * Switches to preview mode
   */
  switchToPreview() {
    this._togglePane('preview-pane', 'btn-preview');
    const editorContent = document.getElementById('markdown-editor')?.value;
    if (editorContent) {
      this._updatePreview(editorContent);
    }
  }

  /**
   * Switches to edit mode
   */
  switchToEdit() {
    this._togglePane('edit-pane', 'btn-edit');
  }

  /**
   * Toggles between editor panes
   * @private
   * @param {string} paneId - Pane element ID
   * @param {string} buttonId - Button element ID
   */
  _togglePane(paneId, buttonId) {
    document.getElementById('preview-pane')?.classList.remove('active');
    document.getElementById('edit-pane')?.classList.remove('active');
    document.getElementById('btn-preview')?.classList.remove('active');
    document.getElementById('btn-edit')?.classList.remove('active');

    document.getElementById(paneId)?.classList.add('active');
    document.getElementById(buttonId)?.classList.add('active');
  }

  /**
   * Copies document to clipboard
   */
  async copyDocument() {
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      this._showNotification('文档已复制到剪贴板！', 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Copy failed:', error);
      this._showNotification('复制失败，请手动选择文本', 'error');
    }
  }

  /**
   * Downloads document as markdown file
   */
  downloadDocument() {
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = createElement('a', {
      href: url,
      download: `document_${Date.now()}.md`
    });

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Creates a new document (resets state)
   */
  newDocument() {
    this.session = null;
    this._showEmptyState();
  }

  /**
   * Retries the last operation
   */
  retry() {
    if (this.session) {
      this._showDescriptionSelector();
    } else {
      this._showEmptyState();
    }
  }

  // ========================================================================
  // DOCUMENT MANAGEMENT
  // ========================================================================

  /**
   * Handles file selection
   * @private
   * @param {Event} event - File input change event
   * @param {string} source - Source identifier
   */
  _handleFileSelect(event, source) {
    const files = event.target.files;
    if (files.length > 0) {
      this._processFile(files[0], source);
    }
  }

  /**
   * Handles drag over event
   * @private
   * @param {DragEvent} event - Drag event
   * @param {string} source - Source identifier
   */
  _handleDragOver(event, source) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`${source}-upload-area`)?.classList.add('dragover');
  }

  /**
   * Handles drag leave event
   * @private
   * @param {DragEvent} event - Drag event
   * @param {string} source - Source identifier
   */
  _handleDragLeave(event, source) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`${source}-upload-area`)?.classList.remove('dragover');
  }

  /**
   * Handles drop event
   * @private
   * @param {DragEvent} event - Drop event
   * @param {string} source - Source identifier
   */
  async _handleDrop(event, source) {
    event.preventDefault();
    event.stopPropagation();

    document.getElementById(`${source}-upload-area`)?.classList.remove('dragover');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      await this._processFile(files[0], source);
    }
  }

  /**
   * Processes an uploaded file
   * @private
   * @param {File} file - File to process
   * @param {string} source - Source identifier
   */
  async _processFile(file, source) {
    if (!isSupportedFileFormat(file)) {
      this._showUploadResult('不支持的文件格式。支持的格式: ' + SUPPORTED_FILE_FORMATS.join(', '), 'error', source);
      return;
    }

    if (!isValidFileSize(file)) {
      this._showUploadResult('文件过大，请上传 5MB 以内的文件', 'error', source);
      return;
    }

    this._showProgress(0, '准备上传...', source);

    try {
      this._showProgress(30, '正在读取文件...', source);

      const result = await this.documentApi.handleUploadRequest(file);

      if (result.success) {
        this._showProgress(100, '上传完成！', source);
        this._showUploadResult('文档上传成功！', 'success', source);

        setTimeout(() => {
          this.loadDocumentsList(source);
          this._hideProgress(source);
        }, 1000);
      } else {
        this._showUploadResult(result.message, 'error', source);
        this._hideProgress(source);
      }
    } catch (error) {
      this._showUploadResult(`上传失败: ${error.message}`, 'error', source);
      this._hideProgress(source);
    }
  }

  /**
   * Shows upload progress
   * @private
   * @param {number} percent - Progress percentage
   * @param {string} text - Progress text
   * @param {string} source - Source identifier
   */
  _showProgress(percent, text, source) {
    const container = document.getElementById(`${source}-upload-progress`);
    const bar = document.getElementById(`${source}-progress-fill`);
    const textEl = document.getElementById(`${source}-progress-text`);

    if (container) container.classList.remove('hidden');
    if (bar) bar.style.width = percent + '%';
    if (textEl) textEl.textContent = text || percent + '%';
  }

  /**
   * Hides upload progress
   * @private
   * @param {string} source - Source identifier
   */
  _hideProgress(source) {
    document.getElementById(`${source}-upload-progress`)?.classList.add('hidden');
  }

  /**
   * Shows upload result message
   * @private
   * @param {string} message - Result message
   * @param {string} type - Message type ('success' or 'error')
   * @param {string} source - Source identifier
   */
  _showUploadResult(message, type, source) {
    const resultDiv = document.getElementById(`${source}-upload-result`);
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
   * @param {string} [source='sidepanel'] - Source identifier
   */
  async loadDocumentsList(source = 'sidepanel') {
    const container = document.getElementById(`${source}-documents-list`);
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">正在加载文档列表...</div>';

    try {
      const result = await this.documentApi.getDocumentsList();

      if (result.success) {
        if (result.documents.length > 0) {
          container.innerHTML = '';
          result.documents.forEach(doc => {
            container.appendChild(this._createDocumentItemElement(doc, source));
          });
        } else {
          container.innerHTML = '<div class="no-documents">暂无文档</div>';
        }
      } else {
        container.innerHTML = `<div class="no-documents">加载失败: ${result.message}</div>`;
      }
    } catch (error) {
      container.innerHTML = `<div class="no-documents">加载失败: ${error.message}</div>`;
    }
  }

  /**
   * Creates a document item element
   * @private
   * @param {Object} doc - Document data
   * @param {string} source - Source identifier
   * @returns {HTMLElement} Document item element
   */
  _createDocumentItemElement(doc, source) {
    const docItem = createElement('div', { className: 'doc-item' });

    const docInfo = createElement('div', { className: 'doc-info' }, [
      createElement('div', {
        className: 'doc-name',
        textContent: doc.name
      }),
      createElement('div', {
        className: 'doc-meta',
        innerHTML: `<span>大小: ${formatFileSize(doc.size)}</span>` +
                  `<span>类型: ${doc.type || 'unknown'}</span>` +
                  `<span>上传时间: ${formatDate(doc.uploadTime)}</span>`
      })
    ]);

    const docActions = createElement('div', { className: 'doc-actions' }, [
      createElement('button', {
        className: 'doc-action-btn view',
        textContent: '👁 查看',
        onclick: () => this._viewDocument(doc.id, source)
      }),
      createElement('button', {
        className: 'doc-action-btn delete',
        textContent: '🗑 删除',
        onclick: () => this._deleteDocument(doc.id, source)
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
   * @param {string} source - Source identifier
   */
  async _viewDocument(docId, source) {
    try {
      const result = await this.documentApi.getDocumentContent(docId);

      if (result.success) {
        const contentWindow = window.open('', '_blank');
        if (!contentWindow) {
          this._showNotification('无法打开新窗口，请检查弹出窗口设置', 'error');
          return;
        }

        contentWindow.document.open();
        contentWindow.document.write('<!DOCTYPE html><html><head><title></title>');
        contentWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;line-height:1.6}.header{background:#f5f5f5;padding:15px;border-radius:5px;margin-bottom:20px}.content{white-space:pre-wrap}</style>');
        contentWindow.document.write('</head><body>');

        const headerDiv = contentWindow.document.createElement('div');
        headerDiv.className = 'header';
        headerDiv.appendChild(contentWindow.document.createElement('h1'))
          .textContent = result.document.name;

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
        this._showNotification('查看文档失败: ' + result.message, 'error');
      }
    } catch (error) {
      this._showNotification('查看文档失败: ' + error.message, 'error');
    }
  }

  /**
   * Deletes a document
   * @private
   * @param {string} docId - Document ID
   * @param {string} source - Source identifier
   */
  async _deleteDocument(docId, source) {
    if (confirm('确定要删除这个文档吗？此操作不可恢复。')) {
      try {
        const result = await this.documentApi.deleteDocument(docId);

        if (result.success) {
          this._showNotification('文档删除成功！', 'success');
          this.loadDocumentsList(source);
        } else {
          this._showNotification(`删除失败: ${result.message}`, 'error');
        }
      } catch (error) {
        this._showNotification(`删除失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * Searches documents
   * @param {string} query - Search query
   * @param {string} [source='sidepanel'] - Source identifier
   */
  async searchDocuments(query, source = 'sidepanel') {
    const container = document.getElementById(`${source}-documents-list`);
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">正在搜索文档...</div>';

    try {
      const result = await this.documentApi.searchDocuments(query);

      if (result.success) {
        if (result.documents.length > 0) {
          container.innerHTML = '';
          result.documents.forEach(doc => {
            container.appendChild(this._createDocumentItemElement(doc, source));
          });
        } else {
          container.innerHTML = '<div class="no-documents">未找到匹配的文档</div>';
        }
      } else {
        container.innerHTML = `<div class="no-documents">搜索失败: ${result.message}</div>`;
      }
    } catch (error) {
      container.innerHTML = `<div class="no-documents">搜索失败: ${error.message}</div>`;
    }
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Loads configuration from storage
   * @private
   * @async
   * @returns {Promise<Config>} Configuration object
   */
  async _loadConfig() {
    const result = await storagePromise('local', 'get', [
      'apiKey', 'baseUrl', 'modelName', 'smartDescription'
    ]);

    return {
      apiKey: result.apiKey || '',
      baseUrl: result.baseUrl || 'https://api.openai.com/v1',
      modelName: result.modelName || 'gpt-3.5-turbo',
      smartDescription: result.smartDescription !== undefined ? result.smartDescription : true
    };
  }

  /**
   * Shows an error message
   * @private
   * @param {string} message - Error message
   */
  _showError(message) {
    alert(message);
  }

  /**
   * Shows a notification message
   * @private
   * @param {string} message - Notification message
   * @param {string} type - Message type
   */
  _showNotification(message, type) {
    // Could implement a toast notification here
    alert(message);
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
    console.log('[Scribe:SidePanel] Cleanup completed');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/** @type {SidePanelManager|null} */
let sidePanelManager = null;

/**
 * Initializes the side panel when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  sidePanelManager = new SidePanelManager();
});

/**
 * Cleans up when side panel is closed
 */
window.addEventListener('unload', () => {
  if (sidePanelManager) {
    sidePanelManager.cleanup();
  }
});

/**
 * Handles messages from background script
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_AI_ANALYSIS' && sidePanelManager) {
    sidePanelManager.session = message.session;
    sidePanelManager.config = message.config;
    sidePanelManager._showDescriptionSelector();
  }
});
