class UploadPanel {
  constructor() {
    this.uploadManager = new DocumentUploadManager();
    this.language = 'zh-CN';
    this.text = this._getText(this.language);
    this.init();
  }

  async init() {
    await this.applyLanguage();
    this.bindEvents();
    this.loadUploadHistory();
  }

  async applyLanguage() {
    const config = typeof loadConfig === 'function'
      ? await loadConfig().catch(() => ({ appLanguage: 'zh-CN' }))
      : { appLanguage: 'zh-CN' };

    this.language = config.appLanguage === 'en-US' ? 'en-US' : 'zh-CN';
    this.text = this._getText(this.language);
    document.documentElement.lang = this.language;
    document.title = `${this.text.title} - SmartPages`;

    this._setText('#page-title', this.text.title);
    this._setAttr('#close-btn', 'aria-label', this.text.close);
    this._setText('#drop-title', this.text.dropTitle);
    this._setText('#file-types', this.text.fileTypes);
    this._setText('#description-label', this.text.description);
    this._setAttr('#description', 'placeholder', this.text.descriptionPlaceholder);
    this._setText('#tags-label', this.text.tags);
    this._setAttr('#tags', 'placeholder', this.text.tagsPlaceholder);
    this._setText('#local-label', this.text.localStorage);
    this._setText('#github-label', this.text.githubUpload);
    this._setAttr('#github-token', 'placeholder', this.text.githubTokenPlaceholder);
    this._setText('#github-repo-label', this.text.githubRepo);
    this._setAttr('#github-repo', 'placeholder', this.text.githubRepoPlaceholder);
    this._setText('#github-branch-label', this.text.githubBranch);
    this._setText('#upload-btn', this.text.upload);
    this._setText('#progress-text', this.text.ready);
    this._setText('#results-title', this.text.results);
    this._setText('#done-btn', this.text.done);
    this._setText('#history-title', this.text.history);
  }

  _getText(language) {
    return language === 'en-US' ? {
      title: 'Document Upload',
      close: 'Close',
      dropTitle: 'Drag files here or click to choose files',
      fileTypes: 'Supported formats: PDF, DOCX, TXT, MD, HTML, RTF',
      description: 'Document description:',
      descriptionPlaceholder: 'Briefly describe the document...',
      tags: 'Tags (comma-separated):',
      tagsPlaceholder: 'tag1, tag2, tag3',
      localStorage: 'Local storage',
      githubUpload: 'GitHub upload',
      githubTokenPlaceholder: 'Enter a GitHub Personal Access Token',
      githubRepo: 'Repository:',
      githubRepoPlaceholder: 'owner/repository',
      githubBranch: 'Branch:',
      upload: 'Upload Document',
      ready: 'Ready to upload...',
      results: 'Upload Results',
      done: 'Done',
      history: 'Upload History',
      unsupported: 'Unsupported file formats: ',
      reselect: 'Choose Different Files',
      chooseFile: 'Please choose files to upload',
      githubConfigRequired: 'Please fill in the complete GitHub configuration',
      uploadProgress: 'Upload progress: {{progress}}%',
      batchProgress: 'Batch upload: {{current}}/{{total}}, progress {{progress}}%',
      unknownFile: 'Unknown file',
      success: 'Upload successful',
      failed: 'Upload failed',
      viewFile: 'View file',
      error: 'Error: ',
      unknownError: 'Unknown error',
      copyLink: 'Copy Link',
      local: 'Local',
      loadHistoryFailed: 'Failed to load upload history:'
    } : {
      title: '文档上传',
      close: '关闭',
      dropTitle: '拖拽文件到此处或点击选择文件',
      fileTypes: '支持格式: PDF, DOCX, TXT, MD, HTML, RTF',
      description: '文档描述:',
      descriptionPlaceholder: '简要描述文档内容...',
      tags: '标签 (用逗号分隔):',
      tagsPlaceholder: '标签1, 标签2, 标签3',
      localStorage: '本地存储',
      githubUpload: 'GitHub 上传',
      githubTokenPlaceholder: '输入 GitHub Personal Access Token',
      githubRepo: '仓库名:',
      githubRepoPlaceholder: '用户名/仓库名',
      githubBranch: '分支名:',
      upload: '上传文档',
      ready: '准备上传...',
      results: '上传结果',
      done: '完成',
      history: '上传历史',
      unsupported: '以下文件格式不支持: ',
      reselect: '重新选择文件',
      chooseFile: '请选择要上传的文件',
      githubConfigRequired: '请填写完整的 GitHub 配置信息',
      uploadProgress: '上传进度: {{progress}}%',
      batchProgress: '批量上传: {{current}}/{{total}}, 进度 {{progress}}%',
      unknownFile: '未知文件',
      success: '上传成功',
      failed: '上传失败',
      viewFile: '查看文件',
      error: '错误: ',
      unknownError: '未知错误',
      copyLink: '复制链接',
      local: '本地',
      loadHistoryFailed: '加载上传历史失败:'
    };
  }

  _t(key, replacements = {}) {
    let value = this.text[key] || key;
    Object.entries(replacements).forEach(([name, replacement]) => {
      value = value.replaceAll(`{{${name}}}`, String(replacement ?? ''));
    });
    return value;
  }

  _setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  _setAttr(selector, attr, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  bindEvents() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

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
      this.handleFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(Array.from(e.target.files));
    });

    document.querySelectorAll('input[name="upload-type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.getElementById('github-options')?.classList.toggle('hidden', e.target.value !== 'github');
      });
    });

    document.getElementById('upload-btn').addEventListener('click', () => this.startUpload());
    document.getElementById('done-btn').addEventListener('click', () => this.showUploadArea());
    document.getElementById('close-btn').addEventListener('click', () => window.close());
  }

  handleFiles(files) {
    const invalidFiles = files.filter(file => !this.uploadManager.isSupportedFormat(file.name));

    if (invalidFiles.length > 0) {
      alert(this._t('unsupported') + invalidFiles.map(f => f.name).join(', '));
      return;
    }

    this.displaySelectedFiles(files);
  }

  displaySelectedFiles(files) {
    const dropZone = document.getElementById('drop-zone');
    const dropContent = dropZone.querySelector('.drop-content');
    dropContent.replaceChildren();

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
      fileInfo.append(iconSpan, nameSpan, sizeSpan);
      fileItem.appendChild(fileInfo);
      fileList.appendChild(fileItem);
    });

    const reselectBtn = document.createElement('button');
    reselectBtn.className = 'btn-secondary';
    reselectBtn.textContent = this._t('reselect');
    reselectBtn.addEventListener('click', () => document.getElementById('file-input').click());
    dropContent.append(fileList, reselectBtn);
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
      alert(this._t('chooseFile'));
      return;
    }

    const uploadType = document.querySelector('input[name="upload-type"]:checked').value;
    const description = document.getElementById('description').value;
    const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(Boolean);

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
        const repo = document.getElementById('github-repo').value;
        const githubOptions = {
          token: document.getElementById('github-token').value,
          repo,
          branch: document.getElementById('github-branch').value || 'main',
          owner: repo.split('/')[0]
        };

        if (!githubOptions.token || !githubOptions.repo) {
          throw new Error(this._t('githubConfigRequired'));
        }

        results = [];
        for (const file of files) {
          try {
            const result = await this.uploadManager.uploadToGitHub(file, githubOptions);
            results.push({ ...result, filename: file.name });
            await this.uploadManager.addToHistory({
              type: 'github',
              filename: file.name,
              size: file.size,
              success: true,
              timestamp: Date.now()
            });
          } catch (error) {
            results.push({ success: false, filename: file.name, error: error.message });
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
        results = await this.uploadManager.uploadFiles(files, options);
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
      console.error(this._t('failed'), error);
      this.showResults([{ success: false, error: error.message }]);
    } finally {
      if (uploadType === 'github') {
        const tokenInput = document.getElementById('github-token');
        if (tokenInput) tokenInput.value = '';
      }
    }
  }

  updateProgress(progress) {
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = this._t('uploadProgress', { progress });
  }

  updateBatchProgress(progress, current, total) {
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = this._t('batchProgress', {
      current,
      total,
      progress: Math.round(progress)
    });
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
    resultsList.replaceChildren();

    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = `results-item ${result.success ? 'success' : 'error'}`;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'results-item-info';
      const nameStrong = document.createElement('strong');
      nameStrong.textContent = result.success ? result.filename : (result.filename || this._t('unknownFile'));
      infoDiv.appendChild(nameStrong);

      if (result.success) {
        infoDiv.appendChild(document.createTextNode(' - ' + this._t('success')));
        if (result.url) {
          infoDiv.appendChild(document.createElement('br'));
          const small = document.createElement('small');
          const link = document.createElement('a');
          link.href = result.url;
          link.target = '_blank';
          link.textContent = this._t('viewFile');
          small.appendChild(link);
          infoDiv.appendChild(small);
        }
      } else {
        infoDiv.appendChild(document.createTextNode(' - ' + this._t('failed')));
        infoDiv.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.textContent = this._t('error') + (result.error || this._t('unknownError'));
        infoDiv.appendChild(small);
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'results-item-actions';
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      if (result.success) {
        btn.textContent = this._t('copyLink');
        btn.addEventListener('click', () => navigator.clipboard.writeText(result.url || result.filename));
      } else {
        btn.textContent = this._t('close');
        btn.addEventListener('click', () => resultItem.remove());
      }
      actionsDiv.appendChild(btn);

      resultItem.append(infoDiv, actionsDiv);
      resultsList.appendChild(resultItem);
    });
  }

  showUploadArea() {
    document.getElementById('upload-results').classList.add('hidden');
    document.getElementById('upload-area').classList.remove('hidden');
  }

  async loadUploadHistory() {
    try {
      const history = await this.uploadManager.getUploadHistory(20);

      if (history.length > 0) {
        const historyList = document.getElementById('history-list');
        historyList.replaceChildren();

        const sortedHistory = history.sort((a, b) => b.timestamp - a.timestamp);

        sortedHistory.forEach(item => {
          const historyItem = document.createElement('div');
          historyItem.className = 'history-item';

          const date = new Date(item.timestamp).toLocaleString(this.language);

          const nameDiv = document.createElement('div');
          const nameStrong = document.createElement('strong');
          nameStrong.textContent = item.filename;
          nameDiv.appendChild(nameStrong);
          nameDiv.appendChild(document.createTextNode(' (' + this.formatFileSize(item.size) + ')'));

          const metaDiv = document.createElement('div');
          metaDiv.className = 'history-meta';
          const statusSpan = document.createElement('span');
          statusSpan.className = `status ${item.success ? 'success' : 'error'}`;
          statusSpan.textContent = item.success ? '✓ ' + this._t('success') : '✗ ' + this._t('failed');
          const dateSpan = document.createElement('span');
          dateSpan.className = 'date';
          dateSpan.textContent = date;
          const typeSpan = document.createElement('span');
          typeSpan.className = 'type';
          typeSpan.textContent = item.type === 'github' ? 'GitHub' : this._t('local');
          metaDiv.append(statusSpan, dateSpan, typeSpan);

          historyItem.append(nameDiv, metaDiv);
          if (item.error) {
            const errDiv = document.createElement('div');
            errDiv.className = 'error-msg';
            errDiv.textContent = this._t('error') + item.error;
            historyItem.appendChild(errDiv);
          }

          historyList.appendChild(historyItem);
        });

        document.getElementById('upload-history').classList.remove('hidden');
      }
    } catch (error) {
      console.error(this._t('loadHistoryFailed'), error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new UploadPanel();
});
