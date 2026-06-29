// 文档上传管理器
class DocumentUploadManager {
  static assertFileSize(file) {
    const maxFileSize = typeof MAX_FILE_SIZE === 'number' ? MAX_FILE_SIZE : 5 * 1024 * 1024;
    if (!file || !Number.isFinite(Number(file.size)) || Number(file.size) > maxFileSize) {
      throw new Error('File size exceeds the 5 MB upload limit');
    }
  }

  static parseGitHubRepository(value) {
    const match = String(value || '').trim().match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)$/);
    if (!match) {
      throw new Error('GitHub repository must use owner/repository format');
    }
    return { owner: match[1], repository: match[2] };
  }

  static sanitizeGitHubFilename(value) {
    const filename = String(value || '')
      .split(/[\\/]/)
      .pop()
      .split('')
      .filter(char => char >= ' ' && char !== '\u007f')
      .join('')
      .trim();
    if (!filename || filename === '.' || filename === '..') {
      throw new Error('Invalid GitHub upload filename');
    }
    return filename;
  }

  constructor() {
    this.supportedFormats = ['pdf', 'docx', 'txt', 'md', 'html', 'rtf'];
    this.uploadQueue = [];
    this.isUploading = false;
  }

  // 检查文件格式是否支持
  isSupportedFormat(filename) {
    const extension = filename.toLowerCase().split('.').pop();
    return this.supportedFormats.includes(extension);
  }

  // 获取文件类型图标
  getFileIcon(extension) {
    const iconMap = {
      'pdf': '📄',
      'docx': '📝',
      'txt': '📑',
      'md': '📘',
      'html': '🌐',
      'rtf': '📜'
    };
    return iconMap[extension] || '📁';
  }

  // 上传单个文件
  async uploadFile(file, options = {}) {
    DocumentUploadManager.assertFileSize(file);
    if (!this.isSupportedFormat(file.name)) {
      throw new Error(`不支持的文件格式: ${file.name}`);
    }

    try {
      // 模拟上传进度
      const progressCallback = options.progressCallback || (() => {});
      progressCallback(0);

      const uploader = typeof DocumentUploader !== 'undefined' ? new DocumentUploader() : null;
      if (!uploader) {
        throw new Error('DocumentUploader is not available');
      }

      progressCallback(50);
      const documentData = await uploader.readDocumentContent(file);
      const result = await uploader.saveDocument({
        ...documentData,
        description: options.description || '',
        tags: options.tags || [],
        metadata: options.metadata || {}
      });
      if (!result?.id) {
        throw new Error('Document upload failed');
      }
      progressCallback(100);
      return {
        success: true,
        fileId: result.id,
        url: '',
        filename: file.name,
        size: file.size,
        type: file.type
      };
    } catch (error) {
      console.error('文件上传失败:', error);
      throw error;
    }
  }

  // 批量上传文件
  async uploadFiles(files, options = {}) {
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileOptions = {
        ...options,
        progressCallback: (progress) => {
          if (options.batchProgressCallback) {
            const overallProgress = ((i / files.length) * 100) + (progress / files.length);
            options.batchProgressCallback(overallProgress, i + 1, files.length);
          }
        }
      };

      try {
        const result = await this.uploadFile(file, fileOptions);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          filename: file.name,
          error: error.message
        });
      }
    }

    return results;
  }

  // 上传到GitHub
  async uploadToGitHub(file, githubOptions) {
    DocumentUploadManager.assertFileSize(file);
    if (!githubOptions.token || !githubOptions.repo || !githubOptions.branch) {
      throw new Error('缺少GitHub配置信息');
    }

    const { owner, repository } = DocumentUploadManager.parseGitHubRepository(githubOptions.repo);
    const filename = DocumentUploadManager.sanitizeGitHubFilename(file.name);
    const base64Content = await this.readFileAsBase64(file);
    const apiUrl = `https://api.github.com/repos/${owner}/${repository}/contents/${encodeURIComponent(filename)}`;
    
    const requestBody = {
      message: `Upload ${filename} via SmartPages`,
      content: base64Content,
      branch: githubOptions.branch || 'main'
    };

    if (githubOptions.committer) {
      requestBody.committer = githubOptions.committer;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubOptions.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub上传失败: ${errorData.message}`);
      }

      const result = await response.json();
      return {
        success: true,
        sha: result.commit.sha,
        url: result.content.download_url,
        filename
      };
    } catch (error) {
      console.error('GitHub上传失败:', error);
      throw error;
    }
  }

  // 读取文件为Base64
  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // 移除data URL前缀
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 关联文档到录制会话
  async associateDocumentWithSession(documentId, sessionId) {
    try {
      // 这里可以实现将文档与特定录制会话关联的逻辑
      // 例如，将关联信息存储在本地或发送到服务器
      const association = {
        documentId,
        sessionId,
        timestamp: Date.now()
      };

      // 存储关联信息到Chrome存储
      await this.storeAssociation(association);
      
      return { success: true, association };
    } catch (error) {
      console.error('关联文档失败:', error);
      throw error;
    }
  }

  // 存储文档关联信息
  async storeAssociation(association) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['documentAssociations'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const associations = result.documentAssociations || [];
        associations.push(association);

        chrome.storage.local.set({ documentAssociations: associations }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // 获取与会话关联的文档
  async getDocumentsForSession(sessionId) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['documentAssociations'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const associations = result.documentAssociations || [];
        const sessionDocs = associations.filter(assoc => assoc.sessionId === sessionId);
        
        resolve(sessionDocs);
      });
    });
  }

  // 获取上传历史
  async getUploadHistory(limit = 50) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['uploadHistory'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const history = result.uploadHistory || [];
        // 返回最新的limit条记录
        resolve(history.slice(-limit));
      });
    });
  }

  // 添加上传记录到历史
  async addToHistory(record) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['uploadHistory'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        const history = result.uploadHistory || [];
        record.timestamp = Date.now();
        history.push(record);

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
}

// 全局实例
window.DocumentUploadManager = DocumentUploadManager;
