// 文档上传功能使用示例

// 示例1: 基本文件上传
async function basicUploadExample() {
  // 创建上传管理器实例
  const uploadManager = new DocumentUploadManager();
  
  // 创建一个模拟文件对象
  const file = new File(["Hello, this is a test document"], "test.txt", {
    type: "text/plain",
    lastModified: Date.now()
  });
  
  try {
    // 上传文件
    const result = await uploadManager.uploadFile(file, {
      description: "这是一个测试文档",
      tags: ["test", "example", "upload"],
      progressCallback: (progress) => {
        console.log(`上传进度: ${progress}%`);
      }
    });
    
    console.log("上传成功:", result);
    return result;
  } catch (error) {
    console.error("上传失败:", error);
    throw error;
  }
}

// 示例2: 批量上传
async function batchUploadExample() {
  const uploadManager = new DocumentUploadManager();
  
  // 创建多个模拟文件
  const files = [
    new File(["First document content"], "doc1.txt", { type: "text/plain" }),
    new File(["Second document content"], "doc2.txt", { type: "text/plain" }),
    new File(["Third document content"], "doc3.txt", { type: "text/plain" })
  ];
  
  try {
    const results = await uploadManager.uploadFiles(files, {
      description: "批量上传的文档集",
      tags: ["batch", "multiple"],
      batchProgressCallback: (progress, current, total) => {
        console.log(`批量上传进度: ${progress.toFixed(1)}% (${current}/${total})`);
      }
    });
    
    console.log("批量上传结果:", results);
    return results;
  } catch (error) {
    console.error("批量上传失败:", error);
    throw error;
  }
}

// 示例3: 上传到GitHub
async function githubUploadExample() {
  const uploadManager = new DocumentUploadManager();
  
  const file = new File(["# GitHub Upload Test\n\nThis is a test document uploaded to GitHub."], "github-test.md", {
    type: "text/markdown"
  });
  
  const githubOptions = {
    token: "YOUR_GITHUB_TOKEN", // 实际使用时请替换为真实的token
    repo: "username/repository", // 实际使用时请替换为真实的仓库
    branch: "main",
    owner: "username"
  };
  
  try {
    // 注意：这只是一个示例，实际使用时需要提供有效的GitHub token和仓库信息
    const result = await uploadManager.uploadToGitHub(file, githubOptions);
    console.log("GitHub上传结果:", result);
    return result;
  } catch (error) {
    console.error("GitHub上传失败:", error);
    throw error;
  }
}

// 示例4: 文档关联
async function documentAssociationExample() {
  const associator = new DocumentAssociator();
  
  // 模拟文档信息
  const documentInfo = {
    id: "doc_123",
    filename: "example.pdf",
    url: "/documents/doc_123/example.pdf",
    metadata: {
      size: 102400,
      pages: 10,
      title: "Example Document"
    }
  };
  
  const sessionId = "session_456";
  
  try {
    // 关联文档到会话
    const association = await associator.associateDocumentWithSession(documentInfo, sessionId);
    console.log("文档关联成功:", association);
    
    // 获取与会话关联的文档
    const associatedDocs = await associator.getDocumentsForSession(sessionId);
    console.log("会话关联的文档:", associatedDocs);
    
    return association;
  } catch (error) {
    console.error("文档关联失败:", error);
    throw error;
  }
}

// 示例5: 搜索和过滤文档
async function searchDocumentsExample() {
  const api = new APIHandler();
  
  // 模拟上传一些文档
  const mockFiles = [
    { name: "report.pdf", content: "Annual report content" },
    { name: "manual.docx", content: "User manual content" },
    { name: "notes.txt", content: "Meeting notes content" }
  ];
  
  for (const mockFile of mockFiles) {
    const file = new File([mockFile.content], mockFile.name, { type: "text/plain" });
    // 这里只是示例，实际不会真正上传
  }
  
  try {
    // 搜索文档
    const results = await api.searchDocuments("report");
    console.log("搜索结果:", results);
    
    // 按类型过滤
    const pdfResults = await api.searchDocuments("", { type: "application/pdf" });
    console.log("PDF文档:", pdfResults);
    
    return results;
  } catch (error) {
    console.error("搜索失败:", error);
    throw error;
  }
}

// 示例6: 获取统计信息
function statisticsExample() {
  const api = new APIHandler();
  
  // 获取系统统计
  const stats = api.getStatistics();
  console.log("系统统计:", stats);
  
  return stats;
}

// 示例7: 与SidePanel集成
async function sidePanelIntegrationExample() {
  // 创建扩展的SidePanelManager
  const extendedManager = new ExtendedSidePanelManager();
  
  // 模拟会话ID
  const sessionId = "session_789";
  
  try {
    // 尝试关联相关文档
    await extendedManager.associateRelatedDocuments(sessionId);
    console.log("相关文档关联完成");
  } catch (error) {
    console.error("文档关联失败:", error);
  }
}

// 运行示例的辅助函数
async function runExample(exampleFn, exampleName) {
  console.log(`\n--- 运行示例: ${exampleName} ---`);
  try {
    const result = await exampleFn();
    console.log(`${exampleName} 运行成功`);
    return result;
  } catch (error) {
    console.error(`${exampleName} 运行失败:`, error);
  }
}

// 创建示例运行器
window.UploadExamples = {
  basicUpload: () => runExample(basicUploadExample, "基本文件上传"),
  batchUpload: () => runExample(batchUploadExample, "批量上传"),
  githubUpload: () => runExample(githubUploadExample, "GitHub上传"),
  documentAssociation: () => runExample(documentAssociationExample, "文档关联"),
  searchDocuments: () => runExample(searchDocumentsExample, "搜索文档"),
  statistics: () => runExample(statisticsExample, "获取统计信息"),
  sidePanelIntegration: () => runExample(sidePanelIntegrationExample, "SidePanel集成"),
  
  // 运行所有示例
  runAll: async () => {
    console.log("开始运行所有示例...");
    
    await runExample(basicUploadExample, "基本文件上传");
    await runExample(batchUploadExample, "批量上传");
    await runExample(documentAssociationExample, "文档关联");
    await runExample(searchDocumentsExample, "搜索文档");
    await runExample(statisticsExample, "获取统计信息");
    await runExample(sidePanelIntegrationExample, "SidePanel集成");
    
    console.log("\n所有示例运行完成！");
  }
};

console.log("上传功能示例已加载。使用 window.UploadExamples 来运行示例。");