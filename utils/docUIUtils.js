/**
 * Smart Page Scribe - Document UI Utilities
 *
 * Shared document management UI logic used by both sidepanel and settings.
 * Eliminates ~200 lines of duplicated code across sidepanel.js and settings.js.
 *
 * @module utils/docUIUtils
 */

// ============================================================================
// DocUIHelper CLASS
// ============================================================================

/**
 * Provides shared document upload/list/view/delete UI logic.
 * Both SidePanelManager and SettingsManager instantiate this helper.
 *
 * @class
 *
 * @example
 * // In sidepanel or settings manager constructor:
 * this.docUI = new DocUIHelper({
 *   api: new DocumentApi(),
 *   source: 'sidepanel',        // element ID prefix ('' for settings)
 *   onNotify: (msg, type) => this._showNotification(msg, type),
 *   getApi: () => this.documentApi  // optional overridable getter
 * });
 */
class DocUIHelper {
  /**
   * @param {Object} opts
   * @param {DocumentApi} opts.api - DocumentApi instance
   * @param {string} [opts.source=''] - Element ID prefix (e.g. 'sidepanel')
   * @param {Function} [opts.onNotify] - Notification callback (msg, type)
   * @param {Function} [opts.getApi] - Lazy api getter (for dynamic instance)
   */
  constructor(opts = {}) {
    this._api = opts.api;
    this._source = opts.source || '';
    this._onNotify = opts.onNotify || alert;
    this._getApi = opts.getApi || (() => this._api);
    this._actions = Array.isArray(opts.actions) ? opts.actions : [];
  }

  /** Resolve element ID with optional source prefix */
  _id(suffix) {
    return this._source ? `${this._source}-${suffix}` : suffix;
  }

  // ========================================================================
  // DRAG & DROP / FILE SELECT
  // ========================================================================

  /** @param {Event} event */
  handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) this.processFile(files[0]);
  }

  /** @param {DragEvent} event */
  handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(this._id('upload-area'))?.classList.add('dragover');
  }

  /** @param {DragEvent} event */
  handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(this._id('upload-area'))?.classList.remove('dragover');
  }

  /** @param {DragEvent} event */
  async handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(this._id('upload-area'))?.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length > 0) await this.processFile(files[0]);
  }

  // ========================================================================
  // UPLOAD FLOW
  // ========================================================================

  /** @param {File} file */
  async processFile(file) {
    if (!isSupportedFileFormat(file)) {
      this.showUploadResult('不支持的文件格式。支持的格式: ' + SUPPORTED_FILE_FORMATS.join(', '), 'error');
      return;
    }
    if (!isValidFileSize(file)) {
      this.showUploadResult('文件过大，请上传 5MB 以内的文件', 'error');
      return;
    }

    this.showProgress(0, '准备上传...');
    try {
      this.showProgress(30, '正在读取文件...');
      const api = this._getApi();
      const result = await api.handleUploadRequest(file);

      if (result.success) {
        this.showProgress(100, '上传完成！');
        this.showUploadResult('文档上传成功！', 'success');
        setTimeout(() => { this.loadDocumentsList(); this.hideProgress(); }, 1000);
      } else {
        this.showUploadResult(result.message, 'error');
        this.hideProgress();
      }
    } catch (error) {
      this.showUploadResult('上传失败: ' + error.message, 'error');
      this.hideProgress();
    }
  }

  // ========================================================================
  // PROGRESS & RESULT UI
  // ========================================================================

  /** @param {number} percent @param {string} text */
  showProgress(percent, text) {
    const container = document.getElementById(this._id('upload-progress'));
    const bar = document.getElementById(this._id('progress-fill'));
    const textEl = document.getElementById(this._id('progress-text'));
    if (container) container.classList.remove('hidden');
    if (bar) bar.style.width = percent + '%';
    if (textEl) textEl.textContent = text || percent + '%';
  }

  hideProgress() {
    document.getElementById(this._id('upload-progress'))?.classList.add('hidden');
  }

  /** @param {string} message @param {string} type */
  showUploadResult(message, type) {
    const resultDiv = document.getElementById(this._id('upload-result'));
    if (resultDiv) {
      resultDiv.textContent = message;
      resultDiv.className = 'upload-result ' + type;
      resultDiv.classList.remove('hidden');
      setTimeout(() => resultDiv.classList.add('hidden'), 3000);
    }
  }

  // ========================================================================
  // DOCUMENT LIST
  // ========================================================================

  /** @param {string} [filter=''] */
  async loadDocumentsList(filter = '') {
    const container = document.getElementById(this._id('documents-list'));
    if (!container) return;

    container.replaceChildren(
      createElement('div', { className: 'loading-placeholder' }, '正在加载文档列表...')
    );

    try {
      const api = this._getApi();
      const result = await api.getDocumentsList();

      if (result.success) {
        const docs = filter
          ? result.documents.filter(d => d.name.toLowerCase().includes(filter.toLowerCase()))
          : result.documents;
        container.replaceChildren();
        if (docs.length > 0) {
          docs.forEach(doc => container.appendChild(this.createDocumentItemElement(doc)));
        } else {
          container.appendChild(createElement('div', { className: 'no-documents' }, '暂无文档'));
        }
      } else {
        container.replaceChildren(
          createElement('div', { className: 'no-documents' }, '加载失败: ' + result.message)
        );
      }
    } catch (error) {
      container.replaceChildren(
        createElement('div', { className: 'no-documents' }, '加载失败: ' + error.message)
      );
    }
  }

  /** @param {string} query */
  async searchDocuments(query) {
    const container = document.getElementById(this._id('documents-list'));
    if (!container) return;

    container.replaceChildren(
      createElement('div', { className: 'loading-placeholder' }, '正在搜索文档...')
    );

    try {
      const api = this._getApi();
      const result = await api.searchDocuments(query);

      if (result.success) {
        container.replaceChildren();
        if (result.documents.length > 0) {
          result.documents.forEach(doc => container.appendChild(this.createDocumentItemElement(doc)));
        } else {
          container.appendChild(createElement('div', { className: 'no-documents' }, '未找到匹配的文档'));
        }
      } else {
        container.replaceChildren(
          createElement('div', { className: 'no-documents' }, '搜索失败: ' + result.message)
        );
      }
    } catch (error) {
      container.replaceChildren(
        createElement('div', { className: 'no-documents' }, '搜索失败: ' + error.message)
      );
    }
  }

  // ========================================================================
  // DOCUMENT ITEM ELEMENT
  // ========================================================================

  /** @param {Object} doc @returns {HTMLElement} */
  createDocumentItemElement(doc) {
    const self = this;
    const docItem = createElement('div', { className: 'doc-item' });

    const docInfo = createElement('div', { className: 'doc-info' }, [
      createElement('div', { className: 'doc-name', textContent: doc.name }),
      createElement('div', { className: 'doc-meta' }, [
        createElement('span', {}, '大小: ' + formatFileSize(doc.size)),
        createElement('span', {}, '类型: ' + (doc.type || 'unknown')),
        createElement('span', {}, '上传时间: ' + formatDate(doc.uploadTime))
      ])
    ]);

    const defaultActions = [
      createElement('button', {
        className: 'doc-action-btn view',
        textContent: '查看',
        onclick: () => self.viewDocument(doc.id)
      }),
      createElement('button', {
        className: 'doc-action-btn delete',
        textContent: '删除',
        onclick: () => self.deleteDocument(doc.id)
      })
    ];
    const customActions = this._actions.map(action => createElement('button', {
      className: `doc-action-btn ${action.className || ''}`.trim(),
      textContent: action.label,
      onclick: () => action.onClick?.(doc)
    }));
    const docActions = createElement('div', { className: 'doc-actions' }, [...customActions, ...defaultActions]);

    docItem.appendChild(docInfo);
    docItem.appendChild(docActions);
    return docItem;
  }

  // ========================================================================
  // VIEW / DELETE
  // ========================================================================

  /** @param {string} docId */
  async viewDocument(docId) {
    try {
      const api = this._getApi();
      const result = await api.getDocumentContent(docId);

      if (result.success) {
        const w = window.open('', '_blank');
        if (!w) { this._onNotify('无法打开新窗口，请检查弹出窗口设置', 'error'); return; }

        w.document.open();
        w.document.write('<!DOCTYPE html><html><head><title>' + escapeHtml(result.document.name) + '</title>');
        w.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;line-height:1.6}.header{background:#f5f5f5;padding:15px;border-radius:5px;margin-bottom:20px}.content{white-space:pre-wrap}</style>');
        w.document.write('</head><body>');

        const headerDiv = w.document.createElement('div');
        headerDiv.className = 'header';
        const h1 = w.document.createElement('h1');
        h1.textContent = result.document.name;
        headerDiv.appendChild(h1);
        const metaP = w.document.createElement('p');
        metaP.textContent = '大小: ' + formatFileSize(result.document.size) +
          ' | 类型: ' + result.document.type +
          ' | 上传时间: ' + formatDate(result.document.uploadTime);
        headerDiv.appendChild(metaP);
        w.document.body.appendChild(headerDiv);

        const contentDiv = w.document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.textContent = result.document.content;
        w.document.body.appendChild(contentDiv);
        w.document.write('</body></html>');
        w.document.close();
      } else {
        this._onNotify('查看文档失败: ' + result.message, 'error');
      }
    } catch (error) {
      this._onNotify('查看文档失败: ' + error.message, 'error');
    }
  }

  /** @param {string} docId */
  async deleteDocument(docId) {
    if (!confirm('确定要删除这个文档吗？此操作不可恢复。')) return;

    try {
      const api = this._getApi();
      const result = await api.deleteDocument(docId);
      if (result.success) {
        this._onNotify('文档删除成功！', 'success');
        this.loadDocumentsList();
      } else {
        this._onNotify('删除失败: ' + result.message, 'error');
      }
    } catch (error) {
      this._onNotify('删除失败: ' + error.message, 'error');
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DocUIHelper };
} else {
  window.DocUIHelper = DocUIHelper;
}
