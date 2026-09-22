/** Side panel generation behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
  async generateDocument() {
    if (this.isGenerating) return;
    this.isGenerating = true;
    const generateButton = document.getElementById('btn-generate');
    if (generateButton) generateButton.disabled = true;

    try {
      const selectedValue = document.querySelector('input[name="description"]:checked')?.value;
      let description = '';
      if (selectedValue === 'custom') {
        description = document.getElementById('custom-description')?.value?.trim();
        if (!description) { this._showError(this._t('customRequired')); return; }
      } else {
        const selectedDesc = DefaultDescriptions.find(d => d.value === selectedValue);
        description = selectedDesc?.description || '';
      }

      this.showLoadingState(this._t('generating'));
      const config = await loadConfig();
      this.config = config;
      if (!config.apiKey) throw new ExtensionError('请先在设置中配置API密钥', 'CONFIG_ERROR');
      if (!this.session?.steps?.length) throw new ExtensionError('没有可生成文档的录制步骤', 'EMPTY_STEPS');

      const prompt = this._limitPromptForModel(
        this._sanitizePromptForModel(this._buildGenerationPrompt(description, selectedValue, config)),
        config.maxInputTokens
      );
      const request = buildModelApiRequest(config, prompt, {
        temperature: 0.7,
        maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
        images: this._getModelScreenshotInputs(config)
      });
      const response = await fetchWithTimeout(
        request.url,
        request.fetchOptions,
        DOC_GEN_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const apiError = new ExtensionError(`API调用失败: ${errorData.error?.message || response.statusText}`, 'API_ERROR');
        apiError.status = response.status;
        throw apiError;
      }

      const data = await response.json();
      const outputFormat = this._getOutputFormat(config);
      const markdown = this._normalizeGeneratedContent(extractModelResponseText(data, getApiFormat(config)), outputFormat);
      if (!markdown) throw new ExtensionError('AI没有返回可用的文档内容', 'EMPTY_RESPONSE');
      this.localDocumentState = { fileName: null, dirty: true };
      this.cloudDocumentState = { id: null, revision: 0, dirty: true };
      this.showEditor();
      this._setEditorContent(this._injectScreenshots(markdown, outputFormat));
      this._resetOptimizationState();
      await this._saveGeneratedDocumentToHistory();
      if (await this.localDocuments.hasPermission().catch(() => false)) {
        await this.saveCurrentDocumentLocally();
      }
    } catch (error) {
      console.error('[Scribe:SidePanel] Generation failed:', error);
      this.showErrorState(this._formatUserFacingError(error, this._t('generationFailed')));
    } finally {
      this.isGenerating = false;
      if (generateButton) generateButton.disabled = false;
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
      prompt = `${styleReference}\n\n${prompt}`;
    }

    prompt += `\n\n${outputFormatInstruction}`;
    if (config.appLanguage === 'en-US') {
      prompt += '\n\nOutput language requirement: write the final document in clear English unless the user explicitly asks for another language. Output only the finished document; never include analysis, reasoning, planning notes, or phrases such as "The user wants" or "Let me analyze".';
    } else {
      prompt += '\n\n输出语言要求：除非用户明确要求其他语言，最终文档请使用简体中文。只输出完成后的正式文档，禁止输出分析、思考过程、写作计划，或 “The user wants”“Let me analyze” 等前言。';
    }

    return prompt;
  }

  _getOutputFormat(config = this.config) {
    if (typeof config === 'string') return this._normalizeOutputFormat(config);
    return this._normalizeOutputFormat(config?.outputFormat);
  }

  _normalizeOutputFormat(format) {
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
      const screenshotMarker = this._getStepScreenshotReference(step, num);
      if (step.type === 'navigate') {
        return [
          `步骤 ${num}｜页面跳转`,
          `- 来源页面：${step.from || '当前页'}`,
          `- 目标页面：${step.to || '新页面'}`,
          `- 截图：${screenshotMarker}`
        ].join('\n');
      }

      if (step.type === 'scroll') {
        const scroll = step.scroll || {};
        return [
          `步骤 ${num}｜页面滚动`,
          `- 操作描述：${step.action || '滚动页面以查看后续内容'}`,
          `- 滚动位置：x=${Number.isFinite(scroll.x) ? scroll.x : 0}, y=${Number.isFinite(scroll.y) ? scroll.y : 0}`,
          `- 页面进度：纵向约 ${Number.isFinite(scroll.percentY) ? scroll.percentY : 0}%`,
          `- 视口尺寸：${scroll.viewportWidth || '未知'} x ${scroll.viewportHeight || '未知'}`,
          `- 页面语义快照：\n${this._formatPageSnapshot(step.pageSnapshot)}`,
          `- 截图：${screenshotMarker}`
        ].join('\n');
      }

      const actionTypeLabel = {
        click: '用户点击',
        input: '用户输入',
        change: '用户变更',
        submit: '表单提交',
        merged: '合并操作'
      }[step.type] || '用户操作';

      return [
        `步骤 ${num}｜${actionTypeLabel}`,
        step.important ? '- 重要性：关键步骤' : '',
        step.mergedCount ? `- 合并来源：${step.mergedCount} 个连续步骤` : '',
        `- 操作描述：${step.action || '点击页面元素'}`,
        `- 元件名称：${step.elementName || step.text || '未识别名称'}`,
        `- 元件角色：${step.elementRole || '未知'}`,
        `- 元件类型：${step.elementType || step.tagName || '未知'}`,
        `- 元件状态：${this._formatElementState(step.elementState)}`,
        `- 表单值：${this._formatFormValue(step.formValue)}`,
        `- 选择项：${this._formatSelection(step.selection)}`,
        `- HTML 标签：${step.tagName || '未知'}`,
        `- CSS 选择器：${step.selector || '未记录'}`,
        `- 原始点击选择器：${step.rawSelector || step.selector || '未记录'}`,
        `- 点击坐标：${Number.isFinite(step.x) && Number.isFinite(step.y) ? `${step.x}, ${step.y}` : '未记录'}`,
        `- 页面语义快照：\n${this._formatPageSnapshot(step.pageSnapshot)}`,
        `- 截图：${screenshotMarker}`
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  _getStepScreenshotReference(step, stepNumber) {
    const status = SidePanelManager.getStepScreenshotStatus(step);
    if (status === 'hidden') return 'hidden by user';
    if (status === 'missing') return 'missing';
    return `[截图${stepNumber}]`;
  }

  _getModelScreenshotInputs(config = this.config) {
    if (!config?.multimodalEnabled || !this.session?.steps?.length) return [];

    const candidates = this.session.steps
      .map((step, index) => ({ step, stepNumber: index + 1 }))
      .filter(({ step }) => SidePanelManager.getStepScreenshotStatus(step) === 'available')
      .map(({ step, stepNumber }) => ({
        dataUrl: step.screenshot,
        label: this.language === 'en-US'
          ? `[Screenshot ${stepNumber}] Page screenshot for recorded step ${stepNumber}.`
          : `[截图${stepNumber}] 录制步骤 ${stepNumber} 对应的页面截图。`
      }));

    const limit = typeof MAX_MODEL_SCREENSHOTS === 'number' ? MAX_MODEL_SCREENSHOTS : 12;
    if (candidates.length <= limit) return candidates;

    const sampled = [];
    for (let index = 0; index < limit; index += 1) {
      const candidateIndex = Math.round(index * (candidates.length - 1) / (limit - 1));
      sampled.push(candidates[candidateIndex]);
    }
    return sampled;
  }

  _formatElementState(state) {
    if (!state || typeof state !== 'object') return '未记录';
    const entries = Object.entries(state).filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!entries.length) return '未记录';
    return entries.map(([key, value]) => `${key}=${value}`).join(', ');
  }

  _formatFormValue(formValue) {
    if (!formValue || typeof formValue !== 'object') return '未记录';

    if (formValue.kind === 'select') {
      const selectedText = Array.isArray(formValue.selectedText) ? formValue.selectedText.filter(Boolean) : [];
      const selectedValue = Array.isArray(formValue.selectedValue) ? formValue.selectedValue.filter(Boolean) : [];
      if (selectedText.length) return `已选择：${selectedText.join('、')}`;
      if (selectedValue.length) return `已选择值：${selectedValue.join('、')}`;
      return '未选择';
    }

    if (formValue.kind === 'checkbox' || formValue.kind === 'radio') {
      const state = formValue.checked ? '已选中' : '未选中';
      const label = formValue.label ? `，选项：${formValue.label}` : '';
      const value = formValue.value ? `，值：${formValue.value}` : '';
      return `${state}${label}${value}`;
    }

    if (formValue.isSensitive) {
      return formValue.valueLength ? `已输入敏感内容（${formValue.valueLength} 个字符，已脱敏）` : '未输入';
    }

    if (formValue.value) return `输入内容：${formValue.value}`;
    if (Number.isFinite(formValue.valueLength)) return formValue.valueLength ? `已输入 ${formValue.valueLength} 个字符` : '未输入';
    return '未记录';
  }

  _formatSelection(selection) {
    if (!selection || typeof selection !== 'object') return '未记录';
    const parts = [];
    if (selection.containerLabel) parts.push(`容器：${selection.containerLabel}`);
    if (selection.selectedText) parts.push(`选项：${selection.selectedText}`);
    if (selection.selectedValue) parts.push(`值：${selection.selectedValue}`);
    if (selection.selectedState) parts.push(`状态：${selection.selectedState}`);
    return parts.length ? parts.join('，') : '未记录';
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
    return this._injectScreenshotPlaceholdersFixed(content, format);
  }

  _injectScreenshotPlaceholdersFixed(content, format = this._getOutputFormat()) {
    let result = String(content || '');
    this.session.steps.forEach((step, index) => {
      if (!step.screenshot) return;
      if (SidePanelManager.getStepScreenshotStatus(step) === 'hidden') return;
      const stepNumber = index + 1;
      const placeholder = `[截图${stepNumber}]`;
      const englishPlaceholder = `[Screenshot ${stepNumber}]`;
      const imgTag = format === 'html'
        ? `<img alt="步骤${stepNumber}截图" src="${step.screenshot}">`
        : `![步骤${stepNumber}截图](${step.screenshot})`;
      result = result.replace(
        new RegExp('(<img\\b[^>]*?\\bsrc=["\\\'])\\s*(?:\\[截图' + stepNumber + '\\]|\\[Screenshot\\s*' + stepNumber + '\\])\\s*(["\\\'][^>]*>)', 'gi'),
        '$1' + step.screenshot + '$2'
      );
      result = result.split(placeholder).join(imgTag);
      result = result.split(englishPlaceholder).join(imgTag);
    });
    return result;
  }

  _getScreenshotMarker(stepNumber) {
    return `[截图${stepNumber}]`;
  }

  _getScreenshotMarkerFromAlt(alt) {
    const match = String(alt || '').match(/(?:步骤|step)?\s*(\d+)\s*(?:截图|screenshot)?/i);
    if (!match) return '';
    const stepNumber = Number.parseInt(match[1], 10);
    return Number.isFinite(stepNumber) ? this._getScreenshotMarker(stepNumber) : '';
  }

  _prepareContentForModel(content) {
    let screenshotIndex = 0;
    const nextMarker = () => {
      screenshotIndex += 1;
      return this._getScreenshotMarker(screenshotIndex);
    };

    return String(content || '')
      .replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/gi, (_match, alt) => this._getScreenshotMarkerFromAlt(alt) || nextMarker())
      .replace(/<img\b[^>]*>/gi, (imgTag) => {
        const srcMatch = imgTag.match(/\bsrc=(["'])data:image\/[\s\S]*?\1/i);
        if (!srcMatch) return imgTag;
        const altMatch = imgTag.match(/\balt=(["'])([\s\S]*?)\1/i);
        return this._getScreenshotMarkerFromAlt(altMatch?.[2] || '') || nextMarker();
      })
      .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[图片内容已省略]');
  }

  _sanitizePromptForModel(content) {
    return this._sanitizeSensitiveText(content);
  }

  _sanitizeSensitiveText(content) {
    let value = String(content || '');
    const labeledSecretPattern = /((?:api[-_\s]?key|secret|token|access[-_\s]?token|refresh[-_\s]?token|authorization|bearer|password|passwd|pwd|验证码|校验码|动态码|密码|口令|密钥|令牌|身份证|证件号|手机号|手机|电话|邮箱|email|phone)\s*[:：=]\s*)([^,\s;，。]+)/gi;

    value = value
      .replace(labeledSecretPattern, '$1[已脱敏]')
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[API Key 已脱敏]')
      .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[API Key 已脱敏]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[Token 已脱敏]')
      .replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '[Token 已脱敏]')
      .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[JWT 已脱敏]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已脱敏]')
      .replace(/(^|[^\d])((?:\+?86[-\s]?)?1[3-9]\d{9})(?!\d)/g, '$1[手机号已脱敏]')
      .replace(/(^|[^\d])(\d{17}[\dXx])(?!\d)/g, '$1[身份证号已脱敏]');

    return value;
  }

  _limitPromptForModel(content, maxInputTokens = DEFAULT_MAX_INPUT_TOKENS) {
    const tokenBudget = Number.isFinite(Number(maxInputTokens))
      ? Math.min(Math.max(Number(maxInputTokens), MIN_MAX_INPUT_TOKENS), MAX_MAX_INPUT_TOKENS)
      : DEFAULT_MAX_INPUT_TOKENS;
    const charBudget = tokenBudget * 4;
    const value = String(content || '');
    if (value.length <= charBudget) return value;

    const marker = `\n\n[中间内容因超过最大输入 Token 预算已省略，当前预算：${tokenBudget} tokens]\n\n`;
    const remaining = Math.max(charBudget - marker.length, 1000);
    const headLength = Math.floor(remaining * 0.65);
    const tailLength = remaining - headLength;
    return value.slice(0, headLength) + marker + value.slice(-tailLength);
  }
});
