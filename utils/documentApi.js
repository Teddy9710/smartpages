/**
 * 文档API接口模块
 * 提供文档上传、检索、管理的API接口
 */

class DocumentApi {
  constructor() {
    this.uploader = new DocumentUploader();
  }

  /**
   * 处理文档上传请求
   */
  async handleUploadRequest(file) {
    try {
      // 验证文件格式
      if (!this.uploader.isSupportedFormat(file)) {
        throw new Error(`不支持的文件格式。支持的格式: ${this.uploader.supportedFormats.join(', ')}`);
      }

      // 读取文档内容
      const documentData = await this.uploader.readDocumentContent(file);

      // 保存文档
      const savedDoc = await this.uploader.saveDocument(documentData);

      return {
        success: true,
        message: '文档上传成功',
        document: savedDoc
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  _createContentPreview(content, maxLength = 180) {
    const normalized = String(content || '')
      .replace(/^---\s*第\s*\d+\s*页\s*---\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength).trimEnd()}…`
      : normalized;
  }

  _toDocumentSummary(doc) {
    return {
      id: doc.id,
      name: doc.name,
      size: doc.size,
      type: doc.type,
      contentPreview: this._createContentPreview(doc.content),
      category: String(doc.category || '').trim(),
      ocrPageCount: Number(doc.ocrPageCount) || 0,
      uploadTime: doc.uploadTime
    };
  }

  _getDocumentCategories(documents) {
    return [...new Set(
      documents
        .map(doc => String(doc.category || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
  }

  /**
   * 获取所有文档列表
   */
  async getDocumentsList() {
    try {
      const documents = await this.uploader.getStoredDocuments();
      
      return {
        success: true,
        documents: documents.map(doc => this._toDocumentSummary(doc)),
        categories: this._getDocumentCategories(documents)
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 获取特定文档内容
   */
  async getDocumentContent(docId) {
    try {
      // O(1) indexed lookup instead of full-scan .find()
      const document = await this.uploader.getDocumentById(docId);
      if (!document) throw new Error('文档不存在');
      return {
        success: true,
        document: {
          id: document.id,
          name: document.name,
          content: document.content,
          size: document.size,
          type: document.type,
          category: String(document.category || '').trim(),
          ocrPageCount: Number(document.ocrPageCount) || 0,
          uploadTime: document.uploadTime
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 删除文档
   */
  async deleteDocument(docId) {
    try {
      const result = await this.uploader.deleteDocument(docId);
      
      if (result) {
        return {
          success: true,
          message: '文档删除成功'
        };
      } else {
        throw new Error('删除文档失败');
      }
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  async updateDocumentCategory(docId, category) {
    try {
      const normalizedCategory = String(category || '').replace(/\s+/g, ' ').trim();
      if (normalizedCategory.length > 40) throw new Error('分类名称不能超过 40 个字符');
      const document = await this.uploader.updateDocumentCategory(docId, normalizedCategory);
      return {
        success: true,
        message: normalizedCategory ? '文档分类已更新' : '文档已移至未分类',
        document: this._toDocumentSummary(document)
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 搜索文档内容
   */
  async searchDocuments(query) {
    try {
      const documents = await this.uploader.getStoredDocuments();
      const searchTerm = query.toLowerCase();

      const matchedDocuments = documents.filter(doc => 
        doc.name.toLowerCase().includes(searchTerm) || 
        (doc.content && doc.content.toLowerCase().includes(searchTerm))
      );

      return {
        success: true,
        documents: matchedDocuments.map(doc => this._toDocumentSummary(doc)),
        categories: this._getDocumentCategories(documents),
        totalCount: matchedDocuments.length
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

// 初始化API实例
const documentApi = new DocumentApi();

// 导出DocumentApi类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DocumentApi, documentApi };
} else {
  window.DocumentApi = DocumentApi;
  window.documentApi = documentApi;
}
