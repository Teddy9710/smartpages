// 文档管理系统集成测试

class DocumentManagementTestSuite {
  constructor() {
    this.tests = [];
    this.results = [];
    this.storage = new DocumentStorage();
  }

  // 添加测试用例
  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  // 运行所有测试
  async runAllTests() {
    console.log('开始运行文档管理系统集成测试...');
    
    for (const test of this.tests) {
      console.log(`\nRunning: ${test.name}`);
      try {
        const result = await test.testFn();
        this.results.push({ name: test.name, passed: true, result });
        console.log('✅ PASSED');
      } catch (error) {
        this.results.push({ name: test.name, passed: false, error: error.message });
        console.log('❌ FAILED:', error.message);
      }
    }
    
    this.printSummary();
    return this.results;
  }

  // 打印测试摘要
  printSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    
    console.log('\n=== 测试摘要 ===');
    console.log(`总测试数: ${total}`);
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    console.log(`成功率: ${((passed/total)*100).toFixed(2)}%`);
    
    if (failed > 0) {
      console.log('\n失败的测试:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`- ${r.name}: ${r.error}`);
      });
    }
  }

  // 初始化测试套件
  initializeTests() {
    // 测试文档存储初始化
    this.addTest('文档存储初始化', async () => {
      if (!(this.storage instanceof DocumentStorage)) {
        throw new Error('DocumentStorage未正确初始化');
      }
      return '文档存储初始化成功';
    });

    // 测试文档保存功能
    this.addTest('文档保存功能', async () => {
      const testFile = new File(['Test document content'], 'test.txt', { type: 'text/plain' });
      const result = await this.storage.saveDocument(testFile, {
        description: 'Test document',
        tags: ['test', 'integration']
      });
      
      if (!result.id || !result.filename) {
        throw new Error('文档保存失败');
      }
      
      // 清理测试数据
      await this.storage.deleteDocument(result.id);
      
      return '文档保存功能正常';
    });

    // 测试文档获取功能
    this.addTest('文档获取功能', async () => {
      const testFile = new File(['Another test document'], 'test2.txt', { type: 'text/plain' });
      const savedDoc = await this.storage.saveDocument(testFile, {
        description: 'Another test document'
      });
      
      const retrievedDoc = await this.storage.getDocumentById(savedDoc.id);
      
      if (!retrievedDoc || retrievedDoc.id !== savedDoc.id) {
        throw new Error('文档获取失败');
      }
      
      // 清理测试数据
      await this.storage.deleteDocument(savedDoc.id);
      
      return '文档获取功能正常';
    });

    // 测试文档搜索功能
    this.addTest('文档搜索功能', async () => {
      const testFile = new File(['Search test document'], 'search_test.txt', { type: 'text/plain' });
      const savedDoc = await this.storage.saveDocument(testFile, {
        description: 'This is a search test document'
      });
      
      const searchResults = await this.storage.searchDocuments('search');
      
      if (!searchResults || searchResults.length === 0) {
        throw new Error('文档搜索功能异常');
      }
      
      // 清理测试数据
      await this.storage.deleteDocument(savedDoc.id);
      
      return '文档搜索功能正常';
    });

    // 测试文档删除功能
    this.addTest('文档删除功能', async () => {
      const testFile = new File(['Deletion test document'], 'delete_test.txt', { type: 'text/plain' });
      const savedDoc = await this.storage.saveDocument(testFile, {
        description: 'This will be deleted'
      });
      
      const beforeCount = (await this.storage.getAllDocuments()).length;
      
      await this.storage.deleteDocument(savedDoc.id);
      
      const afterCount = (await this.storage.getAllDocuments()).length;
      
      if (afterCount !== beforeCount - 1) {
        throw new Error('文档删除功能异常');
      }
      
      return '文档删除功能正常';
    });

    // 测试统计功能
    this.addTest('统计功能', async () => {
      const stats = await this.storage.getStatistics();
      
      if (typeof stats !== 'object' || stats.totalDocuments === undefined) {
        throw new Error('统计功能异常');
      }
      
      return '统计功能正常';
    });

    // 测试API端点初始化
    this.addTest('API端点初始化', async () => {
      const api = new DocumentAPIEndpoints();
      if (!api.storage) {
        throw new Error('API端点未正确初始化');
      }
      return 'API端点初始化成功';
    });

    // 测试CLI接口初始化
    this.addTest('CLI接口初始化', async () => {
      const cli = new CLIInterface();
      if (!cli.storage || !cli.api) {
        throw new Error('CLI接口未正确初始化');
      }
      return 'CLI接口初始化成功';
    });

    // 测试格式验证
    this.addTest('格式验证功能', async () => {
      const uploader = new DocumentUploader();
      if (!uploader.isSupportedFormat(new File([], 'test.pdf'))) {
        throw new Error('PDF格式验证失败');
      }
      if (uploader.isSupportedFormat(new File([], 'test.exe'))) {
        throw new Error('不支持格式验证失败');
      }
      return '格式验证功能正常';
    });
  }
}

// 运行测试的辅助函数
window.runDocumentTests = async () => {
  const testSuite = new DocumentManagementTestSuite();
  testSuite.initializeTests();
  return await testSuite.runAllTests();
};

console.log('文档管理系统测试套件已加载。运行 window.runDocumentTests() 来执行测试。');