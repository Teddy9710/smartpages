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

  /**
   * 获取所有文档列表
   */
  async getDocumentsList() {
    try {
      const documents = await this.uploader.getStoredDocuments();
      
      return {
        success: true,
        documents: documents.map(doc => ({
          id: doc.id,
          name: doc.name,
          size: doc.size,
          type: doc.type,
          uploadTime: doc.uploadTime
        }))
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
      const documents = await this.uploader.getStoredDocuments();
      const document = documents.find(doc => doc.id === docId);
      
      if (!document) {
        throw new Error('文档不存在');
      }

      return {
        success: true,
        document: {
          id: document.id,
          name: document.name,
          content: document.content,
          size: document.size,
          type: document.type,
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
        documents: matchedDocuments.map(doc => ({
          id: doc.id,
          name: doc.name,
          size: doc.size,
          type: doc.type,
          uploadTime: doc.uploadTime
        })),
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