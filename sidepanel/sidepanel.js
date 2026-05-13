/**
 * Smart Page Scribe - Side Panel Manager
 *
 * Manages the side panel UI for document generation and editing.
 * Uses DocUIHelper for shared document management logic.
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

class SidePanelManager {
  constructor() {
    this.currentState = StateViews.EMPTY;
    this.session = null;
    this.config = null;
    this.documentApi = new DocumentApi();
    this.docUI = new DocUIHelper({
      api: this.documentApi,
      source: 'sidepanel',
      onNotify: (msg, type) => this._showNotification(msg, type),
      getApi: () => this.documentApi
    });
    this.cleanupFunctions = [];
    this.init();
  }

  async init() {
    this._bindEvents();
    await this._checkForPendingSession();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  _bindEvents() {
    this._bindButton('btn-new', () => this.newDocument());
    this._bindButton('btn-start-here', () => this.startRecordingHere());
    this._bindButton('btn-generate', () => this.generateDocument());
    this._bindButton('btn-retry', () => this.retry());
    this._bindButton('btn-preview', () => this.switchToPreview());
    this._bindButton('btn-edit', () => this.switchToEdit());
    this._bindButton('btn-copy', () => this.copyDocument());
    this._bindButton('btn-download', () => this.downloadDocument());
    this._bindButton('btn-documents', () => this.showDocumentsPanel());
    this._bindButton('btn-close-documents', () => this.hideDocumentsPanel());
    this._bindDocumentUploadEvents('sidepanel');
  }

  _bindButton(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
      const wrappedHandler = handler.bind(this);
      button.addEventListener('click', wrappedHandler);
      this.cleanupFunctions.push(() => button.removeEventListener('click', wrappedHandler));
    } else {
      console.warn(`[Scribe:SidePanel] Button '${buttonId}' not found`);
    }
  }

  _bindDocumentUploadEvents(source) {
    const d = this.docUI;
    const browseBtn = document.getElementById(`${source}-browse-btn`);
    const fileInput = document.getElementById(`${source}-document-file`);
    const uploadArea = document.getElementById(`${source}-upload-area`);
    const refreshBtn = document.getElementById(`${source}-refresh-documents`);
    const searchInput = document.getElementById(`${source}-search-documents`);

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
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => d.loadDocumentsList());
    }
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => d.searchDocuments(e.target.value)));
    }
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  async _checkForPendingSession() {
    try {
      const response = await sendMessage({ type: 'GET_RECORDING_STATE' });
      if (response?.state === 'stopped' && response?.session) {
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

  setState(newState) {
    document.querySelectorAll('.state-view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });
    const el = document.getElementById(`${newState}-state`);
    if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
    this.currentState = newState;
  }

  _showEmptyState() { this.setState(StateViews.EMPTY); }

  showLoadingState(text = '正在处理...') {
    const t = document.getElementById('loading-text');
    if (t) t.textContent = text;
    this.setState(StateViews.LOADING);
  }

  _showDescriptionSelector() {
    this.setState(StateViews.DESCRIPTION);
    this._renderDescriptionOptions();
  }

  showErrorState(message) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = message;
    this.setState(StateViews.ERROR);
  }

  showEditor() { this.setState(StateViews.EDITOR); }

  showDocumentsPanel() { this.setState(StateViews.DOCUMENTS); this.docUI.loadDocumentsList(); }
  hideDocumentsPanel() { this._showEmptyState(); }

  // ========================================================================
  // DESCRIPTION OPTIONS
  // ========================================================================

  _renderDescriptionOptions() {
    const container = document.getElementById('description-list');
    if (!container) return;
    container.replaceChildren();
    DefaultDescriptions.forEach(desc => {
      container.appendChild(createElement('div', { className: 'description-option' }, [
        createElement('input', { type: 'radio', name: 'description', value: desc.value, id: `desc-${desc.value}`, checked: desc === DefaultDescriptions[0] }),
        createElement('label', { htmlFor: `desc-${desc.value}`, textContent: desc.label })
      ]));
    });
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async startRecordingHere() {
    try {
      const [tab] = await queryTabs({ active: true, currentWindow: true });
      if (!tab) throw new ExtensionError('无法获取当前标签页', 'TAB_ERROR');
      const response = await sendMessage({ type: 'START_RECORDING', tabId: tab.id });
      if (response?.error) throw new ExtensionError(response.error, 'RECORDING_ERROR');
      window.close();
    } catch (error) {
      this._showError('启动录制失败: ' + error.message);
    }
  }

  async generateDocument() {
    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';
      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description')?.value?.trim();
        if (!description) { this._showError('请输入自定义描述'); return; }
      } else {
        const selectedDesc = DefaultDescriptions.find(d => d.value === selectedValue);
        description = selectedDesc?.description || '';
      }

      this.showLoadingState('正在生成文档...');
      const config = await loadConfig();
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');

      const prompt = this._buildGenerationPrompt(description, selectedValue);
      const response = await fetchWithTimeout(
        config.baseUrl + '/chat/completions',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.modelName, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: DEFAULT_MAX_TOKENS }) },
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
      }

      const data = await response.json();
      const markdown = data.choices[0].message.content.trim();
      this.showEditor();
      this._setEditorContent(this._injectScreenshots(markdown));
    } catch (error) {
      console.error('[Scribe:SidePanel] Generation failed:', error);
      this.showErrorState(error.message || '生成文档失败，请重试');
    }
  }

  _buildGenerationPrompt(description, docType) {
    var stepsText = '';
    if (this.session?.steps?.length > 0) {
      stepsText = this.session.steps.map(function(step, index) {
        var num = index + 1;
        if (step.type === 'navigate') return num + '. 页面跳转: ' + (step.from || '当前页') + ' → ' + (step.to || '新页面');
        var desc = step.action || step.text || '未知操作';
        var extra = step.tagName ? ' (' + step.tagName + ')' : '';
        return num + '. ' + desc + extra;
      }).join('\n');
    }
    var basePrompt = '根据以下网页操作步骤生成文档：\n\n' + stepsText + '\n\n每个步骤都附有对应的操作截图。请在每个步骤说明后使用 [截图N] 标记截图位置（N 为步骤编号）。\n\n任务描述：' + description;
    if (docType === 'user-guide') return basePrompt + '\n\n请生成一份简洁的用户操作指南，只包含：\n1. 操作步骤（每个步骤一句话描述 + [截图N]）\n2. 预期结果\n\n不要添加注意事项、常见问题等额外章节。语言简洁直接。';
    if (docType === 'tutorial') return basePrompt + '\n\n请生成一份教程文档，包含：\n1. 简短的学习目标\n2. 操作步骤（每步附 [截图N] 和简要说明）\n3. 小结\n\n语言友好，适合新手。';
    if (docType === 'testing') return basePrompt + '\n\n请生成测试用例文档，包含：\n1. 测试场景\n2. 前置条件\n3. 测试步骤列表（每步附预期结果和 [截图N]）\n4. 测试结论';
    if (docType === 'bug-report') return basePrompt + '\n\n请生成问题报告，包含：\n1. 问题描述\n2. 复现步骤（每步附 [截图N]）\n3. 预期行为 vs 实际行为\n4. 环境信息';
    return basePrompt + '\n\n请生成一份结构清晰、内容详实的Markdown格式文档，包含：\n1. 操作概述\n2. 详细步骤说明\n3. 注意事项\n4. 可能遇到的问题及解决方案\n\n要求：\n- 使用标准Markdown格式\n- 结构清晰，层次分明\n- 语言简洁明了\n- 适合非技术人员阅读';
  }

  _injectScreenshots(markdown) {
    if (!this.session?.steps?.length) return markdown;
    var result = markdown;
    this.session.steps.forEach(function(step, index) {
      var placeholder = '[' + '截图' + (index + 1) + ']';
      if (step.screenshot) {
        var imgTag = '![' + '步骤' + (index + 1) + '截图](' + step.screenshot + ')';
        result = result.split(placeholder).join(imgTag);
      }
    });
    return result;
  }

  _setEditorContent(content) {
    const editor = document.getElementById('markdown-editor');
    if (editor) { editor.value = content; this._updatePreview(content); }
  }

  _updatePreview(markdown) { this._renderMarkdown(markdown); }

  _renderMarkdown(markdown) {
    const previewDiv = document.getElementById('markdown-preview');
    if (previewDiv && typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      safeSetInnerHTML(previewDiv, marked.parse(markdown), true);
    }
  }

  switchToPreview() {
    this._togglePane('preview-pane', 'btn-preview');
    const content = document.getElementById('markdown-editor')?.value;
    if (content) this._updatePreview(content);
  }

  switchToEdit() { this._togglePane('edit-pane', 'btn-edit'); }

  _togglePane(paneId, buttonId) {
    ['preview-pane', 'edit-pane', 'btn-preview', 'btn-edit'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    document.getElementById(paneId)?.classList.add('active');
    document.getElementById(buttonId)?.classList.add('active');
  }

  async copyDocument() {
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      this._showNotification('文档已复制到剪贴板！', 'success');
    } catch (error) {
      this._showNotification('复制失败，请手动选择文本', 'error');
    }
  }

  downloadDocument() {
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: `document_${Date.now()}.md` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  newDocument() { this.session = null; this._showEmptyState(); }

  retry() {
    if (this.session) this._showDescriptionSelector(); else this._showEmptyState();
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  _showError(message) { alert(message); }
  _showNotification(message, type) { alert(message); }

  cleanup() {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let sidePanelManager = null;

document.addEventListener('DOMContentLoaded', () => { sidePanelManager = new SidePanelManager(); });

window.addEventListener('unload', () => { if (sidePanelManager) sidePanelManager.cleanup(); });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_AI_ANALYSIS' && sidePanelManager) {
    sidePanelManager.session = message.session;
    sidePanelManager.config = message.config;
    sidePanelManager._showDescriptionSelector();
  }
});
