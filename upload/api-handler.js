// 模拟API处理器 - 实际部署时需要替换为真实API
class APIHandler {
  constructor() {
    // 模拟数据库存储
    this.documents = new Map();
    this.uploadHistory = [];
  }

  // 处理文档上传请求
  async handleUpload(request) {
    try {
      const formData = await request.formData();
      const file = formData.get('file');
      const filename = formData.get('filename');
      const size = formData.get('size');
      const type = formData.get('type');
      const description = formData.get('description') || '';
      const tags = JSON.parse(formData.get('tags') || '[]');
      const metadata = JSON.parse(formData.get('metadata') || '{}');

      // 验证文件
      if (!file) {
        throw new Error('没有上传文件');
      }

      // 生成文档ID
      const documentId = this.generateId();
      
      // 模拟文件存储（实际应用中这里会存储到云存储服务）
      const documentInfo = {
        id: documentId,
        filename,
        size: parseInt(size),
        type,
        description,
        tags,
        metadata,
        uploadTime: new Date().toISOString(),
        url: `/documents/${documentId}/${encodeURIComponent(filename)}`
      };

      // 存储文档信息
      this.documents.set(documentId, documentInfo);

      // 添加到上传历史
      this.uploadHistory.push({
        id: this.generateId(),
        documentId,
        action: 'upload',
        timestamp: new Date().toISOString(),
        userAgent: request.headers.get('User-Agent') || 'unknown'
      });

      return {
        success: true,
        fileId: documentId,
        url: documentInfo.url,
        message: '文件上传成功'
      };
    } catch (error) {
      console.error('上传处理失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取文档信息
  async getDocument(documentId) {
    return this.documents.get(documentId) || null;
  }

  // 搜索文档
  async searchDocuments(query, filters = {}) {
    let results = Array.from(this.documents.values());

    // 应用搜索查询
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(doc => 
        doc.filename.toLowerCase().includes(lowerQuery) ||
        doc.description.toLowerCase().includes(lowerQuery) ||
        doc.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // 应用过滤器
    if (filters.type) {
      results = results.filter(doc => doc.type.includes(filters.type));
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      results = results.filter(doc => new Date(doc.uploadTime) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      results = results.filter(doc => new Date(doc.uploadTime) <= toDate);
    }

    // 排序
    results.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));

    return results;
  }

  // 删除文档
  async deleteDocument(documentId) {
    if (this.documents.has(documentId)) {
      this.documents.delete(documentId);
      
      // 添加删除记录到历史
      this.uploadHistory.push({
        id: this.generateId(),
        documentId,
        action: 'delete',
        timestamp: new Date().toISOString()
      });

      return { success: true };
    }
    return { success: false, error: '文档不存在' };
  }

  // 获取上传历史
  getUploadHistory(limit = 50, offset = 0) {
    return {
      items: this.uploadHistory.slice(offset, offset + limit),
      total: this.uploadHistory.length,
      limit,
      offset
    };
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // 获取统计信息
  getStatistics() {
    const documents = Array.from(this.documents.values());
    return {
      totalDocuments: documents.length,
      totalSize: documents.reduce((sum, doc) => sum + doc.size, 0),
      uploadHistoryCount: this.uploadHistory.length,
      documentTypes: this.getDocumentTypes(),
      dailyUploads: this.getDailyUploads()
    };
  }

  // 获取文档类型统计
  getDocumentTypes() {
    const types = {};
    Array.from(this.documents.values()).forEach(doc => {
      const ext = doc.filename.split('.').pop().toLowerCase();
      types[ext] = (types[ext] || 0) + 1;
    });
    return types;
  }

  // 获取每日上传统计
  getDailyUploads() {
    const daily = {};
    this.uploadHistory.forEach(record => {
      if (record.action === 'upload') {
        const date = new Date(record.timestamp).toISOString().split('T')[0];
        daily[date] = (daily[date] || 0) + 1;
      }
    });
    return daily;
  }
}

// Express.js风格的路由处理器（用于演示目的）
class RouteHandler {
  constructor() {
    this.api = new APIHandler();
  }

  // 模拟Express中间件处理
  async handleRequest(method, path, request) {
    try {
      if (method === 'POST' && path === '/api/upload-document') {
        return await this.api.handleUpload(request);
      } else if (method === 'GET' && path.startsWith('/api/documents/')) {
        const documentId = path.split('/')[3];
        return await this.api.getDocument(documentId);
      } else if (method === 'GET' && path === '/api/search') {
        const url = new URL(request.url);
        const query = url.searchParams.get('q');
        const type = url.searchParams.get('type');
        return await this.api.searchDocuments(query, { type });
      } else if (method === 'DELETE' && path.startsWith('/api/documents/')) {
        const documentId = path.split('/')[3];
        return await this.api.deleteDocument(documentId);
      } else if (method === 'GET' && path === '/api/stats') {
        return this.api.getStatistics();
      } else {
        return { error: 'Not Found', status: 404 };
      }
    } catch (error) {
      return { error: error.message, status: 500 };
    }
  }
}

// 全局API处理器实例
window.APIHandler = APIHandler;
window.RouteHandler = RouteHandler;