// 侧边栏管理器
class SidePanelManager {
  constructor() {
    this.currentState = 'empty'; // empty, loading, selector, editor, error, documents
    this.session = null;
    this.config = null;
    this.documentUploader = new DocumentUploader();
    this.documentApi = new DocumentApi();
    this.documentLinker = new DocumentLinker();
    
    this.init();
  }

  async init() {
    this.bindEvents();
    this.checkForPendingSession();
  }

  bindEvents() {
    // 基础功能事件
    document.getElementById('btn-new')?.addEventListener('click', () => this.newDocument());
    document.getElementById('btn-start-here')?.addEventListener('click', () => this.startRecordingHere());
    document.getElementById('btn-generate')?.addEventListener('click', () => this.generateDocument());
    document.getElementById('btn-retry')?.addEventListener('click', () => this.retry());
    document.getElementById('btn-preview')?.addEventListener('click', () => this.switchToPreview());
    document.getElementById('btn-edit')?.addEventListener('click', () => this.switchToEdit());
    document.getElementById('btn-copy')?.addEventListener('click', () => this.copyDocument());
    document.getElementById('btn-download')?.addEventListener('click', () => this.downloadDocument());

    // 文档管理事件
    document.getElementById('btn-documents')?.addEventListener('click', () => this.showDocumentsPanel());
    document.getElementById('btn-close-documents')?.addEventListener('click', () => this.hideDocumentsPanel());
    this.bindDocumentEvents();
  }

  bindDocumentEvents() {
    // 侧边栏文档上传事件
    const browseBtn = document.getElementById('sidepanel-browse-btn');
    const documentFile = document.getElementById('sidepanel-document-file');
    const uploadArea = document.getElementById('sidepanel-upload-area');
    const refreshBtn = document.getElementById('sidepanel-refresh-documents');
    const searchInput = document.getElementById('sidepanel-search-documents');

    if (browseBtn) browseBtn.addEventListener('click', () => documentFile.click());
    if (documentFile) documentFile.addEventListener('change', (e) => this.handleFileSelect(e, 'sidepanel'));
    if (uploadArea) {
      uploadArea.addEventListener('click', () => documentFile.click());
      uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e, 'sidepanel'));
      uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e, 'sidepanel'));
      uploadArea.addEventListener('drop', (e) => this.handleDrop(e, 'sidepanel'));
    }
    
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadDocumentsList('sidepanel'));
    if (searchInput) searchInput.addEventListener('input', (e) => this.searchDocuments(e.target.value, 'sidepanel'));
  }

  async checkForPendingSession() {
    try {
      // 尝试获取当前录制状态
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RECORDING_STATE'
      });

      if (response.state && response.state.state === 'stopped' && response.session) {
        this.session = response.session;
        this.showDescriptionSelector();
      } else if (response.state && response.state.state === 'recording') {
        // 如果正在录制，显示空状态等待停止
        this.showEmptyState();
      } else {
        this.showEmptyState();
      }
    } catch (error) {
      console.error('Failed to get recording state:', error);
      this.showEmptyState();
    }
  }

  setState(newState) {
    // 隐藏所有状态视图
    document.querySelectorAll('.state-view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });

    // 显示新状态视图
    const newStateElement = document.getElementById(`${newState}-state`);
    if (newStateElement) {
      newStateElement.classList.remove('hidden');
      newStateElement.classList.add('active');
    }

    this.currentState = newState;
  }

  showLoadingState(text = '正在处理...') {
    document.getElementById('loading-text').textContent = text;
    this.setState('loading');
  }

  showDescriptionSelector() {
    this.setState('description');
  }

  showEditor() {
    this.setState('document-editor');
  }

  showEmptyState() {
    this.setState('empty');
  }

  showErrorState(message) {
    document.getElementById('error-message').textContent = message;
    this.setState('error');
  }

  showDocumentsPanel() {
    this.setState('documents');
    this.loadDocumentsList('sidepanel');
  }

  hideDocumentsPanel() {
    this.showEmptyState();
  }

  newDocument() {
    this.session = null;
    this.showEmptyState();
  }

  async startRecordingHere() {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab) {
        throw new Error('无法获取当前标签页');
      }

      // 启动录制
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // 通知popup更新状态
      chrome.runtime.sendMessage({
        type: 'START_RECORDING_SUCCESS',
        tabId: tab.id
      });

      // 关闭侧边栏
      window.close();
    } catch (error) {
      alert('启动录制失败: ' + error.message);
    }
  }

  async generateDocument() {
    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';

      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description').value.trim();
        if (!description) {
          alert('请输入自定义描述');
          return;
        }
      } else {
        description = selectedValue;
      }

      this.showLoadingState('正在生成文档...');

      // 加载配置
      const config = await this.loadConfig();
      if (!config.apiKey) {
        throw new Error('请先在设置中配置API密钥');
      }

      // 构建提示词
      const prompt = this.buildGenerationPrompt(description);

      // 调用API
      const response = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API调用失败: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();

      // 显示编辑器
      this.showEditor();

      // 设置内容
      document.getElementById('markdown-editor').value = content;
      this.updatePreview(content);

    } catch (error) {
      console.error('生成文档失败:', error);
      this.showErrorState(error.message || '生成文档失败，请重试');
    }
  }

  buildGenerationPrompt(description) {
    let stepsText = '';
    if (this.session?.steps && this.session.steps.length > 0) {
      stepsText = this.session.steps.map((step, index) => 
        `${index + 1}. ${step.type}: ${step.action || step.element || '未知操作'}`
      ).join('\n');
    }

    return `根据以下网页操作步骤生成一份详细的文档：

${stepsText}

任务描述：${description}

请生成一份结构清晰、内容详实的Markdown格式文档，包含：
1. 操作概述
2. 详细步骤说明
3. 注意事项
4. 可能遇到的问题及解决方案

要求：
- 使用标准Markdown格式
- 结构清晰，层次分明
- 语言简洁明了
- 适合非技术人员阅读`;
  }

  async loadConfig() {
    const result = await chrome.storage.local.get([
      'apiKey', 
      'baseUrl', 
      'modelName', 
      'smartDescription'
    ]);

    return {
      apiKey: result.apiKey || '',
      baseUrl: result.baseUrl || 'https://api.openai.com/v1',
      modelName: result.modelName || 'gpt-3.5-turbo',
      smartDescription: result.smartDescription !== undefined ? result.smartDescription : true
    };
  }

  updatePreview(markdown) {
    // 动态加载marked.js（如果尚未加载）
    if (typeof marked === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      document.head.appendChild(script);
      
      script.onload = () => {
        this.renderMarkdown(markdown);
      };
    } else {
      this.renderMarkdown(markdown);
    }
  }

  renderMarkdown(markdown) {
    const previewDiv = document.getElementById('markdown-preview');
    if (previewDiv && typeof marked !== 'undefined') {
      previewDiv.innerHTML = marked.parse(markdown);
    }
  }

  switchToPreview() {
    document.getElementById('preview-pane').classList.add('active');
    document.getElementById('edit-pane').classList.remove('active');
    
    document.getElementById('btn-preview').classList.add('active');
    document.getElementById('btn-edit').classList.remove('active');
    
    // 更新预览内容
    const editorContent = document.getElementById('markdown-editor').value;
    this.updatePreview(editorContent);
  }

  switchToEdit() {
    document.getElementById('preview-pane').classList.remove('active');
    document.getElementById('edit-pane').classList.add('active');
    
    document.getElementById('btn-preview').classList.remove('active');
    document.getElementById('btn-edit').classList.add('active');
  }

  copyDocument() {
    const content = document.getElementById('markdown-editor').value;
    navigator.clipboard.writeText(content).then(() => {
      alert('文档已复制到剪贴板！');
    }).catch(err => {
      console.error('复制失败:', err);
      alert('复制失败，请手动选择文本');
    });
  }

  downloadDocument() {
    const content = document.getElementById('markdown-editor').value;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `document_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  retry() {
    if (this.session) {
      this.showDescriptionSelector();
    } else {
      this.showEmptyState();
    }
  }

  // 文档管理功能
  handleDragOver(e, source = 'settings') {
    e.preventDefault();
    e.stopPropagation();
    const uploadArea = document.getElementById(`${source}-upload-area`);
    uploadArea.classList.add('dragover');
  }

  handleDragLeave(e, source = 'settings') {
    e.preventDefault();
    e.stopPropagation();
    const uploadArea = document.getElementById(`${source}-upload-area`);
    uploadArea.classList.remove('dragover');
  }

  async handleDrop(e, source = 'settings') {
    e.preventDefault();
    e.stopPropagation();
    
    const uploadArea = document.getElementById(`${source}-upload-area`);
    uploadArea.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await this.processFile(files[0], source);
    }
  }

  handleFileSelect(e, source = 'settings') {
    const files = e.target.files;
    if (files.length > 0) {
      this.processFile(files[0], source);
    }
  }

  async processFile(file, source = 'settings') {
    // 验证文件格式
    if (!this.documentUploader.isSupportedFormat(file)) {
      this.showUploadResult(`不支持的文件格式。支持的格式: ${this.documentUploader.supportedFormats.join(', ')}`, 'error', source);
      return;
    }

    // 显示进度条
    this.showProgress(0, '准备上传...', source);

    try {
      // 更新进度
      this.showProgress(30, '正在读取文件...', source);
      
      // 上传文档
      const result = await this.documentApi.handleUploadRequest(file);
      
      if (result.success) {
        this.showProgress(100, '上传完成！', source);
        this.showUploadResult('文档上传成功！', 'success', source);
        
        // 刷新文档列表
        setTimeout(() => {
          this.loadDocumentsList(source);
          this.hideProgress(source);
        }, 1000);
      } else {
        this.showUploadResult(result.message, 'error', source);
        this.hideProgress(source);
      }
    } catch (error) {
      this.showUploadResult(`上传失败: ${error.message}`, 'error', source);
      this.hideProgress(source);
    }
  }

  showProgress(percent, text, source = 'settings') {
    const progressContainer = document.getElementById(`${source}-upload-progress`);
    const progressBar = document.getElementById(`${source}-progress-fill`);
    const progressText = document.getElementById(`${source}-progress-text`);
    
    if (progressContainer && progressBar && progressText) {
      progressContainer.classList.remove('hidden');
      progressBar.style.width = percent + '%';
      progressText.textContent = text || percent + '%';
    }
  }

  hideProgress(source = 'settings') {
    const progressContainer = document.getElementById(`${source}-upload-progress`);
    if (progressContainer) {
      progressContainer.classList.add('hidden');
    }
  }

  showUploadResult(message, type, source = 'settings') {
    const resultDiv = document.getElementById(`${source}-upload-result`);
    if (resultDiv) {
      resultDiv.textContent = message;
      resultDiv.className = `upload-result ${type} ${type === 'success' ? 'success' : 'error'}`;
      resultDiv.classList.remove('hidden');
      
      // 3秒后隐藏结果
      setTimeout(() => {
        resultDiv.classList.add('hidden');
      }, 3000);
    }
  }

  async loadDocumentsList(source = 'settings') {
    const container = document.getElementById(`${source}-documents-list`);
    if (container) {
      container.innerHTML = '<div class="loading-placeholder">正在加载文档列表...</div>';

      try {
        const result = await this.documentApi.getDocumentsList();
        
        if (result.success) {
          if (result.documents.length > 0) {
            container.innerHTML = '';
            
            result.documents.forEach(doc => {
              const docElement = this.createDocumentItemElement(doc, source);
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
  }

  createDocumentItemElement(doc, source = 'settings') {
    const docItem = document.createElement('div');
    docItem.className = 'doc-item';
    
    // 格式化文件大小
    const formattedSize = this.formatFileSize(doc.size);
    
    // 格式化时间
    const formattedTime = new Date(doc.uploadTime).toLocaleString('zh-CN');
    
    docItem.innerHTML = `
      <div class="doc-info">
        <div class="doc-name">${doc.name}</div>
        <div class="doc-meta">
          <span>大小: ${formattedSize}</span>
          <span>类型: ${doc.type || 'unknown'}</span>
          <span>上传时间: ${formattedTime}</span>
        </div>
      </div>
      <div class="doc-actions">
        <button class="doc-action-btn view" onclick="sidePanelManager.viewDocument('${doc.id}', '${source}')">👁 查看</button>
        <button class="doc-action-btn delete" onclick="sidePanelManager.deleteDocument('${doc.id}', '${source}')">🗑 删除</button>
      </div>
    `;
    
    return docItem;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async viewDocument(docId, source = 'settings') {
    try {
      const result = await this.documentApi.getDocumentContent(docId);
      
      if (result.success) {
        // 在新标签页中打开文档内容
        const contentWindow = window.open('', '_blank');
        contentWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${result.document.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
              .header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
              .content { white-space: pre-wrap; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${result.document.name}</h1>
              <p>大小: ${this.formatFileSize(result.document.size)} | 类型: ${result.document.type} | 上传时间: ${new Date(result.document.uploadTime).toLocaleString('zh-CN')}</p>
            </div>
            <div class="content">${this.escapeHtml(result.document.content)}</div>
          </body>
          </html>
        `);
      } else {
        alert(`查看文档失败: ${result.message}`);
      }
    } catch (error) {
      alert(`查看文档失败: ${error.message}`);
    }
  }

  async deleteDocument(docId, source = 'settings') {
    if (confirm('确定要删除这个文档吗？此操作不可恢复。')) {
      try {
        const result = await this.documentApi.deleteDocument(docId);
        
        if (result.success) {
          alert('文档删除成功！');
          this.loadDocumentsList(source); // 重新加载列表
        } else {
          alert(`删除失败: ${result.message}`);
        }
      } catch (error) {
        alert(`删除失败: ${error.message}`);
      }
    }
  }

  async searchDocuments(query, source = 'settings') {
    const container = document.getElementById(`${source}-documents-list`);
    if (container) {
      container.innerHTML = '<div class="loading-placeholder">正在搜索文档...</div>';

      try {
        const result = await this.documentApi.searchDocuments(query);
        
        if (result.success) {
          if (result.documents.length > 0) {
            container.innerHTML = '';
            
            result.documents.forEach(doc => {
              const docElement = this.createDocumentItemElement(doc, source);
              container.appendChild(docElement);
            });
          } else {
            container.innerHTML = '<div class="no-documents">未找到匹配的文档</div>';
          }
        } else {
          container.innerHTML = `<div class="no-documents">搜索失败: ${result.message}</div>`;
        }
      } catch (error) {
        container.innerHTML = `<div class="no-documents">搜索失败: ${error.message}</div>`;
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
let sidePanelManager;
document.addEventListener('DOMContentLoaded', () => {
  sidePanelManager = new SidePanelManager();
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_AI_ANALYSIS') {
    if (sidePanelManager) {
      sidePanelManager.session = message.session;
      sidePanelManager.config = message.config;
      sidePanelManager.showDescriptionSelector();
    }
  }
});