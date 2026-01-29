// 文档API处理器
class DocumentApi {
  constructor() {
    this.storageKey = 'uploadedDocuments';
  }

  // 处理上传请求
  async handleUploadRequest(file) {
    try {
      // 读取文件内容
      const content = await this.readFileContent(file);
      
      // 创建文档信息
      const documentInfo = {
        id: this.generateId(),
        name: file.name,
        size: file.size,
        type: file.type,
        content: content,
        uploadTime: Date.now(),
        extension: file.name.split('.').pop().toLowerCase()
      };

      // 保存到存储
      await this.saveDocument(documentInfo);

      return {
        success: true,
        message: '文档上传成功',
        document: documentInfo
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // 读取文件内容
  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      // 根据文件类型选择读取方式
      if (file.type.startsWith('text/') || 
          file.name.toLowerCase().endsWith('.txt') || 
          file.name.toLowerCase().endsWith('.md') || 
          file.name.toLowerCase().endsWith('.html')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  // 保存文档到存储
  async saveDocument(documentInfo) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const documents = result[this.storageKey] || [];
        documents.push(documentInfo);

        // 限制文档数量，避免存储溢出
        if (documents.length > 500) {
          documents.shift(); // 移除最早的文档
        }

        chrome.storage.local.set({ [this.storageKey]: documents }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 获取文档列表
  async getDocumentsList() {
    try {
      const result = await this.getStoredDocuments();
      return {
        success: true,
        documents: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // 获取存储的文档
  async getStoredDocuments() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[this.storageKey] || []);
        }
      });
    });
  }

  // 获取文档内容
  async getDocumentContent(docId) {
    try {
      const documents = await this.getStoredDocuments();
      const document = documents.find(doc => doc.id === docId);
      
      if (!document) {
        throw new Error('文档不存在');
      }

      return {
        success: true,
        document: document
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // 删除文档
  async deleteDocument(docId) {
    try {
      const documents = await this.getStoredDocuments();
      const filteredDocuments = documents.filter(doc => doc.id !== docId);

      await this.saveAllDocuments(filteredDocuments);

      return {
        success: true,
        message: '文档删除成功'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // 保存所有文档
  async saveAllDocuments(documents) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.storageKey]: documents }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}