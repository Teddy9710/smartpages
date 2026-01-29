// 命令行接口模拟器
class CLIInterface {
  constructor() {
    this.storage = new DocumentStorage();
    this.api = new DocumentAPIEndpoints();
  }

  // 解析命令行参数
  parseArgs(args) {
    const parsed = {
      command: args[0] || 'help',
      options: {},
      params: []
    };

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        parsed.options[key] = value || true;
      } else if (arg.startsWith('-')) {
        const key = arg.substring(1);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.options[key] = nextArg;
          i++; // 跳过下一个参数，因为它已经被作为值使用
        } else {
          parsed.options[key] = true;
        }
      } else {
        parsed.params.push(arg);
      }
    }

    return parsed;
  }

  // 执行命令
  async executeCommand(args) {
    const parsed = this.parseArgs(args);
    
    switch (parsed.command.toLowerCase()) {
      case 'upload':
        return await this.uploadCommand(parsed);
      case 'list':
      case 'ls':
        return await this.listCommand(parsed);
      case 'search':
        return await this.searchCommand(parsed);
      case 'delete':
      case 'rm':
        return await this.deleteCommand(parsed);
      case 'get':
        return await this.getCommand(parsed);
      case 'stats':
        return await this.statsCommand(parsed);
      case 'export':
        return await this.exportCommand(parsed);
      case 'help':
      case '--help':
      case '-h':
        return this.helpCommand();
      default:
        return `未知命令: ${parsed.command}. 输入 'help' 查看可用命令。`;
    }
  }

  // 上传命令
  async uploadCommand(parsed) {
    if (parsed.params.length === 0) {
      return '错误: 请指定要上传的文件路径。用法: upload <file_path> [--description="..."] [--tags="tag1,tag2"]';
    }

    try {
      // 在浏览器环境中，我们不能直接访问文件系统
      // 这里我们模拟上传过程
      const filePath = parsed.params[0];
      const fileName = filePath.split('/').pop().split('\\').pop();
      
      // 创建一个模拟文件对象
      const file = new File(['模拟文件内容'], fileName, { type: 'text/plain' });
      
      const options = {
        description: parsed.options.description || '',
        tags: parsed.options.tags ? parsed.options.tags.split(',') : []
      };

      const documentInfo = await this.storage.saveDocument(file, options);
      
      return `✅ 文档上传成功!\nID: ${documentInfo.id}\n文件名: ${documentInfo.filename}\n大小: ${this.formatFileSize(documentInfo.size)}`;
    } catch (error) {
      return `❌ 上传失败: ${error.message}`;
    }
  }

  // 列出文档命令
  async listCommand(parsed) {
    try {
      const documents = await this.storage.getAllDocuments();
      const limit = parseInt(parsed.options.limit) || 10;
      const offset = parseInt(parsed.options.offset) || 0;
      
      const paginatedDocs = documents.slice(offset, offset + limit);
      
      if (paginatedDocs.length === 0) {
        return '没有找到文档。';
      }

      let output = `找到 ${documents.length} 个文档 (显示 ${offset + 1}-${Math.min(offset + limit, documents.length)}):\n\n`;
      output += paginatedDocs.map(doc => 
        `• ${doc.id.substring(0, 8)}... ${doc.filename} (${this.formatFileSize(doc.size)}) - ${new Date(doc.uploadTime).toLocaleDateString()}`
      ).join('\n');

      return output;
    } catch (error) {
      return `❌ 列出文档失败: ${error.message}`;
    }
  }

  // 搜索文档命令
  async searchCommand(parsed) {
    if (parsed.params.length === 0) {
      return '错误: 请指定搜索关键词。用法: search <keyword> [--type="..."] [--extension="..."]';
    }

    try {
      const query = parsed.params[0];
      const filters = {
        type: parsed.options.type || '',
        extension: parsed.options.extension || ''
      };

      const results = await this.storage.searchDocuments(query, filters);

      if (results.length === 0) {
        return `没有找到匹配 "${query}" 的文档。`;
      }

      let output = `找到 ${results.length} 个匹配 "${query}" 的文档:\n\n`;
      output += results.map(doc => 
        `• ${doc.id.substring(0, 8)}... ${doc.filename} (${this.formatFileSize(doc.size)}) - ${new Date(doc.uploadTime).toLocaleDateString()}`
      ).join('\n');

      return output;
    } catch (error) {
      return `❌ 搜索失败: ${error.message}`;
    }
  }

  // 删除文档命令
  async deleteCommand(parsed) {
    if (parsed.params.length === 0) {
      return '错误: 请指定文档ID。用法: delete <document_id>';
    }

    const documentId = parsed.params[0];

    try {
      await this.storage.deleteDocument(documentId);
      return `✅ 文档 ${documentId} 已删除。`;
    } catch (error) {
      return `❌ 删除失败: ${error.message}`;
    }
  }

  // 获取文档命令
  async getCommand(parsed) {
    if (parsed.params.length === 0) {
      return '错误: 请指定文档ID。用法: get <document_id>';
    }

    const documentId = parsed.params[0];

    try {
      const document = await this.storage.getDocumentById(documentId);

      if (!document) {
        return `❌ 文档 ${documentId} 不存在。`;
      }

      return `文档信息:\n` +
             `ID: ${document.id}\n` +
             `文件名: ${document.filename}\n` +
             `大小: ${this.formatFileSize(document.size)}\n` +
             `类型: ${document.type}\n` +
             `扩展名: ${document.extension}\n` +
             `上传时间: ${new Date(document.uploadTime).toLocaleString()}\n` +
             `描述: ${document.description || '无'}\n` +
             `标签: ${(document.tags || []).join(', ') || '无'}`;
    } catch (error) {
      return `❌ 获取文档失败: ${error.message}`;
    }
  }

  // 统计命令
  async statsCommand(parsed) {
    try {
      const stats = await this.storage.getStatistics();

      return `文档统计:\n` +
             `总文档数: ${stats.totalDocuments}\n` +
             `总大小: ${this.formatFileSize(stats.totalSize)}\n` +
             `按类型分布: ${JSON.stringify(stats.byType)}\n` +
             `按扩展名分布: ${JSON.stringify(stats.byExtension)}`;
    } catch (error) {
      return `❌ 获取统计信息失败: ${error.message}`;
    }
  }

  // 导出命令
  async exportCommand(parsed) {
    if (parsed.params.length === 0) {
      return '错误: 请指定文档ID。用法: export <document_id> [--format="original|text|markdown"]';
    }

    const documentId = parsed.params[0];
    const format = parsed.options.format || 'original';

    try {
      // 这会触发浏览器的下载
      await this.storage.exportDocument(documentId, format);
      return `✅ 文档导出已开始...`;
    } catch (error) {
      return `❌ 导出失败: ${error.message}`;
    }
  }

  // 帮助命令
  helpCommand() {
    return `
Smart Page Scribe 文档管理命令行工具

使用方法:
  scribe <command> [options] [parameters]

可用命令:
  upload <file_path>     上传文档
    --description="..."  指定文档描述
    --tags="tag1,tag2"   指定标签

  list, ls              列出所有文档
    --limit=N           限制显示数量 (默认10)
    --offset=N          跳过的文档数量 (默认0)

  search <keyword>      搜索文档
    --type="..."        按类型过滤
    --extension="..."   按扩展名过滤

  get <document_id>     获取文档详情

  delete, rm <document_id>  删除文档

  export <document_id>  导出文档
    --format="original|text|markdown"  指定导出格式

  stats                 显示统计信息

  help, --help, -h      显示此帮助信息

示例:
  scribe upload ./mydoc.pdf --description="我的文档" --tags="important,work"
  scribe list --limit=20
  scribe search "report" --type="application/pdf"
  scribe get abc123def456
  scribe delete abc123def456
    `;
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 在浏览器控制台中使用CLI的辅助函数
function initCLI() {
  const cli = new CLIInterface();
  
  // 创建全局函数以便在控制台中使用
  window.scribe = async function(...args) {
    const result = await cli.executeCommand(args);
    console.log(result);
    return result;
  };
  
  console.log('Smart Page Scribe CLI 已准备就绪!');
  console.log('在控制台中使用 scribe <command> 来管理文档。');
  console.log('输入 scribe help 查看可用命令。');
}

// 自动初始化CLI（可选）
// initCLI();

// 全局实例
window.CLIInterface = CLIInterface;
window.initCLI = initCLI;