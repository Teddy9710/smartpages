/**
 * 文档上传模块
 * 处理PDF、DOCX、TXT格式文档的上传和解析
 */

class DocumentUploader {
  constructor() {
    this.supportedFormats = ['pdf', 'docx', 'txt'];
    this.uploadDir = 'docs';
  }

  /**
   * 检查文件格式是否支持
   */
  isSupportedFormat(file) {
    const fileName = file.name.toLowerCase();
    const ext = fileName.split('.').pop();
    return this.supportedFormats.includes(ext);
  }

  /**
   * 读取文档内容
   */
  async readDocumentContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target.result;
        const ext = file.name.toLowerCase().split('.').pop();
        
        try {
          let content = '';
          
          if (ext === 'txt') {
            content = result;
          } else if (ext === 'pdf') {
            // 这里应该集成PDF.js或其他PDF解析库
            content = this.parsePdf(result);
          } else if (ext === 'docx') {
            // 这里应该集成docx解析库
            content = this.parseDocx(result);
          }
          
          resolve({
            name: file.name,
            size: file.size,
            type: file.type,
            content: content,
            uploadTime: new Date().toISOString()
          });
        } catch (error) {
          reject(new Error(`解析文档失败: ${error.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      // 根据文件类型选择读取方式
      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  /**
   * 解析PDF内容（简化版，实际应使用PDF.js）
   */
  parsePdf(arrayBuffer) {
    // 这里是一个简化的PDF解析方法
    // 实际实现中应使用PDF.js库
    console.warn('PDF解析需要PDF.js库支持，当前返回占位符');
    return '[PDF内容 - 需要PDF.js库支持]';
  }

  /**
   * 解析DOCX内容（简化版，实际应使用docx库）
   */
  parseDocx(arrayBuffer) {
    // 这里是一个简化的DOCX解析方法
    // 实际实现中应使用docx库
    console.warn('DOCX解析需要docx库支持，当前返回占位符');
    return '[DOCX内容 - 需要docx库支持]';
  }

  /**
   * 保存文档到本地存储
   */
  async saveDocument(documentData) {
    try {
      // 获取现有文档列表
      const existingDocs = await this.getStoredDocuments();
      
      // 添加新文档
      const newDoc = {
        ...documentData,
        id: this.generateId()
      };
      
      existingDocs.push(newDoc);
      
      // 保存到Chrome存储
      await chrome.storage.local.set({ documents: existingDocs });
      
      return newDoc;
    } catch (error) {
      throw new Error(`保存文档失败: ${error.message}`);
    }
  }

  /**
   * 从本地存储获取所有文档
   */
  async getStoredDocuments() {
    try {
      const result = await chrome.storage.local.get(['documents']);
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
      throw new Error(`删除文档失败: ${error.message}`);
    }
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 导出DocumentUploader类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentUploader;
} else {
  window.DocumentUploader = DocumentUploader;
}