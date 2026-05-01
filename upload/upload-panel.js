// 上传面板管理器
class UploadPanel {
  constructor() {
    this.uploadManager = new DocumentUploadManager();
    this.init();
  }

  init() {
    // 绑定事件
    this.bindEvents();
    
    // 加载上传历史
    this.loadUploadHistory();
  }

  bindEvents() {
    // 拖拽上传
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    // 点击选择文件
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      const files = Array.from(e.dataTransfer.files);
      this.handleFiles(files);
    });

    // 文件选择事件
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      this.handleFiles(files);
    });

    // 上传类型切换
    document.querySelectorAll('input[name="upload-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const githubOptions = document.getElementById('github-options');
        if (e.target.value === 'github') {
          githubOptions.classList.remove('hidden');
        } else {
          githubOptions.classList.add('hidden');
        }
      });
    });

    // 上传按钮
    document.getElementById('upload-btn').addEventListener('click', () => {
      this.startUpload();
    });

    // 完成按钮
    document.getElementById('done-btn').addEventListener('click', () => {
      this.showUploadArea();
    });

    // 关闭按钮
    document.getElementById('close-btn').addEventListener('click', () => {
      window.close();
    });
  }

  handleFiles(files) {
    // 验证文件格式
    const invalidFiles = files.filter(file => !this.uploadManager.isSupportedFormat(file.name));
    
    if (invalidFiles.length > 0) {
      alert(`以下文件格式不支持: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    // 显示选中的文件
    this.displaySelectedFiles(files);
  }

  displaySelectedFiles(files) {
    const dropZone = document.getElementById('drop-zone');
    const dropContent = dropZone.querySelector('.drop-content');
    
    // 清除之前的内容
    dropContent.innerHTML = '';
    
    // 显示选中的文件列表
    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    
    files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'file-icon';
      iconSpan.textContent = this.uploadManager.getFileIcon(file.name.split('.').pop());
      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.textContent = file.name;
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'file-size';
      sizeSpan.textContent = '(' + this.formatFileSize(file.size) + ')';
      fileInfo.appendChild(iconSpan);
      fileInfo.appendChild(nameSpan);
      fileInfo.appendChild(sizeSpan);
      fileItem.appendChild(fileInfo);
      fileList.appendChild(fileItem);
    });
    
    dropContent.appendChild(fileList);
    
    // 添加重新选择按钮
    const reselectBtn = document.createElement('button');
    reselectBtn.className = 'btn-secondary';
    reselectBtn.textContent = '重新选择文件';
    reselectBtn.onclick = () => {
      document.getElementById('file-input').click();
    };
    dropContent.appendChild(reselectBtn);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async startUpload() {
    const fileInput = document.getElementById('file-input');
    const files = Array.from(fileInput.files);
    
    if (files.length === 0) {
      alert('请选择要上传的文件');
      return;
    }

    const uploadType = document.querySelector('input[name="upload-type"]:checked').value;
    const description = document.getElementById('description').value;
    const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

    // 准备上传选项
    const options = {
      description,
      tags,
      progressCallback: this.updateProgress.bind(this),
      batchProgressCallback: this.updateBatchProgress.bind(this)
    };

    try {
      this.showProgress();
      
      let results;
      if (uploadType === 'github') {
        // GitHub上传选项
        const githubOptions = {
          token: document.getElementById('github-token').value,
          repo: document.getElementById('github-repo').value,
          branch: document.getElementById('github-branch').value || 'main',
          owner: document.getElementById('github-repo').value.split('/')[0]
        };

        if (!githubOptions.token || !githubOptions.repo) {
          throw new Error('请填写完整的GitHub配置信息');
        }

        // 逐个上传到GitHub
        results = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            const result = await this.uploadManager.uploadToGitHub(file, githubOptions);
            results.push({...result, filename: file.name});
            
            // 添加到历史记录
            await this.uploadManager.addToHistory({
              type: 'github',
              filename: file.name,
              size: file.size,
              success: true,
              timestamp: Date.now()
            });
          } catch (error) {
            results.push({
              success: false,
              filename: file.name,
              error: error.message
            });
            
            // 添加到历史记录
            await this.uploadManager.addToHistory({
              type: 'github',
              filename: file.name,
              size: file.size,
              success: false,
              error: error.message,
              timestamp: Date.now()
            });
          }
        }
      } else {
        // 本地上传
        results = await this.uploadManager.uploadFiles(files, options);
        
        // 添加到历史记录
        for (const result of results) {
          await this.uploadManager.addToHistory({
            type: 'local',
            filename: result.filename,
            size: result.size,
            success: result.success,
            timestamp: Date.now()
          });
        }
      }

      this.showResults(results);
    } catch (error) {
      console.error('上传失败:', error);
      this.showResults([{ success: false, error: error.message }]);
    }
  }

  updateProgress(progress) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressFill.style.width = progress + '%';
    progressText.textContent = `上传进度: ${progress}%`;
  }

  updateBatchProgress(progress, current, total) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressFill.style.width = progress + '%';
    progressText.textContent = `批量上传: ${current}/${total}, 进度 ${Math.round(progress)}%`;
  }

  showProgress() {
    document.getElementById('upload-area').classList.add('hidden');
    document.getElementById('upload-progress').classList.remove('hidden');
    document.getElementById('upload-results').classList.add('hidden');
  }

  showResults(results) {
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('upload-results').classList.remove('hidden');
    
    const resultsList = document.getElementById('results-list');
    resultsList.innerHTML = '';

    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = `results-item ${result.success ? 'success' : 'error'}`;
      
      const infoDiv = document.createElement('div');
      infoDiv.className = 'results-item-info';
      const nameStrong = document.createElement('strong');
      nameStrong.textContent = result.success ? result.filename : (result.filename || '未知文件');
      infoDiv.appendChild(nameStrong);

      if (result.success) {
        infoDiv.appendChild(document.createTextNode(' - 上传成功'));
        if (result.url) {
          infoDiv.appendChild(document.createElement('br'));
          const small = document.createElement('small');
          const link = document.createElement('a');
          link.href = result.url;
          link.target = '_blank';
          link.textContent = '查看文件';
          small.appendChild(link);
          infoDiv.appendChild(small);
        }
      } else {
        infoDiv.appendChild(document.createTextNode(' - 上传失败'));
        infoDiv.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.textContent = '错误: ' + (result.error || '未知错误');
        infoDiv.appendChild(small);
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'results-item-actions';
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      if (result.success) {
        btn.textContent = '复制链接';
        btn.addEventListener('click', () => navigator.clipboard.writeText(result.url || result.filename));
      } else {
        btn.textContent = '关闭';
        btn.addEventListener('click', () => resultItem.remove());
      }
      actionsDiv.appendChild(btn);

      resultItem.appendChild(infoDiv);
      resultItem.appendChild(actionsDiv);
      resultsList.appendChild(resultItem);
    });
  }

  showUploadArea() {
    document.getElementById('upload-results').classList.add('hidden');
    document.getElementById('upload-area').classList.remove('hidden');
  }

  async loadUploadHistory() {
    try {
      const history = await this.uploadManager.getUploadHistory(20); // 获取最近20条记录
      
      if (history.length > 0) {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';

        // 按时间倒序排列
        const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);

        sortedHistory.forEach(item => {
          const historyItem = document.createElement('div');
          historyItem.className = 'history-item';
          
          const date = new Date(item.timestamp).toLocaleString('zh-CN');

          const nameDiv = document.createElement('div');
          const nameStrong = document.createElement('strong');
          nameStrong.textContent = item.filename;
          nameDiv.appendChild(nameStrong);
          nameDiv.appendChild(document.createTextNode(' (' + this.formatFileSize(item.size) + ')'));

          const metaDiv = document.createElement('div');
          metaDiv.className = 'history-meta';
          metaDiv.innerHTML = `<span class="status ${item.success ? 'success' : 'error'}">${item.success ? '✓ 成功' : '✗ 失败'}</span><span class="date">${date}</span><span class="type">${item.type === 'github' ? 'GitHub' : '本地'}</span>`;

          historyItem.appendChild(nameDiv);
          historyItem.appendChild(metaDiv);
          if (item.error) {
            const errDiv = document.createElement('div');
            errDiv.className = 'error-msg';
            errDiv.textContent = '错误: ' + item.error;
            historyItem.appendChild(errDiv);
          }
          
          historyList.appendChild(historyItem);
        });

        document.getElementById('upload-history').classList.remove('hidden');
      }
    } catch (error) {
      console.error('加载上传历史失败:', error);
    }
  }
}

// 初始化上传面板
document.addEventListener('DOMContentLoaded', () => {
  new UploadPanel();
});