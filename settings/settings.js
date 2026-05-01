// 设置管理
class SettingsManager {
  constructor() {
    this.config = {
      apiKey: '',
      baseUrl: '',
      modelName: 'gpt-3.5-turbo',
      smartDescription: true
    };
    this.uploader = new DocumentUploader();
    this.api = new DocumentApi();
    this.init();
  }

  async init() {
    // 加载已保存的配置
    await this.loadConfig();

    // 绑定事件（带DOM验证）
    this.bindEvents();
    
    // 初始化文档管理功能
    this.initDocumentManagement();
    
    // 填充表单
    this.populateForm();
  }

  bindEvents() {
    const btnSave = document.getElementById('btn-save');
    const btnTest = document.getElementById('btn-test');
    const btnToggleKey = document.getElementById('btn-toggle-key');
    const smartDesc = document.getElementById('smart-description');
    const browseBtn = document.getElementById('browse-btn');
    const documentFile = document.getElementById('document-file');
    const uploadArea = document.getElementById('upload-area');
    const refreshBtn = document.getElementById('refresh-documents');
    const searchInput = document.getElementById('search-documents');

    if (btnSave) btnSave.addEventListener('click', () => this.saveConfig());
    else console.error('[Settings] btnSave not found');

    if (btnTest) btnTest.addEventListener('click', () => this.testConnection());
    else console.error('[Settings] btnTest not found');

    if (btnToggleKey) btnToggleKey.addEventListener('click', () => this.toggleApiKeyVisibility());
    else console.error('[Settings] btnToggleKey not found');

    if (smartDesc) {
      smartDesc.addEventListener('change', (e) => {
        this.config.smartDescription = e.target.checked;
      });
    } else {
      console.error('[Settings] smartDescription checkbox not found');
    }

    // 文档上传事件绑定
    if (browseBtn) browseBtn.addEventListener('click', () => documentFile.click());
    if (documentFile) documentFile.addEventListener('change', (e) => this.handleFileSelect(e));
    if (uploadArea) {
      uploadArea.addEventListener('click', () => documentFile.click());
      uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
      uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
    }
    
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadDocumentsList());
    if (searchInput) searchInput.addEventListener('input', (e) => this.searchDocuments(e.target.value));
  }

  async initDocumentManagement() {
    // 初始化文档列表
    this.loadDocumentsList();
  }

  async loadConfig() {
    try {
      // 使用 Promise 包装 chrome.storage.local.get
      const result = await new Promise((resolve, reject) => {
        if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'smartDescription'], (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(result);
            }
          });
        } else {
          reject(new Error('chrome.storage is not available'));
        }
      });

      if (result.apiKey) this.config.apiKey = result.apiKey;
      if (result.baseUrl) this.config.baseUrl = result.baseUrl;
      if (result.modelName) this.config.modelName = result.modelName;
      if (result.smartDescription !== undefined) this.config.smartDescription = result.smartDescription;
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  populateForm() {
    // 填充API Key（显示脱敏版本）
    const apiKeyInput = document.getElementById('api-key');
    if (this.config.apiKey) {
      apiKeyInput.value = this.maskApiKey(this.config.apiKey);
      apiKeyInput.dataset.fullKey = this.config.apiKey;
    }

    // 填充其他字段
    document.getElementById('base-url').value = this.config.baseUrl || '';
    document.getElementById('model-name').value = this.config.modelName;
    document.getElementById('smart-description').checked = this.config.smartDescription;
  }

  maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 10) return apiKey;
    return apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4);
  }

  toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('api-key');
    const btn = document.getElementById('btn-toggle-key');

    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btn.textContent = '👁 隐藏';
    } else {
      apiKeyInput.type = 'password';
      btn.textContent = '👁 显示';
    }
  }

  async saveConfig() {
    const apiKeyInput = document.getElementById('api-key');
    const baseUrl = document.getElementById('base-url').value.trim();
    const modelName = document.getElementById('model-name').value.trim() || 'gpt-3.5-turbo';

    // 获取完整的API Key（从数据属性或输入框）
    let apiKey = apiKeyInput.dataset.fullKey || apiKeyInput.value;

    // 如果用户修改了API Key，则使用新值
    if (apiKeyInput.value !== this.maskApiKey(apiKey)) {
      apiKey = apiKeyInput.value.trim();
    }

    // 验证API Key
    if (!apiKey) {
      this.showTestResult('请输入API Key', 'error');
      return;
    }

    // API Key长度验证（支持OpenAI、DeepSeek等）
    if (apiKey.length < 10) {
      this.showTestResult('API Key长度不足，请检查', 'error');
      return;
    }

    // 保存配置
    this.config = {
      apiKey,
      baseUrl,
      modelName,
      smartDescription: document.getElementById('smart-description').checked
    };

    try {
      // 使用 Promise 包装 chrome.storage.local.set
      await new Promise((resolve, reject) => {
        if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            apiKey: this.config.apiKey,
            baseUrl: this.config.baseUrl,
            modelName: this.config.modelName,
            smartDescription: this.config.smartDescription
          }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        } else {
          reject(new Error('chrome.storage is not available'));
        }
      });

      // 更新数据属性
      apiKeyInput.dataset.fullKey = this.config.apiKey;
      apiKeyInput.value = this.maskApiKey(this.config.apiKey);

      this.showTestResult('✅ 配置已保存', 'success');

      // 3秒后清除消息
      setTimeout(() => {
        document.getElementById('test-result').classList.add('hidden');
      }, 3000);
    } catch (error) {
      console.error('Failed to save config:', error);
      this.showTestResult('保存失败：' + error.message, 'error');
    }
  }

  async testConnection() {
    const apiKeyInput = document.getElementById('api-key');
    let baseUrl = document.getElementById('base-url').value.trim() || 'https://api.openai.com/v1';
    const modelName = document.getElementById('model-name').value.trim() || 'gpt-3.5-turbo';

    let apiKey = apiKeyInput.dataset.fullKey || apiKeyInput.value;
    if (apiKeyInput.value !== this.maskApiKey(apiKey)) {
      apiKey = apiKeyInput.value.trim();
    }

    if (!apiKey) {
      this.showTestResult('请先输入API Key', 'error');
      return;
    }

    // 验证URL格式
    try {
      const url = new URL(baseUrl);
      // 确保使用HTTPS或localhost
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        this.showTestResult('URL格式错误：必须以http://或https://开头', 'error');
        return;
      }
    } catch (error) {
      this.showTestResult('URL格式错误：' + error.message, 'error');
      return;
    }

    // 验证API Key格式（基本检查）
    if (apiKey.length < 10) {
      this.showTestResult('API Key长度不足，请检查', 'error');
      return;
    }

    const btn = document.getElementById('btn-test');
    if (!btn) {
      console.error('[Settings] Test button not found');
      return;
    }
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="icon">⏳</span> 测试中...';

    try {
      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          max_tokens: 5
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.showTestResult('✅ 连接成功！API配置有效', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || response.statusText || '未知错误';
        this.showTestResult('连接失败：' + errMsg, 'error');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        this.showTestResult('连接超时（10秒），请检查网络连接或API地址', 'error');
      } else {
        this.showTestResult('连接失败：' + error.message, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  showTestResult(message, type) {
    const resultDiv = document.getElementById('test-result');
    resultDiv.textContent = message;
    resultDiv.className = `test-result ${type}`;
  }

  // 文档管理功能
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.add('dragover');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.remove('dragover');
  }

  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await this.processFile(files[0]);
    }
  }

  handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      this.processFile(files[0]);
    }
  }

  async processFile(file) {
    // 验证文件格式
    if (!this.uploader.isSupportedFormat(file)) {
      this.showUploadResult('不支持的文件格式。支持的格式: ' + this.uploader.supportedFormats.join(', '), 'error');
      return;
    }

    // 文件大小限制（5MB）
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      this.showUploadResult('文件过大，请上传 5MB 以内的文件', 'error');
      return;
    }

    // 显示进度条
    this.showProgress(0, '准备上传...');

    try {
      // 更新进度
      this.showProgress(30, '正在读取文件...');
      
      // 上传文档
      const result = await this.api.handleUploadRequest(file);
      
      if (result.success) {
        this.showProgress(100, '上传完成！');
        this.showUploadResult('文档上传成功！', 'success');
        
        // 刷新文档列表
        setTimeout(() => {
          this.loadDocumentsList();
          this.hideProgress();
        }, 1000);
      } else {
        this.showUploadResult(result.message, 'error');
        this.hideProgress();
      }
    } catch (error) {
      this.showUploadResult(`上传失败: ${error.message}`, 'error');
      this.hideProgress();
    }
  }

  showProgress(percent, text) {
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressContainer.classList.remove('hidden');
    progressBar.style.width = percent + '%';
    progressText.textContent = text || percent + '%';
  }

  hideProgress() {
    const progressContainer = document.getElementById('upload-progress');
    progressContainer.classList.add('hidden');
  }

  showUploadResult(message, type) {
    const resultDiv = document.getElementById('upload-result');
    resultDiv.textContent = message;
    resultDiv.className = `upload-result ${type} ${type === 'success' ? 'success' : 'error'}`;
    resultDiv.classList.remove('hidden');
    
    // 3秒后隐藏结果
    setTimeout(() => {
      resultDiv.classList.add('hidden');
    }, 3000);
  }

  async loadDocumentsList(filter = '') {
    const container = document.getElementById('documents-list');
    container.innerHTML = '<div class="loading-placeholder">正在加载文档列表...</div>';

    try {
      const result = await this.api.getDocumentsList();
      
      if (result.success) {
        const filteredDocs = filter ? 
          result.documents.filter(doc => 
            doc.name.toLowerCase().includes(filter.toLowerCase())
          ) : 
          result.documents;

        if (filteredDocs.length > 0) {
          container.innerHTML = '';
          
          filteredDocs.forEach(doc => {
            const docElement = this.createDocumentItemElement(doc);
            container.appendChild(docElement);
          });
        } else {
          container.innerHTML = '<div class="no-documents">暂无文档</div>';
        }
      } else {
        container.innerHTML = `<div class="no-documents">加载失败: ${result.message}</div>`;
      }
    } catch (error) {
      container.innerHTML = `<div class="no-documents">加载失败: ${error.message}</div>`;
    }
  }

  createDocumentItemElement(doc) {
    const docItem = document.createElement('div');
    docItem.className = 'doc-item';

    const formattedSize = this.formatFileSize(doc.size);
    const formattedTime = new Date(doc.uploadTime).toLocaleString('zh-CN');

    // 安全构建 DOM，防止 XSS
    const docInfo = document.createElement('div');
    docInfo.className = 'doc-info';

    const docName = document.createElement('div');
    docName.className = 'doc-name';
    docName.textContent = doc.name;

    const docMeta = document.createElement('div');
    docMeta.className = 'doc-meta';
    docMeta.innerHTML = `<span>大小: ${formattedSize}</span><span>类型: ${doc.type || 'unknown'}</span><span>上传时间: ${formattedTime}</span>`;

    docInfo.appendChild(docName);
    docInfo.appendChild(docMeta);

    const docActions = document.createElement('div');
    docActions.className = 'doc-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'doc-action-btn view';
    viewBtn.textContent = '👁 查看';
    viewBtn.addEventListener('click', () => this.viewDocument(doc.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'doc-action-btn delete';
    deleteBtn.textContent = '🗑 删除';
    deleteBtn.addEventListener('click', () => this.deleteDocument(doc.id));

    docActions.appendChild(viewBtn);
    docActions.appendChild(deleteBtn);

    docItem.appendChild(docInfo);
    docItem.appendChild(docActions);

    return docItem;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async viewDocument(docId) {
    try {
      const result = await this.api.getDocumentContent(docId);

      if (result.success) {
        const contentWindow = window.open('', '_blank');
        contentWindow.document.open();
        contentWindow.document.write('<!DOCTYPE html><html><head><title></title>');
        contentWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;line-height:1.6}.header{background:#f5f5f5;padding:15px;border-radius:5px;margin-bottom:20px}.content{white-space:pre-wrap}</style>');
        contentWindow.document.write('</head><body>');
        contentWindow.document.write('<div class="header">');
        const h1 = contentWindow.document.createElement('h1');
        h1.textContent = result.document.name;
        contentWindow.document.body.querySelector('.header').appendChild(h1);
        const p = contentWindow.document.createElement('p');
        p.textContent = `大小: ${this.formatFileSize(result.document.size)} | 类型: ${result.document.type} | 上传时间: ${new Date(result.document.uploadTime).toLocaleString('zh-CN')}`;
        contentWindow.document.body.querySelector('.header').appendChild(p);
        contentWindow.document.write('<div class="content"></div></div>');
        const contentDiv = contentWindow.document.querySelector('.content');
        contentDiv.textContent = result.document.content;
        contentWindow.document.write('</body></html>');
        contentWindow.document.close();
      } else {
        alert('查看文档失败: ' + result.message);
      }
    } catch (error) {
      alert('查看文档失败: ' + error.message);
    }
  }

  async deleteDocument(docId) {
    if (confirm('确定要删除这个文档吗？此操作不可恢复。')) {
      try {
        const result = await this.api.deleteDocument(docId);
        
        if (result.success) {
          alert('文档删除成功！');
          this.loadDocumentsList(); // 重新加载列表
        } else {
          alert(`删除失败: ${result.message}`);
        }
      } catch (error) {
        alert(`删除失败: ${error.message}`);
      }
    }
  }

  async searchDocuments(query) {
    await this.loadDocumentsList(query);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
  settingsManager = new SettingsManager();
});