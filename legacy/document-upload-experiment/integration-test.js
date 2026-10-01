// 上传功能集成测试

class UploadIntegrationTest {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  // 添加测试用例
  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  // 运行所有测试
  async runAllTests() {
    console.log('开始运行上传功能集成测试...');
    
    for (const test of this.tests) {
      console.log(`\n运行测试: ${test.name}`);
      try {
        const result = await test.testFn();
        this.results.push({ name: test.name, passed: true, result });
        console.log('✅ 通过');
      } catch (error) {
        this.results.push({ name: test.name, passed: false, error: error.message });
        console.log('❌ 失败:', error.message);
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
    // 测试上传管理器初始化
    this.addTest('上传管理器初始化', async () => {
      const manager = new DocumentUploadManager();
      if (!manager.supportedFormats || manager.supportedFormats.length === 0) {
        throw new Error('上传管理器未正确初始化');
      }
      return '上传管理器初始化成功';
    });

    // 测试格式支持检查
    this.addTest('格式支持检查', async () => {
      const manager = new DocumentUploadManager();
      if (!manager.isSupportedFormat('test.pdf')) {
        throw new Error('PDF格式未被支持');
      }
      if (manager.isSupportedFormat('test.exe')) {
        throw new Error('不支持的格式被错误地接受');
      }
      return '格式支持检查通过';
    });

    // 测试文件图标获取
    this.addTest('文件图标获取', async () => {
      const manager = new DocumentUploadManager();
      const icon = manager.getFileIcon('pdf');
      if (!icon || typeof icon !== 'string') {
        throw new Error('无法获取文件图标');
      }
      return '文件图标获取成功';
    });

    // 测试关联器初始化
    this.addTest('文档关联器初始化', async () => {
      const associator = new DocumentAssociator();
      const stats = await associator.getStatistics();
      if (typeof stats !== 'object') {
        throw new Error('关联器未正确初始化');
      }
      return '文档关联器初始化成功';
    });

    // 测试API处理器
    this.addTest('API处理器初始化', async () => {
      const api = new APIHandler();
      const stats = api.getStatistics();
      if (typeof stats !== 'object') {
        throw new Error('API处理器未正确初始化');
      }
      return 'API处理器初始化成功';
    });

    // 测试路由处理器
    this.addTest('路由处理器功能', async () => {
      const router = new RouteHandler();
      const mockRequest = {
        url: 'http://test/api/stats',
        headers: new Map()
      };
      const result = await router.handleRequest('GET', '/api/stats', mockRequest);
      if (!result.totalDocuments !== undefined) {
        throw new Error('路由处理器未能正确处理请求');
      }
      return '路由处理器功能正常';
    });

    // 测试扩展的SidePanelManager
    this.addTest('扩展的SidePanelManager', async () => {
      if (typeof ExtendedSidePanelManager === 'undefined') {
        throw new Error('ExtendedSidePanelManager未定义');
      }
      const extendedManager = new ExtendedSidePanelManager();
      if (!extendedManager.documentAssociator) {
        throw new Error('扩展的SidePanelManager未正确添加关联器');
      }
      return '扩展的SidePanelManager初始化成功';
    });
  }
}

// 运行测试
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof window.runTests === 'undefined') {
    const tester = new UploadIntegrationTest();
    tester.initializeTests();
    
    // 添加全局测试运行函数
    window.runTests = async () => {
      return await tester.runAllTests();
    };
    
    console.log('上传功能集成测试已准备就绪。运行 window.runTests() 来执行测试。');
  }
});