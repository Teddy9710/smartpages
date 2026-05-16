/**
 * Smart Page Scribe - Side Panel Manager
 *
 * Manages the side panel UI for document generation and editing.
 * Uses DocUIHelper for shared document management logic.
 *
 * @module sidepanel
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** @constant {Object} StateViews - Available state views */
const StateViews = {
  EMPTY: 'empty',
  LOADING: 'loading',
  DESCRIPTION: 'description',
  EDITOR: 'document-editor',
  ERROR: 'error',
  DOCUMENTS: 'documents'
};

/** @constant {Object} DefaultDescriptions - Default document descriptions */
const DefaultDescriptions = [
  { value: 'user-guide', label: '用户操作指南', description: '生成一份详细的用户操作指南' },
  { value: 'tutorial', label: '教程文档', description: '生成一份新手教程文档' },
  { value: 'testing', label: '测试用例', description: '生成测试用例文档' },
  { value: 'bug-report', label: '问题报告', description: '生成问题报告文档' }
];

// ============================================================================
// SIDEPANEL MANAGER CLASS
// ============================================================================

class SidePanelManager {
  constructor() {
    this.currentState = StateViews.EMPTY;
    this.session = null;
    this.config = null;
    this.originalBeforeOptimization = null;
    this.isOptimizing = false;
    this.documentApi = new DocumentApi();
    this.docUI = new DocUIHelper({
      api: this.documentApi,
      source: 'sidepanel',
      onNotify: (msg, type) => this._showNotification(msg, type),
      getApi: () => this.documentApi
    });
    this.cleanupFunctions = [];
    this.init();
  }

  async init() {
    this._bindEvents();
    await this._checkForPendingSession();
  }

  // ========================================================================
  // EVENT BINDING
  // ========================================================================

  _bindEvents() {
    this._bindButton('btn-new', () => this.newDocument());
    this._bindButton('btn-start-here', () => this.startRecordingHere());
    this._bindButton('btn-generate', () => this.generateDocument());
    this._bindButton('btn-retry', () => this.retry());
    this._bindButton('btn-preview', () => this.switchToPreview());
    this._bindButton('btn-edit', () => this.switchToEdit());
    this._bindButton('btn-copy', () => this.copyDocument());
    this._bindButton('btn-download', () => this.downloadDocument());
    this._bindButton('btn-export-html', () => this.exportHtmlDocument());
    this._bindButton('btn-ai-optimize', () => this.openOptimizeDialog());
    this._bindButton('btn-revert-optimization', () => this.revertOptimization());
    this._bindButton('btn-close-optimize', () => this.closeOptimizeDialog());
    this._bindButton('btn-cancel-optimize', () => this.closeOptimizeDialog());
    this._bindButton('btn-run-optimize', () => this.optimizeCurrentDocument());
    this._bindButton('btn-documents', () => this.showDocumentsPanel());
    this._bindButton('btn-close-documents', () => this.hideDocumentsPanel());
    this._bindEditorEvents();
    this._bindDocumentUploadEvents('sidepanel');
  }

  _bindButton(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
      const wrappedHandler = handler.bind(this);
      button.addEventListener('click', wrappedHandler);
      this.cleanupFunctions.push(() => button.removeEventListener('click', wrappedHandler));
    } else {
      console.warn(`[Scribe:SidePanel] Button '${buttonId}' not found`);
    }
  }

  _bindEditorEvents() {
    const editor = document.getElementById('markdown-editor');
    const preview = document.getElementById('markdown-preview');

    if (editor) {
      const handleEditorInput = debounce(() => {
        if (document.getElementById('preview-pane')?.classList.contains('active')) {
          this._updatePreview(editor.value);
        }
      }, 120);
      editor.addEventListener('input', handleEditorInput);
      this.cleanupFunctions.push(() => editor.removeEventListener('input', handleEditorInput));
    }

    if (preview) {
      const handlePreviewInput = debounce(() => this._syncPreviewToEditor(), 120);
      preview.addEventListener('input', handlePreviewInput);
      this.cleanupFunctions.push(() => preview.removeEventListener('input', handlePreviewInput));
    }
  }

  _bindDocumentUploadEvents(source) {
    const d = this.docUI;
    const browseBtn = document.getElementById(`${source}-browse-btn`);
    const fileInput = document.getElementById(`${source}-document-file`);
    const uploadArea = document.getElementById(`${source}-upload-area`);
    const refreshBtn = document.getElementById(`${source}-refresh-documents`);
    const searchInput = document.getElementById(`${source}-search-documents`);

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => d.handleFileSelect(e));
    }
    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput?.click());
      uploadArea.addEventListener('dragover', (e) => d.handleDragOver(e));
      uploadArea.addEventListener('dragleave', (e) => d.handleDragLeave(e));
      uploadArea.addEventListener('drop', (e) => d.handleDrop(e));
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => d.loadDocumentsList());
    }
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => d.searchDocuments(e.target.value)));
    }
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  async _checkForPendingSession() {
    try {
      const response = await sendMessage({ type: 'GET_RECORDING_STATE' });
      if (response?.state === 'stopped' && response?.session) {
        this.session = response.session;
        this._showDescriptionSelector();
      } else {
        this._showEmptyState();
      }
    } catch (error) {
      console.error('[Scribe:SidePanel] Failed to get recording state:', error);
      this._showEmptyState();
    }
  }

  setState(newState) {
    document.querySelectorAll('.state-view').forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });
    const el = document.getElementById(`${newState}-state`);
    if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
    this.currentState = newState;
  }

  _showEmptyState() { this.setState(StateViews.EMPTY); }

  showLoadingState(text = '正在处理...') {
    const t = document.getElementById('loading-text');
    if (t) t.textContent = text;
    this.setState(StateViews.LOADING);
  }

  _showDescriptionSelector() {
    this.setState(StateViews.DESCRIPTION);
    this._renderDescriptionOptions();
  }

  showErrorState(message) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = message;
    this.setState(StateViews.ERROR);
  }

  showEditor() { this.setState(StateViews.EDITOR); }

  showDocumentsPanel() { this.setState(StateViews.DOCUMENTS); this.docUI.loadDocumentsList(); }
  hideDocumentsPanel() { this._showEmptyState(); }

  // ========================================================================
  // DESCRIPTION OPTIONS
  // ========================================================================

  _renderDescriptionOptions() {
    const container = document.getElementById('description-list');
    if (!container) return;
    container.replaceChildren();
    DefaultDescriptions.forEach(desc => {
      container.appendChild(createElement('div', { className: 'description-option' }, [
        createElement('input', { type: 'radio', name: 'description', value: desc.value, id: `desc-${desc.value}`, checked: desc === DefaultDescriptions[0] }),
        createElement('label', { htmlFor: `desc-${desc.value}`, textContent: desc.label })
      ]));
    });
  }

  // ========================================================================
  // ACTIONS
  // ========================================================================

  async startRecordingHere() {
    try {
      const [tab] = await queryTabs({ active: true, currentWindow: true });
      if (!tab) throw new ExtensionError('无法获取当前标签页', 'TAB_ERROR');
      const response = await sendMessage({ type: 'START_RECORDING', tabId: tab.id });
      if (response?.error) throw new ExtensionError(response.error, 'RECORDING_ERROR');
      window.close();
    } catch (error) {
      this._showError('启动录制失败: ' + error.message);
    }
  }

  async generateDocument() {
    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';
      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description')?.value?.trim();
        if (!description) { this._showError('请输入自定义描述'); return; }
      } else {
        const selectedDesc = DefaultDescriptions.find(d => d.value === selectedValue);
        description = selectedDesc?.description || '';
      }

      this.showLoadingState('正在生成文档...');
      const config = await loadConfig();
      this.config = config;
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');

      const prompt = this._buildGenerationPrompt(description, selectedValue, config);
      const response = await fetchWithTimeout(
        config.baseUrl + '/chat/completions',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.modelName, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS }) },
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
      }

      const data = await response.json();
      const outputFormat = this._getOutputFormat(config);
      const markdown = this._normalizeGeneratedContent(data.choices[0].message.content.trim(), outputFormat);
      this.showEditor();
      this._setEditorContent(this._injectScreenshots(markdown, outputFormat));
      this._resetOptimizationState();
    } catch (error) {
      console.error('[Scribe:SidePanel] Generation failed:', error);
      this.showErrorState(this._formatUserFacingError(error, '生成文档失败，请重试'));
    }
  }

  _buildGenerationPrompt(description, docType, config = {}) {
    const sessionInfo = this._buildSessionInfo();
    const stepsText = this._buildStepsText();
    const documentTypeInstructions = this._getDocumentTypeInstructions(docType);
    const outputFormatInstruction = this._getOutputFormatInstruction(config.outputFormat);
    const variables = {
      taskDescription: description,
      sessionInfo,
      steps: stepsText,
      documentTypeInstructions,
      outputFormatInstruction,
      styleGuide: config.styleGuide || '',
      documentExample: this._getDocumentExample(docType, config)
    };
    const promptMode = config.promptMode || DEFAULT_PROMPT_MODE;
    const selectedTemplate = promptMode === 'custom'
      ? (config.customPrompt || DEFAULT_PROMPT_TEMPLATE)
      : DEFAULT_PROMPT_TEMPLATE;
    let prompt = this._applyPromptTemplate(selectedTemplate, variables);

    if (!this._templateIncludesContext(selectedTemplate)) {
      prompt += `\n\n录制上下文：\n${sessionInfo}\n\n操作步骤原始记录：\n${stepsText}\n\n文档类型要求：\n${documentTypeInstructions}`;
    }

    if (promptMode !== 'custom' && config.promptAppend?.trim()) {
      prompt += `\n\n用户补充要求：\n${config.promptAppend.trim()}`;
    }

    const styleReference = this._buildStyleReferencePrompt(docType, config);
    if (styleReference) {
      prompt += styleReference;
    }

    prompt += `\n\n${outputFormatInstruction}`;

    return prompt;
  }

  _getOutputFormat(config = this.config) {
    const format = typeof config === 'string' ? config : config?.outputFormat;
    return ['markdown', 'html', 'text'].includes(format) ? format : 'markdown';
  }

  _getOutputFormatInstruction(format) {
    const normalized = this._getOutputFormat(format);
    const instructions = {
      markdown: [
        '输出格式要求：',
        '- 最终只输出 Markdown 文档，不要输出解释、寒暄或代码块围栏。',
        '- 如果参考文档是 HTML，只学习它的层级、组件、表格、列表和提示块表达，并转换为 Markdown 结构。',
        '- 保留每个录制步骤对应的 [截图N] 占位或图片引用。'
      ],
      html: [
        '输出格式要求：',
        '- 如果前面的默认提示词或文档类型要求提到 Markdown，请忽略该格式限制，以本条 HTML 输出要求为准。',
        '- 最终只输出 HTML，不要输出 Markdown，不要用 ```html 代码块包裹。',
        '- 输出可直接保存为 .html 的文档内容；允许使用语义化 HTML 和必要的内联样式，禁止 script、iframe、外部资源和事件处理属性。',
        '- 如果参考文档是 HTML，请尽量沿用它的标题层级、内容区块、表格、列表、提示块和视觉节奏，但事实内容必须以本次录制为准。',
        '- 保留每个录制步骤对应的截图占位，建议使用 <img alt="步骤N截图" src="[截图N]"> 或清晰的 [截图N] 标记。'
      ],
      text: [
        '输出格式要求：',
        '- 如果前面的默认提示词或文档类型要求提到 Markdown，请忽略该格式限制，以本条纯文本输出要求为准。',
        '- 最终只输出纯文本，不要输出 Markdown、HTML 或代码块围栏。',
        '- 如果参考文档是 Markdown 或 HTML，只学习其内容顺序、层级和语气，并转换为纯文本段落。',
        '- 保留每个录制步骤对应的 [截图N] 占位。'
      ]
    };
    return instructions[normalized].join('\n');
  }

  _buildStyleReferencePrompt(docType, config = {}) {
    const sections = [];
    const styleGuide = this._trimReferenceText(config.styleGuide || '', 6000);
    const example = this._trimReferenceText(this._getDocumentExample(docType, config), 10000);

    if (styleGuide) {
      sections.push(`风格指南：\n${styleGuide}`);
    }

    if (example) {
      sections.push(`当前文档类型示例：\n${example}`);
    }

    if (!sections.length) return '';

    return `\n\n写作风格与示例参考：\n${sections.join('\n\n')}\n\n请严格遵循以上风格指南；如果提供了示例文档，请参考示例的标题层级、段落颗粒度、语气、表格/列表使用方式和截图占位方式。示例可能是 Markdown、纯文本或 HTML；如果是 HTML，请学习它的内容层级、组件组织、表格/列表/提示块等版式表达，并按用户选择的输出格式转换。不要照抄示例中的业务事实、账号、数据、链接或截图。最终文档仍必须以本次录制步骤为准。`;
  }

  _getDocumentExample(docType, config = {}) {
    return config.documentExamples?.[docType] || '';
  }

  _trimReferenceText(text, maxLength) {
    const value = String(text || '').trim();
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength) + '\n\n[以上参考内容过长，已截断]';
  }

  _buildSessionInfo() {
    return [
      `页面标题：${this.session?.pageTitle || '未记录'}`,
      `页面地址：${this.session?.pageUrl || '未记录'}`,
      `录制步骤数：${this.session?.steps?.length || 0}`
    ].join('\n');
  }

  _buildStepsText() {
    if (!this.session?.steps?.length) return '无录制步骤';

    return this.session.steps.map((step, index) => {
      const num = index + 1;
      const screenshotMarker = `[截图${num}]`;
      if (step.type === 'navigate') {
        return [
          `步骤 ${num}｜页面跳转`,
          `- 来源页面：${step.from || '当前页'}`,
          `- 目标页面：${step.to || '新页面'}`,
          `- 截图：${screenshotMarker}`
        ].join('\n');
      }

      const actionTypeLabel = {
        click: '用户点击',
        input: '用户输入',
        change: '用户变更',
        submit: '表单提交'
      }[step.type] || '用户操作';

      return [
        `步骤 ${num}｜${actionTypeLabel}`,
        `- 操作描述：${step.action || '点击页面元素'}`,
        `- 元件名称：${step.elementName || step.text || '未识别名称'}`,
        `- 元件角色：${step.elementRole || '未知'}`,
        `- 元件类型：${step.elementType || step.tagName || '未知'}`,
        `- 元件状态：${this._formatElementState(step.elementState)}`,
        `- HTML 标签：${step.tagName || '未知'}`,
        `- CSS 选择器：${step.selector || '未记录'}`,
        `- 原始点击选择器：${step.rawSelector || step.selector || '未记录'}`,
        `- 点击坐标：${Number.isFinite(step.x) && Number.isFinite(step.y) ? `${step.x}, ${step.y}` : '未记录'}`,
        `- 页面语义快照：\n${this._formatPageSnapshot(step.pageSnapshot)}`,
        `- 截图：${screenshotMarker}`
      ].join('\n');
    }).join('\n\n');
  }

  _formatElementState(state) {
    if (!state || typeof state !== 'object') return '未记录';
    const entries = Object.entries(state).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!entries.length) return '未记录';
    return entries.map(([key, value]) => `${key}=${value}`).join(', ');
  }

  _formatPageSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '  未记录';
    const lines = [];
    const addList = (label, values) => {
      if (Array.isArray(values) && values.length) {
        lines.push(`  - ${label}：${values.join('、')}`);
      }
    };
    if (snapshot.title) lines.push(`  - 页面标题：${snapshot.title}`);
    if (snapshot.url) lines.push(`  - 页面地址：${snapshot.url}`);
    addList('页面标题层级', snapshot.headings);
    addList('主要区域', snapshot.landmarks);
    addList('当前页签', snapshot.activeTabs);
    addList('可见页签', snapshot.tabs);
    addList('主要按钮', snapshot.buttons);
    addList('主要链接', snapshot.links);
    addList('输入项', snapshot.inputs);
    addList('下拉/选择控件', snapshot.selects);
    addList('弹窗/抽屉', snapshot.dialogs);
    if (Array.isArray(snapshot.tables) && snapshot.tables.length) {
      snapshot.tables.forEach((table, index) => {
        const name = table.caption || `表格${index + 1}`;
        const headers = table.headers?.length ? `，列：${table.headers.join('、')}` : '';
        const rows = Number.isFinite(table.rowCount) ? `，约 ${table.rowCount} 行` : '';
        lines.push(`  - ${name}${headers}${rows}`);
      });
    }
    if (snapshot.visibleTextSummary) {
      lines.push(`  - 可见文本摘要：${snapshot.visibleTextSummary}`);
    }
    return lines.length ? lines.join('\n') : '  未记录';
  }

  _getDocumentTypeInstructions(docType) {
    const templates = {
      'user-guide': `请生成“用户操作指南”，要求简洁实用，建议结构：
# 标题
## 适用场景
用 1-2 句话说明这个流程适合什么场景。
## 操作前准备
只列必要前置条件，例如登录状态、权限、页面入口；没有就省略。
## 操作流程
按步骤编号输出。每步格式为：
### 步骤N：动作名称
一句话说明怎么操作；如果有必要，再补一句成功后的页面变化。步骤末尾保留 [截图N]。
不要拆成“操作目标、具体操作、页面反馈、判断标准”等固定字段。
登录、输入密码、点击提交这类常规步骤要简短，不要解释密码框、眼睛图标、按钮颜色等常识。
## 结果确认
用 1-3 条说明如何确认流程已完成。
## 注意事项
只列真正重要的注意事项，最多 3 条。`,

      tutorial: `请生成“教程文档”，建议结构：
# 标题
## 学习目标
说明读者完成教程后能掌握什么。
## 背景说明
用简短段落解释这个功能/页面的作用。
## 准备工作
列出账号、权限、浏览器、示例数据等准备事项。
## 分步教学
按录制步骤展开，每步包含：本步操作、必要说明、[截图N]。不要机械拆成过多字段。
## 练习建议
给出 2-3 个读者可自行尝试的变体操作。
## 小结
总结关键路径和成功标准。`,

      testing: `请生成“测试用例文档”，建议结构：
# 标题
## 测试目标
说明要验证的业务能力。
## 测试范围
列出本次覆盖和未覆盖的内容。
## 前置条件
列出账号、权限、测试数据、环境和页面入口。
## 测试步骤
使用表格输出：步骤编号、操作、测试数据/输入、预期结果、截图。
## 验收标准
列出通过/失败判断。
## 异常与边界场景
补充 5-8 条值得回归的异常、空值、权限、网络或重复提交场景。`,

      'bug-report': `请生成“问题报告”，建议结构：
# 标题
## 问题摘要
用 1-2 句话描述问题现象和影响。
## 环境信息
根据上下文列出页面地址、浏览器插件录制来源、时间如未知则写“未记录”。
## 复现步骤
按录制步骤展开，每步包含操作、必要的页面反馈和 [截图N]。
## 预期结果
说明正常情况下应该发生什么。
## 实际结果
基于录制内容谨慎描述已观察到的结果；无法判断时标注“需人工补充”。
## 影响范围
说明可能影响的用户、流程或数据。
## 排查建议
给出前端、权限、数据、网络、后端接口等方向的排查清单。`
    };

    return templates[docType] || `请生成一份结构清晰、内容详实的通用 Markdown 文档，建议结构：
# 标题
## 流程概述
## 前置条件
## 详细操作步骤
## 结果确认
## 注意事项
## 常见问题与解决方案
## 附录：关键页面与截图`;
  }

  _applyPromptTemplate(template, variables) {
    return String(template || DEFAULT_PROMPT_TEMPLATE)
      .replaceAll('{{taskDescription}}', variables.taskDescription)
      .replaceAll('{{sessionInfo}}', variables.sessionInfo)
      .replaceAll('{{steps}}', variables.steps)
      .replaceAll('{{documentTypeInstructions}}', variables.documentTypeInstructions)
      .replaceAll('{{outputFormatInstruction}}', variables.outputFormatInstruction)
      .replaceAll('{{styleGuide}}', variables.styleGuide)
      .replaceAll('{{documentExample}}', variables.documentExample);
  }

  _templateIncludesContext(template) {
    const value = String(template || '');
    return value.includes('{{sessionInfo}}') && value.includes('{{steps}}');
  }

  _injectScreenshots(content, format = this._getOutputFormat()) {
    if (!this.session?.steps?.length) return content;
    var result = content;
    this.session.steps.forEach(function(step, index) {
      var stepNumber = index + 1;
      var placeholder = '[' + '截图' + stepNumber + ']';
      if (step.screenshot) {
        var imgTag = format === 'html'
          ? '<img alt="' + '步骤' + stepNumber + '截图" src="' + step.screenshot + '">'
          : '![' + '步骤' + stepNumber + '截图](' + step.screenshot + ')';
        result = result.split(placeholder).join(imgTag);
        result = result.replace(new RegExp('截图占位[：:]?\\s*步骤\\s*' + stepNumber + '\\s*截图', 'g'), imgTag);
        result = result.replace(new RegExp('步骤\\s*' + stepNumber + '\\s*截图', 'g'), imgTag);
        result = result.replace(new RegExp('截图\\s*' + stepNumber + '(?![\\]\\)])', 'g'), imgTag);
      }
    });
    return result;
  }

  _setEditorContent(content) {
    const editor = document.getElementById('markdown-editor');
    if (editor) { editor.value = content; this._updatePreview(content); }
  }

  _updatePreview(content) { this._renderDocument(content); }

  _renderDocument(content) {
    const format = this._getOutputFormat();
    if (format === 'html') {
      this._renderHtml(content);
    } else if (format === 'text') {
      this._renderText(content);
    } else {
      this._renderMarkdown(content);
    }
  }

  _renderMarkdown(markdown) {
    const previewDiv = document.getElementById('markdown-preview');
    if (previewDiv && typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      safeSetInnerHTML(previewDiv, marked.parse(markdown), true);
    }
  }

  _renderHtml(html) {
    const previewDiv = document.getElementById('markdown-preview');
    if (!previewDiv) return;
    safeSetInnerHTML(previewDiv, this._extractHtmlBody(html), true);
  }

  _renderText(text) {
    const previewDiv = document.getElementById('markdown-preview');
    if (!previewDiv) return;
    previewDiv.textContent = text || '';
  }

  _syncPreviewToEditor() {
    const preview = document.getElementById('markdown-preview');
    const editor = document.getElementById('markdown-editor');
    if (!preview || !editor) return;

    const format = this._getOutputFormat();
    const content = format === 'html'
      ? preview.innerHTML.trim()
      : format === 'text'
        ? preview.innerText.trim()
        : this._htmlToMarkdown(preview);
    if (editor.value !== content) {
      editor.value = content;
    }
  }

  _ensureEditorContentFresh() {
    if (document.getElementById('preview-pane')?.classList.contains('active')) {
      this._syncPreviewToEditor();
    }
  }

  _htmlToMarkdown(root) {
    const blocks = Array.from(root.childNodes)
      .map(node => this._nodeToMarkdown(node, false))
      .map(text => text.trim())
      .filter(Boolean);

    return this._normalizeMarkdownOutput(blocks.join('\n\n'));
  }

  _nodeToMarkdown(node, inline = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this._normalizeTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'script' || tag === 'style') return '';

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const level = Number(tag.slice(1));
      return `${'#'.repeat(level)} ${this._childrenToMarkdown(node, true).trim()}`;
    }

    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
      return this._childrenToMarkdown(node, inline).trim();
    }

    if (tag === 'strong' || tag === 'b') {
      const text = this._childrenToMarkdown(node, true).trim();
      return text ? `**${text}**` : '';
    }

    if (tag === 'em' || tag === 'i') {
      const text = this._childrenToMarkdown(node, true).trim();
      return text ? `*${text}*` : '';
    }

    if (tag === 'code') {
      if (node.parentElement?.tagName?.toLowerCase() === 'pre') return node.textContent || '';
      return `\`${(node.textContent || '').replace(/`/g, '\\`')}\``;
    }

    if (tag === 'pre') {
      const code = node.textContent || '';
      return `\`\`\`\n${code.replace(/\n+$/g, '')}\n\`\`\``;
    }

    if (tag === 'a') {
      const text = this._childrenToMarkdown(node, true).trim() || node.getAttribute('href') || '';
      const href = node.getAttribute('href') || '';
      return href ? `[${text}](${href})` : text;
    }

    if (tag === 'img') {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      return src ? `![${alt}](${src})` : '';
    }

    if (tag === 'ul' || tag === 'ol') {
      return this._listToMarkdown(node, tag === 'ol');
    }

    if (tag === 'li') {
      return this._childrenToMarkdown(node, false).trim();
    }

    if (tag === 'blockquote') {
      const text = this._childrenToMarkdown(node, false).trim();
      return text.split('\n').map(line => `> ${line}`).join('\n');
    }

    if (tag === 'table') {
      return this._tableToMarkdown(node);
    }

    return this._childrenToMarkdown(node, inline).trim();
  }

  _childrenToMarkdown(element, inline = false) {
    return Array.from(element.childNodes)
      .map(node => this._nodeToMarkdown(node, inline))
      .join(inline ? '' : '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  _listToMarkdown(list, ordered) {
    const items = Array.from(list.children).filter(child => child.tagName?.toLowerCase() === 'li');
    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const text = this._childrenToMarkdown(item, false).trim().replace(/\n/g, '\n  ');
      return `${prefix}${text}`;
    }).join('\n');
  }

  _tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr')).map(row =>
      Array.from(row.children).map(cell =>
        this._childrenToMarkdown(cell, true).trim().replace(/\|/g, '\\|')
      )
    ).filter(row => row.length);

    if (!rows.length) return '';

    const columnCount = Math.max(...rows.map(row => row.length));
    const normalizeRow = row => {
      const cells = Array.from({ length: columnCount }, (_, index) => row[index] || '');
      return `| ${cells.join(' | ')} |`;
    };

    const output = [normalizeRow(rows[0])];
    output.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
    rows.slice(1).forEach(row => output.push(normalizeRow(row)));
    return output.join('\n');
  }

  _normalizeTextNode(text) {
    return String(text || '').replace(/\u00a0/g, ' ');
  }

  _normalizeMarkdownOutput(markdown) {
    return String(markdown || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  _normalizeGeneratedContent(content, format) {
    const normalizedFormat = this._getOutputFormat(format);
    const value = String(content || '').trim();
    const fencePattern = normalizedFormat === 'html'
      ? /^```(?:html)?\s*([\s\S]*?)\s*```$/i
      : normalizedFormat === 'markdown'
        ? /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i
        : /^```(?:text|txt)?\s*([\s\S]*?)\s*```$/i;
    const match = value.match(fencePattern);
    return (match?.[1] || value).trim();
  }

  _extractHtmlBody(html) {
    const value = String(html || '');
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return doc.body?.innerHTML || value;
  }

  switchToPreview() {
    this._togglePane('preview-pane', 'btn-preview');
    const content = document.getElementById('markdown-editor')?.value;
    if (content) this._updatePreview(content);
  }

  switchToEdit() {
    this._ensureEditorContentFresh();
    this._togglePane('edit-pane', 'btn-edit');
  }

  _togglePane(paneId, buttonId) {
    ['preview-pane', 'edit-pane', 'btn-preview', 'btn-edit'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    document.getElementById(paneId)?.classList.add('active');
    document.getElementById(buttonId)?.classList.add('active');
  }

  async copyDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      this._showNotification('文档已复制到剪贴板！', 'success');
    } catch (error) {
      this._showNotification('复制失败，请手动选择文本', 'error');
    }
  }

  openOptimizeDialog() {
    const content = this._getEditorContent();
    if (!content) {
      this._showNotification('请先生成或输入文档内容', 'error');
      return;
    }

    const modal = document.getElementById('optimize-modal');
    const instruction = document.getElementById('optimize-instruction');
    const status = document.getElementById('optimize-status');
    if (instruction && !instruction.value.trim()) {
      instruction.value = '请让文档内容更完整、更清晰，补充必要背景、操作目的、页面反馈、注意事项和常见问题；保留所有截图占位与 Markdown 格式。';
    }
    if (status) {
      status.textContent = '';
      status.classList.add('hidden');
      status.classList.remove('error', 'success');
    }
    modal?.classList.remove('hidden');
    instruction?.focus();
  }

  closeOptimizeDialog(force = false) {
    if (this.isOptimizing && !force) return;
    document.getElementById('optimize-modal')?.classList.add('hidden');
  }

  async optimizeCurrentDocument() {
    if (this.isOptimizing) return;

    const currentContent = this._getEditorContent();
    const instruction = document.getElementById('optimize-instruction')?.value.trim();
    if (!currentContent) {
      this._setOptimizeStatus('请先生成或输入文档内容', 'error');
      return;
    }
    if (!instruction) {
      this._setOptimizeStatus('请输入优化要求', 'error');
      return;
    }

    try {
      this.isOptimizing = true;
      this._setOptimizeControls(true);
      this._setOptimizeStatus('正在调用 AI 优化文档...', 'success');

      const config = await loadConfig();
      this.config = config;
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');

      if (!this.originalBeforeOptimization) {
        this.originalBeforeOptimization = currentContent;
      }

      const response = await fetchWithTimeout(
        config.baseUrl + '/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.modelName,
            messages: [{ role: 'user', content: this._buildOptimizationPrompt(currentContent, instruction) }],
            temperature: 0.5,
            max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS
          })
        },
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
      }

      const data = await response.json();
      const optimized = this._normalizeGeneratedContent(
        data.choices?.[0]?.message?.content?.trim(),
        this._getOutputFormat(config)
      );
      if (!optimized) throw new ExtensionError('AI没有返回优化后的文档', 'EMPTY_RESPONSE');

      this._setEditorContent(optimized);
      this._setRevertVisible(true);
      this.switchToPreview();
      this.closeOptimizeDialog(true);
      this._showNotification('文档已优化，可随时回退到优化前版本', 'success');
    } catch (error) {
      console.error('[Scribe:SidePanel] Optimization failed:', error);
      this._setOptimizeStatus(this._formatUserFacingError(error, '优化失败，请重试'), 'error');
    } finally {
      this.isOptimizing = false;
      this._setOptimizeControls(false);
    }
  }

  revertOptimization() {
    if (!this.originalBeforeOptimization) return;
    this._setEditorContent(this.originalBeforeOptimization);
    this.originalBeforeOptimization = null;
    this._setRevertVisible(false);
    this.switchToPreview();
    this._showNotification('已回退到优化前版本', 'success');
  }

  _buildOptimizationPrompt(markdown, instruction) {
    const format = this._getOutputFormat();
    const formatName = format === 'html' ? 'HTML' : format === 'text' ? '纯文本' : 'Markdown';
    return `你是一名资深产品文档编辑。请根据用户要求优化下面的 ${formatName} 文档。

用户优化要求：
${instruction}

硬性要求：
- 只输出优化后的完整 ${formatName} 文档，不要输出解释或对话。
- 保留原文中的所有截图引用或 [截图N] 占位符，不要删除、重编号或改写图片链接。
- 保留事实边界，不要编造具体账号、金额、订单号、接口返回值等无法从原文判断的信息。
- 可以重排结构、补充说明、改写措辞、增加注意事项和常见问题。
- 保持简体中文，面向非技术人员，内容清晰、完整、可执行。

${this._getOutputFormatInstruction(format)}

原始 ${formatName} 文档：
${markdown}`;
  }

  _getEditorContent() {
    this._ensureEditorContentFresh();
    return document.getElementById('markdown-editor')?.value.trim() || '';
  }

  _resetOptimizationState() {
    this.originalBeforeOptimization = null;
    this._setRevertVisible(false);
  }

  _setRevertVisible(visible) {
    document.getElementById('btn-revert-optimization')?.classList.toggle('hidden', !visible);
  }

  _setOptimizeStatus(message, type) {
    const status = document.getElementById('optimize-status');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('hidden', 'error', 'success');
    status.classList.add(type);
  }

  _setOptimizeControls(disabled) {
    const runButton = document.getElementById('btn-run-optimize');
    const cancelButton = document.getElementById('btn-cancel-optimize');
    const closeButton = document.getElementById('btn-close-optimize');
    const instruction = document.getElementById('optimize-instruction');
    if (runButton) {
      runButton.disabled = disabled;
      runButton.textContent = disabled ? '优化中...' : '开始优化';
    }
    if (cancelButton) cancelButton.disabled = disabled;
    if (closeButton) closeButton.disabled = disabled;
    if (instruction) instruction.disabled = disabled;
  }

  downloadDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;
    const format = this._getOutputFormat();
    const extension = format === 'html' ? 'html' : format === 'text' ? 'txt' : 'md';
    const mimeType = format === 'html'
      ? 'text/html;charset=utf-8'
      : format === 'text'
        ? 'text/plain;charset=utf-8'
        : 'text/markdown;charset=utf-8';
    const blob = new Blob([format === 'html' ? this._buildStandaloneHtmlFromCurrentContent(content) : content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: `document_${Date.now()}.${extension}` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  exportHtmlDocument() {
    this._ensureEditorContentFresh();
    const content = document.getElementById('markdown-editor')?.value;
    if (!content) return;

    const html = this._buildStandaloneHtmlFromCurrentContent(content);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = createElement('a', { href: url, download: `document_${Date.now()}.html` });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    this._showNotification('HTML 文件已导出！', 'success');
  }

  _buildStandaloneHtmlFromCurrentContent(content) {
    const format = this._getOutputFormat();
    if (format === 'html') {
      return this._ensureStandaloneHtml(content);
    }
    if (format === 'text') {
      return this._buildStandaloneHtmlFromBody(`<pre>${this._escapeHtml(content)}</pre>`, 'Smart Page Scribe Document');
    }
    return this._buildStandaloneHtml(content);
  }

  _buildStandaloneHtml(markdown) {
    const bodyHtml = this._markdownToSafeHtml(markdown);
    const title = this._extractDocumentTitle(markdown);
    return this._buildStandaloneHtmlFromBody(bodyHtml, title);
  }

  _buildStandaloneHtmlFromBody(bodyHtml, title) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this._escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #ffffff;
      --code-bg: #f3f4f6;
      --accent: #2563eb;
    }
    body {
      margin: 0;
      background: #f9fafb;
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      padding: 40px 24px 56px;
      background: var(--surface);
      min-height: 100vh;
      box-sizing: border-box;
    }
    h1, h2, h3, h4 { line-height: 1.3; margin: 1.4em 0 0.6em; }
    h1 { padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
    a { color: var(--accent); }
    img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 16px 0;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    code {
      background: var(--code-bg);
      border-radius: 4px;
      padding: 2px 5px;
      font-family: Consolas, "SFMono-Regular", monospace;
      font-size: 0.92em;
    }
    pre { overflow: auto; padding: 14px 16px; background: var(--code-bg); border-radius: 6px; }
    pre code { padding: 0; background: transparent; }
    blockquote { color: var(--muted); padding-left: 14px; border-left: 4px solid var(--border); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border: 1px solid var(--border); text-align: left; }
  </style>
</head>
<body>
  <main>
${bodyHtml}
  </main>
</body>
</html>`;
  }

  _ensureStandaloneHtml(html) {
    const value = String(html || '').trim();
    if (/<!doctype html|<html[\s>]/i.test(value)) {
      return value;
    }
    const doc = new DOMParser().parseFromString(value, 'text/html');
    const title = doc.querySelector('h1')?.textContent?.trim() || 'Smart Page Scribe Document';
    return this._buildStandaloneHtmlFromBody(doc.body?.innerHTML || value, title);
  }

  _markdownToSafeHtml(markdown) {
    if (typeof marked === 'undefined') {
      return `<pre>${this._escapeHtml(markdown)}</pre>`;
    }

    marked.setOptions({ breaks: true, gfm: true });
    const rawHtml = marked.parse(markdown);
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, form, link, style').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      }
    });
    return doc.body.innerHTML;
  }

  _extractDocumentTitle(markdown) {
    const heading = markdown.split('\n').find(line => line.trim().startsWith('# '));
    return heading ? heading.replace(/^#\s+/, '').trim() : 'Smart Page Scribe Document';
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  newDocument() {
    this.session = null;
    this._resetOptimizationState();
    this._showEmptyState();
  }

  retry() {
    if (this.session) this._showDescriptionSelector(); else this._showEmptyState();
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  _showError(message) { alert(message); }
  _showNotification(message, type) { alert(message); }

  _formatUserFacingError(error, fallback) {
    if (error?.code === 'EXTENSION_CONTEXT_INVALIDATED') {
      return '扩展上下文已失效，请刷新当前页面后重试。';
    }
    if (error?.code === 'NETWORK_ERROR') {
      return error.message || '网络请求失败，请检查模型 API 地址、网络代理或服务商跨域设置。';
    }
    return error?.message || fallback;
  }

  cleanup() {
    this.cleanupFunctions.forEach(fn => fn());
    this.cleanupFunctions = [];
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let sidePanelManager = null;

document.addEventListener('DOMContentLoaded', () => { sidePanelManager = new SidePanelManager(); });

window.addEventListener('unload', () => { if (sidePanelManager) sidePanelManager.cleanup(); });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_AI_ANALYSIS' && sidePanelManager) {
    sidePanelManager.session = message.session;
    sidePanelManager.config = message.config;
    sidePanelManager._showDescriptionSelector();
  }
});
