// 文档API端点处理器
class DocumentAPIEndpoints {
  constructor() {
    this.storage = new DocumentStorage();
  }

  // 处理上传请求
  async handleUpload(request) {
    try {
      if (request.method !== 'POST' && !request.url.includes('/upload')) {
        return this.createResponse({ error: 'Method not allowed' }, 405);
      }

      // 模拟文件上传处理
      const formData = await request.formData();
      const file = formData.get('file');
      
      if (!file) {
        return this.createResponse({ error: 'No file provided' }, 400);
      }

      // 使用DocumentStorage保存文档
      const options = {
        description: formData.get('description') || '',
        tags: formData.get('tags') ? JSON.parse(formData.get('tags')) : [],
        metadata: formData.get('metadata') ? JSON.parse(formData.get('metadata')) : {}
      };

      const documentInfo = await this.storage.saveDocument(file, options);

      return this.createResponse({
        success: true,
        document: documentInfo
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 处理获取文档请求
  async handleGetDocument(request, documentId) {
    try {
      const document = await this.storage.getDocumentById(documentId);
      
      if (!document) {
        return this.createResponse({ error: 'Document not found' }, 404);
      }

      return this.createResponse({
        success: true,
        document: document
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 处理搜索文档请求
  async handleSearch(request) {
    try {
      const url = new URL(request.url);
      const query = url.searchParams.get('q') || '';
      const type = url.searchParams.get('type') || '';
      const extension = url.searchParams.get('extension') || '';
      
      const filters = {};
      if (type) filters.type = type;
      if (extension) filters.extension = extension;

      const results = await this.storage.searchDocuments(query, filters);

      return this.createResponse({
        success: true,
        documents: results,
        count: results.length
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 处理删除文档请求
  async handleDelete(request, documentId) {
    try {
      await this.storage.deleteDocument(documentId);

      return this.createResponse({
        success: true,
        message: 'Document deleted successfully'
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 获取统计信息
  async handleStats(request) {
    try {
      const stats = await this.storage.getStatistics();

      return this.createResponse({
        success: true,
        stats: stats
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 导出文档
  async handleExport(request, documentId) {
    try {
      const url = new URL(request.url);
      const format = url.searchParams.get('format') || 'original';
      
      // 这里我们返回一个指示，让前端处理下载
      return this.createResponse({
        success: true,
        downloadUrl: `/api/documents/${documentId}/download?format=${format}`
      }, 200);
    } catch (error) {
      return this.createResponse({ error: error.message }, 500);
    }
  }

  // 创建响应
  createResponse(data, statusCode = 200) {
    return new Response(JSON.stringify(data), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // 处理CORS预检请求
  handleCorsPreflight() {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
}

// Web API模拟器 - 用于在浏览器环境中模拟API行为
class WebAPISimulator {
  constructor() {
    this.endpoints = new DocumentAPIEndpoints();
  }

  // 模拟fetch请求处理
  async handleRequest(input, init) {
    const url = new URL(input);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (init && init.method === 'OPTIONS') {
      return this.endpoints.handleCorsPreflight();
    }

    try {
      if (url.pathname === '/api/upload' && init.method === 'POST') {
        // 模拟上传请求
        const mockRequest = {
          method: init.method,
          url: input,
          formData: async () => {
            // 这里应该解析init.body，但为了简化我们返回一个模拟对象
            return {
              get: (key) => {
                if (key === 'file') {
                  // 返回一个模拟文件对象
                  return {
                    name: 'mock_file.txt',
                    size: 1024,
                    type: 'text/plain',
                    text: async () => 'Mock file content'
                  };
                }
                return '';
              }
            };
          }
        };
        return await this.endpoints.handleUpload(mockRequest);
      } else if (url.pathname.startsWith('/api/documents/') && pathParts[2]) {
        const documentId = pathParts[2];
        if (init.method === 'GET') {
          return await this.endpoints.handleGetDocument({ url: input }, documentId);
        } else if (init.method === 'DELETE') {
          return await this.endpoints.handleDelete({ url: input }, documentId);
        } else if (url.pathname.endsWith('/export')) {
          return await this.endpoints.handleExport({ url: input }, documentId);
        }
      } else if (url.pathname === '/api/search' && init.method === 'GET') {
        return await this.endpoints.handleSearch({ url: input });
      } else if (url.pathname === '/api/stats' && init.method === 'GET') {
        return await this.endpoints.handleStats({ url: input });
      }
    } catch (error) {
      return this.endpoints.createResponse({ error: error.message }, 500);
    }

    return this.endpoints.createResponse({ error: 'Not Found' }, 404);
  }
}

// 全局实例
window.DocumentAPIEndpoints = DocumentAPIEndpoints;
window.WebAPISimulator = WebAPISimulator;