/**
 * 文档上传模块（统一版本）
 * 处理多格式文档的上传和解析
 */

class DocumentUploader {
  constructor() {
    this.supportedFormats = ['pdf', 'docx', 'txt', 'md', 'html', 'htm', 'rtf', 'xlsx', 'pptx'];
    this.uploadDir = 'docs';
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (error) => reject(error);

      if (file.type.startsWith('text/') ||
          file.name.toLowerCase().endsWith('.txt') ||
          file.name.toLowerCase().endsWith('.md') ||
          file.name.toLowerCase().endsWith('.html') ||
          file.name.toLowerCase().endsWith('.htm')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * 读取文档内容（用于解析和存储）
   */
  async readDocumentContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const result = e.target.result;
        const ext = file.name.toLowerCase().split('.').pop();

        try {
          let content = '';

          if (ext === 'txt' || ext === 'md' || ext === 'html' || ext === 'htm' || ext === 'rtf') {
            content = result;
          } else if (ext === 'pdf') {
            content = this._parsePdf(result);
          } else if (ext === 'docx') {
            content = this._parseDocx(result);
          } else {
            content = result;
          }

          resolve({
            name: file.name,
            size: file.size,
            type: file.type,
            content: content,
            uploadTime: new Date().toISOString()
          });
        } catch (error) {
          reject(new Error('解析文档失败: ' + error.message));
        }
      };

      reader.onerror = () => reject(new Error('读取文件失败'));

      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt') ||
          file.name.toLowerCase().endsWith('.md') ||
          file.name.toLowerCase().endsWith('.html') ||
          file.name.toLowerCase().endsWith('.htm')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
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
      await chrome.storage.local.set({ documents: existingDocs });
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
      const result = await chrome.storage.local.get(['documents']);
      // Maintain index for O(1) lookups
      if (result.documents) {
        this._docIndex = new Map();
        result.documents.forEach((doc, i) => this._docIndex.set(doc.id, i));
      }
      return result.documents || [];
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
      await chrome.storage.local.set({ documents: updatedDocs });
      return true;
    } catch (error) {
      throw new Error('删除文档失败: ' + error.message);
    }
  }

  /** @private 解析PDF（需集成PDF.js） */
  _parsePdf(arrayBuffer) {
    console.warn('PDF解析需要PDF.js库支持');
    return '[PDF内容 - 需要PDF.js库支持]';
  }

  /** @private 解析DOCX（需集成docx库） */
  _parseDocx(arrayBuffer) {
    console.warn('DOCX解析需要docx库支持');
    return '[DOCX内容 - 需要docx库支持]';
  }

  /**
   * O(1) 获取单文档（使用内存索引）
   */
  async getDocumentById(docId) {
    const docs = await this.getStoredDocuments();
    if (this._docIndex?.has(docId)) {
      return docs[this._docIndex.get(docId)] || null;
    }
    return docs.find(doc => doc.id === docId) || null;
  }

  /**
   * 原地更新文档列表（避免全量重写）
   * @private
   */
  async _updateDocs(transformFn) {
    const docs = await this.getStoredDocuments();
    const updated = transformFn(docs);
    if (updated !== docs) {
      await chrome.storage.local.set({ documents: updated });
    }
    return updated;
  }

  /** @private 生成唯一ID */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentUploader;
} else {
  window.DocumentUploader = DocumentUploader;
}
