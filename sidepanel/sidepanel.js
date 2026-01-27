// Sidepanel管理
class SidePanelManager {
  constructor() {
    this.currentSession = null;
    this.config = null;
    this.generatedDescriptions = [];
    this.selectedDescription = null;
    this.generatedDocument = null;
    this.isEditMode = false;

    this.init();
  }

  async init() {
    // 绑定按钮事件（带DOM验证）
    const buttons = {
      'btn-new': () => this.createNew(),
      'btn-start-here': () => this.startRecording(),
      'btn-generate': () => this.generateDocument(),
      'btn-retry': () => this.retry(),
      'btn-preview': () => this.switchMode(false),
      'btn-edit': () => this.switchMode(true),
      'btn-copy': () => this.copyToClipboard(),
      'btn-download': () => this.downloadFile()
    };

    for (const [id, handler] of Object.entries(buttons)) {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', handler);
      } else {
        console.error(`[SidePanel] Button with id '${id}' not found in DOM`);
      }
    }

    // 绑定markdown编辑器事件
    const editor = document.getElementById('markdown-editor');
    if (editor) {
      editor.addEventListener('input', (e) => {
        this.generatedDocument = e.target.value;
        this.updatePreview();
      });
    } else {
      console.error("[SidePanel] Markdown editor not found in DOM");
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[SidePanel] Received message:', message.type, message);

      if (message.type === 'START_AI_ANALYSIS') {
        // 异步处理，保持消息通道开启
        (async () => {
          try {
            await this.handleAIAnalysis(message.session, message.config);
            sendResponse({ success: true });
          } catch (error) {
            console.error('[SidePanel] Failed to handle AI analysis:', error);
            sendResponse({ error: error.message });
          }
        })();
        return true; // 保持通道开启以支持异步响应
      }

      // 对于其他消息类型，立即返回
      sendResponse({ success: true });
      return false;
    });

    // 检查是否有已完成的会话
    await this.checkExistingSession();
  }

  async checkExistingSession() {
    try {
      console.log('[SidePanel] Checking existing session...');

      // 先获取录制状态
      const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
      console.log('[SidePanel] Recording state:', stateResponse);

      if (stateResponse && stateResponse.state === 'stopped' && stateResponse.session) {
        console.log('[SidePanel] Found stopped session:', stateResponse.session);
        this.currentSession = stateResponse.session;

        // 验证session有数据
        if (this.currentSession.steps && this.currentSession.steps.length > 0) {
          console.log('[SidePanel] Session has', this.currentSession.steps.length, 'steps');
          this.showState('description-selector');
          await this.generateDescriptions();
        } else {
          console.log('[SidePanel] Session has no steps, showing empty state');
          this.showState('empty-state');
        }
      } else {
        console.log('[SidePanel] No stopped session found, showing empty state');
        this.showState('empty-state');
      }
    } catch (error) {
      console.error('[SidePanel] Failed to check existing session:', error);
      this.showState('empty-state');
    }
  }

  showState(stateId) {
    document.querySelectorAll('.state-view').forEach(el => {
      el.classList.remove('active');
      el.classList.add('hidden');
    });

    const stateElement = document.getElementById(stateId);
    if (stateElement) {
      stateElement.classList.remove('hidden');
      stateElement.classList.add('active');
    }
  }

  async handleAIAnalysis(session, config) {
    this.currentSession = session;
    this.config = config;

    // 显示描述选择器
    this.showState('description-selector');
    await this.generateDescriptions();
  }

  async generateDescriptions() {
    if (!this.currentSession || !this.currentSession.steps || this.currentSession.steps.length === 0) {
      this.showError('没有可用的录制数据');
      return;
    }

    const config = await this.loadConfig();
    if (!config.apiKey) {
      // 未配置API，使用默认选项
      this.showDefaultDescriptions();
      return;
    }

    if (!config.smartDescription) {
      this.showDefaultDescriptions();
      return;
    }

    this.showLoading('正在分析操作...');

    try {
      const prompt = this.buildIntentPrompt();
      const aiResponse = await this.callAI(prompt, config);

      // 解析AI返回的描述
      const descriptions = this.parseDescriptions(aiResponse);

      if (descriptions && descriptions.length > 0) {
        this.generatedDescriptions = descriptions;
        this.renderDescriptions();
      } else {
        this.showDefaultDescriptions();
      }
    } catch (error) {
      console.error('Failed to generate descriptions:', error);

      // 显示友好的错误提示
      const errorMsg = error.message || '未知错误';
      console.error('AI分析失败:', errorMsg);

      // 即使失败也显示默认选项，让用户可以继续
      this.showDefaultDescriptions();

      // 显示警告提示
      setTimeout(() => {
        this.showNotification(`AI分析失败: ${errorMsg}，已使用默认选项`);
      }, 100);
    }
  }

  // 解析AI返回的描述文本
  parseDescriptions(text) {
    if (!text || typeof text !== 'string') {
      console.warn('[SidePanel] Invalid AI response text');
      return [];
    }

    try {
      // 按行分割，过滤空行
      const lines = text.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);

      // 提取描述（移除序号、符号等）
      const descriptions = lines
        .map(line => {
          // 移除开头的数字序号 "1. " 或 "1、"
          line = line.replace(/^\d+[\.\、]\s*/, '');
          // 移除开头的 "- " 或 "* "
          line = line.replace(/^[-\*]\s*/, '');
          // 移除开头的 "•"
          line = line.replace(/^•\s*/, '');
          return line.trim();
        })
        .filter(line => line.length > 3 && line.length < 200); // 过滤过短或过长的

      return descriptions.slice(0, 3); // 最多返回3个
    } catch (error) {
      console.error('[SidePanel] Error parsing descriptions:', error);
      return [];
    }
  }

  buildIntentPrompt() {
    const session = this.currentSession;
    const firstStep = session.steps[0];
    const lastStep = session.steps[session.steps.length - 1];

    let firstStepDesc = '';
    if (firstStep.type === 'click') {
      firstStepDesc = `点击了"${firstStep.text || firstStep.tagName}"`;
    } else if (firstStep.type === 'navigate') {
      firstStepDesc = `导航到${firstStep.to}`;
    }

    let lastStepDesc = '';
    if (lastStep.type === 'click') {
      lastStepDesc = `点击了"${lastStep.text || lastStep.tagName}"`;
    } else if (lastStep.type === 'navigate') {
      lastStepDesc = `导航到${lastStep.to}`;
    }

    return `你是一个用户意图分析助手。根据以下用户在网页上的操作序列，推测其最可能想要记录的文档任务。

操作总结：用户在页面【${session.pageTitle}】上，进行了 ${session.steps.length} 步操作。
第一步是【${firstStepDesc}】，最后一步是【${lastStepDesc}】。

请生成1到3个最可能、最简洁的任务描述，每个描述应像一个文章标题或具体指令，例如"创建XX功能的配置教程"、"记录YY数据的查询过程"。

直接以清晰的列表形式返回，每行一个描述，不要额外解释，不要使用markdown格式。`;
  }

  showDefaultDescriptions() {
    this.generatedDescriptions = [
      `在${this.currentSession.pageTitle}页面的操作指南`,
      `${this.currentSession.steps.length}步操作流程记录`
    ];
    this.renderDescriptions();
  }

  renderDescriptions() {
    const listContainer = document.getElementById('description-list');
    listContainer.innerHTML = '';

    this.generatedDescriptions.forEach((desc, index) => {
      const option = document.createElement('div');
      option.className = 'description-option';
      option.innerHTML = `
        <input type="radio" name="description" id="desc-${index}" value="${index}">
        <label for="desc-${index}">${desc}</label>
      `;
      option.addEventListener('click', () => {
        document.querySelectorAll('.description-option').forEach(el => {
          el.classList.remove('selected');
        });
        option.classList.add('selected');
        document.getElementById(`desc-${index}`).checked = true;
        this.selectedDescription = desc;
      });
      listContainer.appendChild(option);
    });

    // 添加自定义描述事件
    const customRadio = document.querySelector('input[value="custom"]');
    customRadio.addEventListener('change', () => {
      document.querySelectorAll('.description-option').forEach(el => {
        el.classList.remove('selected');
      });
      this.selectedDescription = null;
    });
  }

  async generateDocument() {
    let description = this.selectedDescription;

    // 如果选择了自定义输入
    const customRadio = document.querySelector('input[value="custom"]');
    if (customRadio.checked) {
      description = document.getElementById('custom-description').value.trim();
      if (!description) {
        alert('请输入自定义描述');
        return;
      }
    } else if (!description) {
      // 默认选择第一个
      description = this.generatedDescriptions[0];
    }

    this.showLoading('正在生成文档...');

    try {
      const config = await this.loadConfig();
      const document = await this.generateDocumentContent(description, config);

      if (document) {
        this.generatedDocument = document;
        document.getElementById('markdown-editor').value = document;
        this.updatePreview();
        this.showState('document-editor');
      } else {
        this.showError('文档生成失败，请重试');
      }
    } catch (error) {
      console.error('Failed to generate document:', error);
      this.showError('文档生成失败：' + error.message);
    }
  }

  async generateDocumentContent(description, config) {
    const prompt = this.buildDocumentPrompt(description);

    try {
      return await this.callAI(prompt, config);
    } catch (error) {
      console.error('Failed to call AI:', error);
      throw error;
    }
  }

  buildDocumentPrompt(description) {
    const session = this.currentSession;

    // 构建步骤描述
    let stepsDesc = '';
    session.steps.forEach((step, index) => {
      stepsDesc += `\n步骤 ${index + 1}: `;
      if (step.type === 'click') {
        stepsDesc += `点击${step.text ? `"${step.text}"` : step.tagName}按钮`;
        if (step.selector) {
          stepsDesc += ` (选择器: ${step.selector})`;
        }
      } else if (step.type === 'navigate') {
        stepsDesc += `页面导航到 ${step.to}`;
      }
    });

    return `你是一个专业的文档工程师。请根据以下用户操作序列和任务描述，生成一份详细的步骤指南。

## 任务描述
${description}

## 操作环境
页面：${session.pageTitle} (${session.pageUrl})
操作时间：${new Date(session.startTime).toLocaleString('zh-CN')}
总步骤数：${session.steps.length}

## 详细操作步骤
${stepsDesc}

## 生成要求
1. 使用清晰中文撰写，格式为Markdown。
2. 为每个关键步骤创建二级标题（如"步骤一：点击登录按钮"）。
3. 在每一步中，用括号注明操作细节（例如：（点击了左上角的"登录"按钮））。
4. 添加必要的说明和提示。
5. 在文档末尾添加"注意事项"章节。
6. 使用标准的Markdown语法。

请直接生成文档，不要额外说明。`;
  }

  async callAI(prompt, config) {
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      // 验证配置
      if (!config || !config.apiKey || !config.baseUrl) {
        throw new Error('AI配置不完整，请检查设置');
      }

      // 确保URL格式正确
      let baseUrl = config.baseUrl.trim();
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }

      const url = `${baseUrl}/chat/completions`;

      console.log('[SidePanel] AI请求URL:', url);
      console.log('[SidePanel] 使用模型:', config.modelName);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API错误: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // 验证响应数据结构
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('AI返回数据格式异常');
      }

      const content = data.choices[0].message.content || '';

      if (!content) {
        throw new Error('AI返回内容为空');
      }

      return content.trim();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('请求超时（30秒），请检查网络连接或API地址');
      }

      console.error('[SidePanel] AI调用失败:', error);
      throw error;
    }
  }

  updatePreview() {
    const markdownText = document.getElementById('markdown-editor').value;
    const previewPane = document.getElementById('markdown-preview');

    // 简单的Markdown渲染（不依赖外部库）
    let html = this.parseMarkdown(markdownText);
    previewPane.innerHTML = html;
  }

  // 简单的Markdown解析器（带安全处理）
  parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // 转义HTML（防止XSS）
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // 代码块 ```code```（先处理，避免内部内容被转义）
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      // 代码块内容需要反向转义，使其可读
      const unescapedCode = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      return `<pre><code class="${lang || ''}">${unescapedCode}</code></pre>`;
    });

    // 行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题 # H1
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');

    // 粗体 **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体 *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 无序列表 - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 有序列表 1. item（直接生成正确的li标签）
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
      // 检查是否是有序列表（通过判断前文是否有数字）
      const lines = match.split('\n').filter(l => l.trim());
      if (lines.length > 0 && /^\d+\./.test(text.split('\n').find(l => l.includes(lines[0].replace(/<li>|<\/li>/g, ''))) || '')) {
        return '<ol>' + match + '</ol>';
      }
      return match;
    });

    // 链接 [text](url) - 添加rel="noopener"防止安全风险
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 图片
![alt](url) - 仅允许http/https协议
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      // 简单的URL验证
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
        return `<img src="${url}" alt="${alt}" loading="lazy">`;
      }
      return match; // 不安全的URL不渲染
    });

    // 段落（双换行）
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // 清理空段落
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-4]>)/g, '$1');
    html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ol>)/g, '$1');
    html = html.replace(/(<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');

    return html;
  }

  switchMode(isEdit) {
    this.isEditMode = isEdit;

    const previewBtn = document.getElementById('btn-preview');
    const editBtn = document.getElementById('btn-edit');
    const previewPane = document.getElementById('preview-pane');
    const editPane = document.getElementById('edit-pane');

    if (isEdit) {
      editBtn.classList.add('active');
      previewBtn.classList.remove('active');
      previewPane.classList.remove('active');
      editPane.classList.add('active');
    } else {
      previewBtn.classList.add('active');
      editBtn.classList.remove('active');
      editPane.classList.remove('active');
      previewPane.classList.add('active');
      this.updatePreview();
    }
  }

  async copyToClipboard() {
    const markdownText = document.getElementById('markdown-editor').value;

    try {
      await navigator.clipboard.writeText(markdownText);

      const btn = document.getElementById('btn-copy');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span class="icon">✅</span> 已复制';
      btn.classList.add('active');

      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('active');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('复制失败，请手动复制');
    }
  }

  downloadFile() {
    const markdownText = document.getElementById('markdown-editor').value;

    const blob = new Blob([markdownText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `文档-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    this.showState('loading-state');
  }

  showError(message) {
    document.getElementById('error-message').textContent = message;
    this.showState('error-state');
  }

  async retry() {
    if (this.currentSession) {
      this.showState('description-selector');
      await this.generateDescriptions();
    } else {
      this.showState('empty-state');
    }
  }

  createNew() {
    this.currentSession = null;
    this.generatedDocument = null;
    this.selectedDescription = null;
    document.getElementById('markdown-editor').value = '';
    document.getElementById('custom-description').value = '';
    this.showState('empty-state');
  }

  async startRecording() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id
      });
      // 注意：侧边栏保持打开，用户可以手动关闭或查看录制状态
      this.showState('empty-state');
      this.showNotification('录制已开始，请在页面上进行操作');
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('启动录制失败，请重试');
    }
  }

  showNotification(message) {
    // 简单的通知提示
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      animation: fadeInOut 3s forwards;
    `;
    document.body.appendChild(notification);

    // 添加动画样式
    if (!document.getElementById('notification-style')) {
      const style = document.createElement('style');
      style.id = 'notification-style';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          10% { opacity: 1; transform: translateX(-50%) translateY(0); }
          90% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => {
      notification.remove();
    }, 3000);
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
              resolve(result || {});
            }
          });
        } else {
          reject(new Error('chrome.storage is not available'));
        }
      });

      return {
        apiKey: result.apiKey || '',
        baseUrl: result.baseUrl || 'https://api.openai.com/v1',
        modelName: result.modelName || 'gpt-3.5-turbo',
        smartDescription: result.smartDescription !== undefined ? result.smartDescription : true
      };
    } catch (error) {
      console.error('Failed to load config:', error);
      return {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-3.5-turbo',
        smartDescription: true
      };
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new SidePanelManager();
});
