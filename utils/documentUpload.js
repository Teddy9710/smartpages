/**
 * 文档上传模块（统一版本）
 * 处理多格式文档的上传和解析
 */

class DocumentUploader {
  constructor(options = {}) {
    this.supportedFormats = ['txt', 'md', 'html', 'htm', 'rtf', 'pdf', 'docx'];
    this.uploadDir = 'docs';
    this.storageKey = 'documents';
    this._getConfig = options.getConfig || (() => loadConfig());
    this._requestOcr = options.requestOcr || ((config, pages) => this._requestPdfOcr(config, pages));
    this._parserDependencies = options.parserDependencies || {};
    this._docIndex = new Map();
    this._docsCache = null;
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[this.storageKey]) return;
        this._docsCache = null;
        this._docIndex.clear();
      });
    }
  }

  /**
   * 检查文件格式是否支持
   */
  isSupportedFormat(file) {
    const extension = file.name.toLowerCase().split('.').pop();
    return this.supportedFormats.includes(extension);
  }

  /**
   * 获取文件类型图标
   */
  getFileIcon(extension) {
    const iconMap = {
      'pdf': '📄',
      'docx': '📝',
      'txt': '📑',
      'md': '📘',
      'html': '🌐',
      'htm': '🌐',
      'rtf': '📜',
      'xlsx': '📊',
      'pptx': '📽️'
    };
    return iconMap[extension] || '📁';
  }

  /**
   * 读取文件内容（用于简单文本预览）
   */
  async readFileContent(file) {
    const extension = this._getExtension(file.name);
    if (extension === 'pdf' || extension === 'docx') {
      const parsed = await DocumentParsers.extractDocumentText(
        await this._readAsArrayBuffer(file),
        extension,
        await this._getParserDependencies(extension)
      );
      return parsed.content;
    }
    return this._readAsText(file);
  }

  /**
   * 读取文档内容（用于解析和存储）
   */
  async readDocumentContent(file) {
    const extension = this._getExtension(file.name);
    try {
      const parsed = extension === 'pdf' || extension === 'docx'
        ? await DocumentParsers.extractDocumentText(
          await this._readAsArrayBuffer(file),
          extension,
          await this._getParserDependencies(extension)
        )
        : { content: await this._readAsText(file), warnings: [] };
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        content: parsed.content,
        parserWarnings: parsed.warnings || [],
        ocrPageCount: Number(parsed.ocrPageCount) || 0,
        uploadTime: new Date().toISOString()
      };
    } catch (error) {
      throw new Error('解析文档失败: ' + error.message);
    }
  }

  _getExtension(filename) {
    return String(filename || '').toLowerCase().split('.').pop();
  }

  async _getParserDependencies(extension) {
    if (extension !== 'pdf') return this._parserDependencies;
    if (typeof this._parserDependencies.ocrPages === 'function') {
      return this._parserDependencies;
    }

    const config = await this._getConfig();
    if (config?.pdfOcrEnabled !== true) return this._parserDependencies;
    return {
      ...this._parserDependencies,
      ocrPages: pages => this._ocrPdfPages(pages, config)
    };
  }

  async _ocrPdfPages(pages, resolvedConfig = null) {
    const config = resolvedConfig || await this._getConfig();
    if (config?.pdfOcrEnabled !== true) {
      throw new Error('这是扫描版 PDF。请先在设置中开启“扫描版 PDF AI OCR”后重试');
    }
    if (config?.multimodalEnabled !== true) {
      throw new Error('扫描版 PDF OCR 需要支持图片输入的模型，请在设置中开启图片输入');
    }
    if (!config?.apiKey) {
      throw new Error('扫描版 PDF OCR 需要 API Key，请先在设置中完成模型配置');
    }
    return this._requestOcr(config, pages);
  }

  async _requestPdfOcr(config, pages) {
    const pageNumbers = pages.map(page => page.pageNumber);
    const prompt = `Extract all visible text from the attached scanned PDF pages.

Requirements:
- Preserve the original language, reading order, headings, lists, and table content.
- Do not summarize, translate, explain, or invent missing text.
- Return plain text only.
- Start every page with its exact marker in this form: [[PAGE N]]
- Include every requested page exactly once, in this order: ${pageNumbers.join(', ')}.`;
    const request = buildModelApiRequest(config, prompt, {
      temperature: 0,
      maxTokens: Math.min(MAX_MAX_TOKENS, Math.max(8000, Number(config.maxTokens) || 0)),
      images: pages.map(page => ({
        dataUrl: page.dataUrl,
        label: `PDF page ${page.pageNumber}`
      }))
    });
    const response = await fetchWithTimeout(request.url, request.fetchOptions, DOC_GEN_TIMEOUT);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI OCR 请求失败：${errorData.error?.message || response.statusText || response.status}`);
    }
    const data = await response.json();
    const content = extractModelResponseText(data, getApiFormat(config));
    if (!content) throw new Error('AI OCR 没有返回文字');
    return content;
  }

  async _readAsText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }

  async _readAsArrayBuffer(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 保存文档到本地存储
   */
  async saveDocument(documentData) {
    try {
      const existingDocs = await this.getStoredDocuments();
      const newDoc = {
        ...documentData,
        id: this._generateId()
      };
      existingDocs.push(newDoc);
      await this._saveDocuments(existingDocs);
      return newDoc;
    } catch (error) {
      throw new Error('保存文档失败: ' + error.message);
    }
  }

  /**
   * 从本地存储获取所有文档
   */
  async getStoredDocuments() {
    try {
      const result = await chrome.storage.local.get([this.storageKey, 'uploadedDocuments']);
      let documents = result[this.storageKey] || [];
      if (!documents.length && Array.isArray(result.uploadedDocuments) && result.uploadedDocuments.length) {
        documents = result.uploadedDocuments;
        await this._saveDocuments(documents);
      } else {
        this._rebuildIndex(documents);
      }
      this._docsCache = documents;
      return documents;
    } catch (error) {
      console.error('获取文档列表失败:', error);
      return [];
    }
  }

  /**
   * 删除文档
   */
  async deleteDocument(docId) {
    try {
      const existingDocs = await this.getStoredDocuments();
      const updatedDocs = existingDocs.filter(doc => doc.id !== docId);
      await this._saveDocuments(updatedDocs);
      return true;
    } catch (error) {
      throw new Error('删除文档失败: ' + error.message);
    }
  }

  async updateDocumentCategory(docId, category) {
    const normalizedCategory = String(category || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    let updatedDocument = null;
    await this._updateDocs(documents => documents.map(document => {
      if (document.id !== docId) return document;
      updatedDocument = { ...document, category: normalizedCategory };
      return updatedDocument;
    }));
    if (!updatedDocument) throw new Error('文档不存在');
    return updatedDocument;
  }

  /**
   * O(1) 获取单文档（使用内存索引）
   */
  async getDocumentById(docId) {
    if (!this._docsCache) {
      await this.getStoredDocuments();
    }
    if (this._docIndex?.has(docId)) {
      return this._docsCache[this._docIndex.get(docId)] || null;
    }
    return null;
  }

  /**
   * 原地更新文档列表（避免全量重写）
   * @private
   */
  async _updateDocs(transformFn) {
    const docs = await this.getStoredDocuments();
    const updated = transformFn(docs);
    if (updated !== docs) {
      await this._saveDocuments(updated);
    }
    return updated;
  }

  /** @private 生成唯一ID */
  _rebuildIndex(documents) {
    this._docIndex = new Map();
    (documents || []).forEach((doc, i) => {
      if (doc?.id) this._docIndex.set(doc.id, i);
    });
  }

  async _saveDocuments(documents) {
    await chrome.storage.local.set({ [this.storageKey]: documents });
    this._docsCache = documents;
    this._rebuildIndex(documents);
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentUploader;
} else {
  window.DocumentUploader = DocumentUploader;
}
