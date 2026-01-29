// 文档关联器 - 用于将文档与录制会话关联
class DocumentAssociator {
  constructor() {
    this.storageKey = 'documentAssociations';
  }

  // 关联文档到会话
  async associateDocumentWithSession(documentInfo, sessionId) {
    try {
      // 获取现有关联
      let associations = await this.getAssociations();
      
      // 创建新的关联记录
      const newAssociation = {
        id: this.generateId(),
        documentId: documentInfo.id || documentInfo.filename,
        documentName: documentInfo.filename,
        documentUrl: documentInfo.url,
        sessionId: sessionId,
        timestamp: Date.now(),
        metadata: documentInfo.metadata || {}
      };
      
      // 添加到关联列表
      associations.push(newAssociation);
      
      // 保存关联
      await this.saveAssociations(associations);
      
      return newAssociation;
    } catch (error) {
      console.error('关联文档失败:', error);
      throw error;
    }
  }

  // 获取与会话关联的所有文档
  async getDocumentsForSession(sessionId) {
    try {
      const associations = await this.getAssociations();
      return associations.filter(assoc => assoc.sessionId === sessionId);
    } catch (error) {
      console.error('获取会话文档失败:', error);
      throw error;
    }
  }

  // 获取与文档关联的所有会话
  async getSessionsForDocument(documentId) {
    try {
      const associations = await this.getAssociations();
      return associations.filter(assoc => assoc.documentId === documentId);
    } catch (error) {
      console.error('获取文档会话失败:', error);
      throw error;
    }
  }

  // 删除关联
  async removeAssociation(associationId) {
    try {
      let associations = await this.getAssociations();
      associations = associations.filter(assoc => assoc.id !== associationId);
      await this.saveAssociations(associations);
    } catch (error) {
      console.error('删除关联失败:', error);
      throw error;
    }
  }

  // 获取所有关联
  async getAssociations() {
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

  // 保存关联
  async saveAssociations(associations) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.storageKey]: associations }, () => {
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

  // 获取关联统计
  async getStatistics() {
    try {
      const associations = await this.getAssociations();
      
      return {
        totalAssociations: associations.length,
        uniqueDocuments: [...new Set(associations.map(a => a.documentId))].length,
        uniqueSessions: [...new Set(associations.map(a => a.sessionId))].length,
        recentAssociations: associations.slice(-10) // 最近10个关联
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      throw error;
    }
  }

  // 清理过期关联（可选功能）
  async cleanupExpiredAssociations(daysToKeep = 30) {
    try {
      const associations = await this.getAssociations();
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      
      const remainingAssociations = associations.filter(
        assoc => assoc.timestamp > cutoffTime
      );
      
      if (remainingAssociations.length < associations.length) {
        await this.saveAssociations(remainingAssociations);
        return {
          removed: associations.length - remainingAssociations.length,
          remaining: remainingAssociations.length
        };
      }
      
      return { removed: 0, remaining: remainingAssociations.length };
    } catch (error) {
      console.error('清理过期关联失败:', error);
      throw error;
    }
  }
}

// 扩展SidePanelManager以支持文档关联
class ExtendedSidePanelManager extends SidePanelManager {
  constructor() {
    super();
    this.documentAssociator = new DocumentAssociator();
  }

  // 在生成文档后关联相关文档
  async associateRelatedDocuments(sessionId) {
    try {
      // 获取与当前会话关联的文档
      const associatedDocs = await this.documentAssociator.getDocumentsForSession(sessionId);
      
      if (associatedDocs.length > 0) {
        // 在生成的文档中添加相关文档引用
        const docEditor = document.getElementById('markdown-editor');
        let currentContent = docEditor.value;
        
        // 添加相关文档部分
        const relatedDocsSection = '\n\n## 相关文档\n\n' + 
          associatedDocs.map(doc => `- [${doc.documentName}](${doc.documentUrl})`).join('\n');
        
        docEditor.value = currentContent + relatedDocsSection;
        this.updatePreview();
      }
    } catch (error) {
      console.error('关联相关文档失败:', error);
    }
  }

  // 重写文档生成方法以支持关联
  async generateDocument() {
    let description = this.selectedDescription;

    // 如果选择了自定义输入
    const customRadio = document.querySelector('input[value="custom"]');
    if (customRadio.checked) {
      description = document.getElementById('custom-description').value.trim();
      if (!description) {
        alert('请输入自定义描述');
        return;
      }
    } else if (!description) {
      // 默认选择第一个
      description = this.generatedDescriptions[0];
    }

    this.showLoading('正在生成文档...');

    try {
      const config = await this.loadConfig();
      const document = await this.generateDocumentContent(description, config);

      if (document) {
        this.generatedDocument = document;
        document.getElementById('markdown-editor').value = document;
        this.updatePreview();
        this.showState('document-editor');
        
        // 如果有当前会话，尝试关联相关文档
        if (this.currentSession && this.currentSession.sessionId) {
          await this.associateRelatedDocuments(this.currentSession.sessionId);
        }
      } else {
        this.showError('文档生成失败，请重试');
      }
    } catch (error) {
      console.error('Failed to generate document:', error);
      this.showError('文档生成失败：' + error.message);
    }
  }
}

// 替换原始的SidePanelManager
window.SidePanelManager = ExtendedSidePanelManager;