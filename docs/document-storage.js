// 文档存储管理器
class DocumentStorage {
  constructor() {
    this.storageKey = 'uploadedDocuments';
    this.docsFolder = 'docs/';
  }

  // 保存文档到本地存储
  async saveDocument(file, options = {}) {
    try {
      // 读取文件内容
      const content = await this.readFileContent(file);
      
      // 创建文档信息
      const documentInfo = {
        id: this.generateId(),
        filename: file.name,
        originalName: file.name,
        size: file.size,
        type: file.type,
        extension: this.getFileExtension(file.name),
        content: content,
        uploadTime: Date.now(),
        description: options.description || '',
        tags: options.tags || [],
        metadata: {
          ...options.metadata,
          lastModified: file.lastModified,
          webkitRelativePath: file.webkitRelativePath
        }
      };

      // 保存到Chrome存储
      await this.saveToStorage(documentInfo);
      
      // 添加到文档历史
      await this.addToHistory(documentInfo);
      
      return documentInfo;
    } catch (error) {
      console.error('保存文档失败:', error);
      throw error;
    }
  }

  // 读取文件内容
  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      reader.onerror = reject;
      
      // 根据文件类型选择适当的读取方式
      if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt') || 
          file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.html')) {
        reader.readAsText(file);
      } else {
        // 对于二进制文件，读取为DataURL
        reader.readAsDataURL(file);
      }
    });
  }

  // 保存到Chrome存储
  async saveToStorage(documentInfo) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const documents = result[this.storageKey] || [];
        documents.push(documentInfo);

        // 限制存储的文档数量，避免超出存储限制
        if (documents.length > 1000) {
          documents.splice(0, documents.length - 1000);
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

  // 添加到文档历史
  async addToHistory(documentInfo) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['uploadHistory'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const history = result.uploadHistory || [];
        const historyEntry = {
          id: this.generateId(),
          action: 'upload',
          documentId: documentInfo.id,
          filename: documentInfo.filename,
          size: documentInfo.size,
          timestamp: documentInfo.uploadTime,
          type: 'local'
        };

        history.push(historyEntry);

        // 限制历史记录数量
        if (history.length > 1000) {
          history.splice(0, history.length - 1000);
        }

        chrome.storage.local.set({ uploadHistory: history }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 获取所有文档
  async getAllDocuments() {
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

  // 根据ID获取文档
  async getDocumentById(id) {
    const documents = await this.getAllDocuments();
    return documents.find(doc => doc.id === id) || null;
  }

  // 搜索文档
  async searchDocuments(query, filters = {}) {
    const documents = await this.getAllDocuments();
    
    return documents.filter(doc => {
      // 检查查询匹配
      const matchesQuery = !query || 
        doc.filename.toLowerCase().includes(query.toLowerCase()) ||
        doc.description.toLowerCase().includes(query.toLowerCase()) ||
        doc.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
      
      // 检查类型过滤
      const matchesType = !filters.type || doc.type.includes(filters.type);
      
      // 检查扩展名过滤
      const matchesExtension = !filters.extension || doc.extension === filters.extension;
      
      // 检查日期范围
      let matchesDate = true;
      if (filters.dateFrom) {
        matchesDate = matchesDate && doc.uploadTime >= new Date(filters.dateFrom).getTime();
      }
      if (filters.dateTo) {
        matchesDate = matchesDate && doc.uploadTime <= new Date(filters.dateTo).getTime();
      }
      
      return matchesQuery && matchesType && matchesExtension && matchesDate;
    });
  }

  // 删除文档
  async deleteDocument(id) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const documents = result[this.storageKey] || [];
        const filteredDocuments = documents.filter(doc => doc.id !== id);

        chrome.storage.local.set({ [this.storageKey]: filteredDocuments }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            // 同时删除关联信息
            this.removeAssociationsForDocument(id)
              .then(() => resolve())
              .catch(reject);
          }
        });
      });
    });
  }

  // 删除文档关联
  async removeAssociationsForDocument(documentId) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['documentAssociations'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const associations = result.documentAssociations || [];
        const filteredAssociations = associations.filter(assoc => assoc.documentId !== documentId);

        chrome.storage.local.set({ documentAssociations: filteredAssociations }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 获取文档统计
  async getStatistics() {
    const documents = await this.getAllDocuments();
    
    const stats = {
      totalDocuments: documents.length,
      totalSize: documents.reduce((sum, doc) => sum + doc.size, 0),
      byType: {},
      byExtension: {},
      byMonth: {}
    };

    documents.forEach(doc => {
      // 按类型统计
      stats.byType[doc.type] = (stats.byType[doc.type] || 0) + 1;
      
      // 按扩展名统计
      stats.byExtension[doc.extension] = (stats.byExtension[doc.extension] || 0) + 1;
      
      // 按月份统计
      const month = new Date(doc.uploadTime).toISOString().slice(0, 7); // YYYY-MM
      stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;
    });

    return stats;
  }

  // 获取文件扩展名
  getFileExtension(filename) {
    return filename.toLowerCase().split('.').pop();
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // 导出文档为文件
  async exportDocument(id, format = 'original') {
    const document = await this.getDocumentById(id);
    if (!document) {
      throw new Error('文档不存在');
    }

    let content = document.content;
    let mimeType = document.type;
    let filename = document.filename;

    if (format === 'text' && document.type.startsWith('image/')) {
      // 如果是图片且要求导出为文本，尝试OCR（简化处理）
      content = `[图片文件: ${document.filename}]`;
      mimeType = 'text/plain';
      filename = document.filename.replace(/\.[^/.]+$/, '.txt');
    } else if (format === 'markdown') {
      // 转换为markdown格式
      content = `# ${document.filename}\n\n${content}`;
      mimeType = 'text/markdown';
      filename = document.filename.replace(/\.[^/.]+$/, '.md');
    }

    // 创建blob并下载
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 清理存储
  async cleanupStorage(maxAgeDays = 30) {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const documents = result[this.storageKey] || [];
        const filteredDocuments = documents.filter(doc => doc.uploadTime > cutoffTime);

        chrome.storage.local.set({ [this.storageKey]: filteredDocuments }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve({
              removed: documents.length - filteredDocuments.length,
              remaining: filteredDocuments.length
            });
          }
        });
      });
    });
  }
}

// 全局实例
window.DocumentStorage = DocumentStorage;