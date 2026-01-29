// 文档上传器
class DocumentUploader {
  constructor() {
    this.supportedFormats = ['pdf', 'docx', 'txt', 'md', 'html', 'rtf', 'xlsx', 'pptx'];
  }

  // 检查文件格式是否支持
  isSupportedFormat(file) {
    const extension = file.name.toLowerCase().split('.').pop();
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
      'rtf': '📜',
      'xlsx': '📊',
      'pptx': '📽️'
    };
    return iconMap[extension] || '📁';
  }

  // 读取文件内容
  async readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      // 根据文件类型选择读取方式
      if (file.type.startsWith('text/') || 
          file.name.toLowerCase().endsWith('.txt') || 
          file.name.toLowerCase().endsWith('.md') || 
          file.name.toLowerCase().endsWith('.html')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }
}