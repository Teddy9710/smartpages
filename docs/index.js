// Smart Page Scribe 文档管理系统主入口

/**
 * 文档管理系统整合了所有文档相关功能
 * 包括：存储、上传、搜索、API接口、命令行工具等
 */

class DocumentManagementSystem {
  constructor() {
    // 初始化各个组件
    this.storage = new DocumentStorage();
    this.uploader = new DocumentUploader();
    this.api = new DocumentAPIEndpoints();
    this.cli = new CLIInterface();
    this.webSimulator = new WebAPISimulator();
    
    // 绑定到全局作用域
    this.bindToGlobal();
  }

  // 绑定到全局作用域
  bindToGlobal() {
    if (typeof window !== 'undefined') {
      window.DocumentSystem = this;
      window.DocStorage = this.storage;
      window.DocUploader = this.uploader;
      window.DocAPI = this.api;
      window.DocCLI = this.cli;
    }
  }

  // 上传文档
  async uploadDocument(file, options = {}) {
    return await this.storage.saveDocument(file, options);
  }

  // 搜索文档
  async searchDocuments(query, filters = {}) {
    return await this.storage.searchDocuments(query, filters);
  }

  // 获取文档
  async getDocument(id) {
    return await this.storage.getDocumentById(id);
  }

  // 删除文档
  async deleteDocument(id) {
    return await this.storage.deleteDocument(id);
  }

  // 导出文档
  async exportDocument(id, format = 'original') {
    return await this.storage.exportDocument(id, format);
  }

  // 获取统计信息
  async getStatistics() {
    return await this.storage.getStatistics();
  }

  // 执行CLI命令
  async executeCLICommand(args) {
    return await this.cli.executeCommand(args);
  }

  // 处理API请求
  async handleAPIRequest(input, init) {
    return await this.webSimulator.handleRequest(input, init);
  }

  // 初始化系统
  async initialize() {
    console.log('Smart Page Scribe 文档管理系统已初始化');
    console.log('可用组件:');
    console.log('- DocumentSystem: 主系统接口');
    console.log('- DocStorage: 文档存储');
    console.log('- DocUploader: 文档上传器');
    console.log('- DocAPI: API端点');
    console.log('- DocCLI: 命令行接口');
    console.log('');
    console.log('示例用法:');
    console.log('DocumentSystem.uploadDocument(file, options)');
    console.log('DocumentSystem.searchDocuments("query")');
    console.log('window.scribe help  (命令行工具)');
  }
}

// 初始化文档管理系统
const documentSystem = new DocumentManagementSystem();

// 初始化CLI（如果在浏览器环境中）
if (typeof window !== 'undefined') {
  initCLI(); // 从cli-interface.js导入的函数
}

// 自动初始化系统
documentSystem.initialize();

// 导出（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DocumentManagementSystem,
    DocumentStorage,
    DocumentUploader,
    DocumentAPIEndpoints,
    CLIInterface,
    WebAPISimulator
  };
}