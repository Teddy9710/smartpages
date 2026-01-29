/**
 * 文档关联模块
 * 实现文档与代码的关联机制
 */

class DocumentLinker {
  constructor() {
    this.linkStorageKey = 'documentCodeLinks';
  }

  /**
   * 创建文档与代码的关联
   */
  async linkDocumentToCode(docId, codeContext) {
    try {
      // 获取现有的关联数据
      const existingLinks = await this.getExistingLinks();
      
      // 创建新的关联项
      const newLink = {
        id: this.generateId(),
        docId: docId,
        codeContext: codeContext,
        linkedAt: new Date().toISOString(),
        metadata: {
          codeType: this.detectCodeType(codeContext.code),
          functionName: this.extractFunctionName(codeContext.code),
          description: codeContext.description || ''
        }
      };
      
      existingLinks.push(newLink);
      
      // 保存到存储
      await chrome.storage.local.set({ [this.linkStorageKey]: existingLinks });
      
      return {
        success: true,
        link: newLink
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 获取文档的所有关联代码
   */
  async getLinkedCodesForDocument(docId) {
    try {
      const existingLinks = await this.getExistingLinks();
      const linkedCodes = existingLinks.filter(link => link.docId === docId);
      
      return {
        success: true,
        links: linkedCodes
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 获取代码的所有关联文档
   */
  async getLinkedDocumentsForCode(codeHash) {
    try {
      const existingLinks = await this.getExistingLinks();
      // 这里假设codeHash是基于代码内容生成的哈希值
      const linkedDocs = existingLinks.filter(link => 
        this.generateCodeHash(link.codeContext.code) === codeHash
      );
      
      return {
        success: true,
        links: linkedDocs
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 删除文档与代码的关联
   */
  async unlinkDocumentFromCode(linkId) {
    try {
      const existingLinks = await this.getExistingLinks();
      const updatedLinks = existingLinks.filter(link => link.id !== linkId);
      
      await chrome.storage.local.set({ [this.linkStorageKey]: updatedLinks });
      
      return {
        success: true,
        message: '关联已删除'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 获取所有关联
   */
  async getAllLinks() {
    try {
      return await this.getExistingLinks();
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取现有链接数据
   */
  async getExistingLinks() {
    try {
      const result = await chrome.storage.local.get([this.linkStorageKey]);
      return result[this.linkStorageKey] || [];
    } catch (error) {
      console.error('获取链接数据失败:', error);
      return [];
    }
  }

  /**
   * 检测代码类型
   */
  detectCodeType(code) {
    if (code.includes('function') || code.includes('def ') || code.includes('var ') || code.includes('let ') || code.includes('const ')) {
      return 'javascript';
    } else if (code.includes('import') || code.includes('from') || code.includes('def ') || code.includes('class ')) {
      return 'python';
    } else if (code.includes('#include') || code.includes('#define') || code.includes('int main')) {
      return 'c_cpp';
    } else if (code.includes('public class') || code.includes('private') || code.includes('protected')) {
      return 'java';
    } else if (code.includes('<!DOCTYPE html>') || code.includes('<html>') || code.includes('<div')) {
      return 'html';
    } else if (code.includes('{') && code.includes('}')) {
      return 'general';
    }
    return 'unknown';
  }

  /**
   * 提取函数名
   */
  extractFunctionName(code) {
    // JavaScript/Python函数名提取
    const funcMatch = code.match(/(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (funcMatch && funcMatch[1]) {
      return funcMatch[1];
    }
    
    // Python def匹配
    const pythonMatch = code.match(/def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (pythonMatch && pythonMatch[1]) {
      return pythonMatch[1];
    }
    
    // Java方法名匹配
    const javaMatch = code.match(/(?:public|private|protected)\s+\w+\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (javaMatch && javaMatch[1]) {
      return javaMatch[1];
    }
    
    return 'unknown_function';
  }

  /**
   * 生成代码哈希
   */
  generateCodeHash(code) {
    // 简单的哈希生成（实际应用中可能需要更复杂的算法）
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString();
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 搜索与文档相关的代码
   */
  async searchRelatedCode(docId, searchTerm) {
    try {
      const existingLinks = await this.getExistingLinks();
      const relatedLinks = existingLinks.filter(link => 
        link.docId === docId && (
          link.codeContext.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          link.codeContext.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          link.metadata.functionName.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      
      return {
        success: true,
        links: relatedLinks
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 搜索与代码相关的文档
   */
  async searchRelatedDocuments(code, searchTerm) {
    try {
      const existingLinks = await this.getExistingLinks();
      const relatedLinks = existingLinks.filter(link => 
        link.codeContext.code.toLowerCase().includes(code.toLowerCase()) &&
        (
          link.docId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          link.metadata.description.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      
      return {
        success: true,
        links: relatedLinks
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

// 导出DocumentLinker类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocumentLinker;
} else {
  window.DocumentLinker = DocumentLinker;
}