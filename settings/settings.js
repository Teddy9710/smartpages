// 设置管理
class SettingsManager {
  constructor() {
    this.config = {
      apiKey: '',
      baseUrl: '',
      modelName: 'gpt-3.5-turbo',
      smartDescription: true
    };
    this.init();
  }

  async init() {
    // 加载已保存的配置
    await this.loadConfig();

    // 绑定事件（带DOM验证）
    const btnSave = document.getElementById('btn-save');
    const btnTest = document.getElementById('btn-test');
    const btnToggleKey = document.getElementById('btn-toggle-key');
    const smartDesc = document.getElementById('smart-description');

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

    // 填充表单
    this.populateForm();
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

    const btn = document.getElementById('btn-test');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="icon">⏳</span> 测试中...';

    try {
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
        })
      });

      if (response.ok) {
        this.showTestResult('✅ 连接成功！API配置有效', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        this.showTestResult(`连接失败：${errorData.error?.message || response.statusText}`, 'error');
      }
    } catch (error) {
      this.showTestResult(`连接失败：${error.message}`, 'error');
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
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});
