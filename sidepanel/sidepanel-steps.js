/** Side panel steps behavior. Loaded before sidepanel.js. */
(globalThis.SmartPagesSidePanelModules ||= []).push(class {
  _renderStepEditor() {
    const container = document.getElementById('recorded-steps-list');
    const summary = document.getElementById('step-editor-summary');
    if (!container) return;

    const steps = this.session?.steps || [];
    const isEn = this.language === 'en-US';
    if (summary) {
      summary.textContent = steps.length
        ? (isEn
          ? `${steps.length} steps will be sent to AI. You can clean the flow first.`
          : `将发送 ${steps.length} 个步骤给 AI。生成前可先清理流程。`)
        : (isEn ? 'No recorded steps are available.' : '暂无可编辑的录制步骤。');
    }

    container.replaceChildren();
    if (!steps.length) {
      container.appendChild(createElement('div', { className: 'step-editor-empty' }, isEn ? 'No steps recorded.' : '暂无录制步骤。'));
      return;
    }

    steps.forEach((step, index) => {
      const stepNumber = index + 1;
      const textarea = createElement('textarea', {
        className: 'step-action-input',
        value: this._getStepEditableAction(step),
        'aria-label': isEn ? `Edit step ${stepNumber}` : `编辑步骤 ${stepNumber}`
      });
      textarea.addEventListener('input', () => {
        step.action = textarea.value.trim();
      });

      const header = createElement('div', { className: 'step-editor-item-header' }, [
        createElement('div', { className: 'step-editor-title' }, [
          createElement('strong', { textContent: isEn ? `Step ${stepNumber}` : `步骤 ${stepNumber}` }),
          createElement('span', { textContent: this._getStepTypeLabel(step.type) })
        ]),
        createElement('div', { className: 'step-editor-actions' }, [
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Up' : '上移',
            disabled: index === 0,
            onclick: () => this._moveStep(index, -1)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Down' : '下移',
            disabled: index === steps.length - 1,
            onclick: () => this._moveStep(index, 1)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: step.important ? (isEn ? 'Normal' : '普通') : (isEn ? 'Key' : '关键'),
            onclick: () => this._toggleStepImportant(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: SidePanelManager.getStepScreenshotStatus(step) === 'hidden'
              ? (isEn ? 'Show shot' : '显示截图')
              : (isEn ? 'Hide shot' : '隐藏截图'),
            disabled: !step.screenshot,
            onclick: () => this._toggleStepScreenshot(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn',
            textContent: isEn ? 'Merge next' : '合并下步',
            disabled: index === steps.length - 1,
            onclick: () => this._mergeStepWithNext(index)
          }),
          createElement('button', {
            type: 'button',
            className: 'step-action-btn step-action-danger',
            textContent: isEn ? 'Delete' : '删除',
            onclick: () => this._deleteStep(index)
          })
        ])
      ]);

      const meta = createElement('div', { className: 'step-editor-meta' }, this._getStepMeta(step));
      const screenshotPreview = this._createStepScreenshotPreview(step);
      container.appendChild(createElement('article', { className: 'step-editor-item' }, [
        header,
        screenshotPreview,
        textarea,
        meta
      ]));
    });
  }

  _createStepScreenshotPreview(step) {
    const status = SidePanelManager.getStepScreenshotStatus(step);
    const isEn = this.language === 'en-US';
    const statusText = {
      available: isEn ? 'Screenshot included' : '截图将随文档输出',
      hidden: isEn ? 'Screenshot hidden' : '截图已隐藏',
      missing: isEn ? 'No screenshot' : '无截图'
    }[status];
    const children = [
      createElement('span', { className: `step-screenshot-status ${status}`, textContent: statusText })
    ];
    if (status === 'available') {
      children.unshift(createElement('img', {
        className: 'step-screenshot-thumb',
        src: step.screenshot,
        alt: isEn ? 'Step screenshot preview' : '步骤截图预览'
      }));
    }
    return createElement('div', { className: 'step-screenshot-preview' }, children);
  }

  _getStepEditableAction(step) {
    if (!step) return '';
    if (step.action) return step.action;
    if (step.type === 'navigate') {
      return this.language === 'en-US'
        ? `Navigate from ${step.from || 'current page'} to ${step.to || 'new page'}`
        : `从 ${step.from || '当前页'} 跳转到 ${step.to || '新页面'}`;
    }
    if (step.type === 'scroll') {
      const percentY = Number.isFinite(step.scroll?.percentY) ? step.scroll.percentY : 0;
      return this.language === 'en-US'
        ? `Scroll to about ${percentY}% of the page`
        : `滚动到页面约 ${percentY}% 位置`;
    }
    return step.elementName || step.text || step.selector || '';
  }

  _getStepMeta(step) {
    const parts = [];
    const isEn = this.language === 'en-US';
    if (step.elementName || step.text) parts.push(`${isEn ? 'Element' : '元件'}: ${step.elementName || step.text}`);
    if (step.selector) parts.push(`${isEn ? 'Selector' : '选择器'}: ${step.selector}`);
    if (step.from || step.to) {
      parts.push(`${isEn ? 'Page' : '页面'}: ${step.from || (isEn ? 'current page' : '当前页')} -> ${step.to || (isEn ? 'new page' : '新页面')}`);
    }
    if (step.scroll) {
      const scroll = step.scroll;
      parts.push(`${isEn ? 'Scroll' : '滚动'}: x=${scroll.x || 0}, y=${scroll.y || 0}, ${scroll.percentY || 0}%`);
    }
    const formValueText = this._formatFormValue(step.formValue);
    if (formValueText !== '未记录') parts.push(`${isEn ? 'Value' : '值'}: ${formValueText}`);
    const selectionText = this._formatSelection(step.selection);
    if (selectionText !== '未记录') parts.push(`${isEn ? 'Selection' : '选择'}: ${selectionText}`);
    if (step.important) parts.push(isEn ? 'Marked as key step' : '已标记关键步骤');
    const screenshotStatus = SidePanelManager.getStepScreenshotStatus(step);
    if (screenshotStatus !== 'available') {
      parts.push(screenshotStatus === 'hidden'
        ? (isEn ? 'Screenshot hidden' : '截图已隐藏')
        : (isEn ? 'Screenshot missing' : '截图缺失'));
    }
    return parts.join(' · ') || (isEn ? 'No additional metadata' : '无更多元数据');
  }

  _getStepTypeLabel(type) {
    const labels = this.language === 'en-US'
      ? { click: 'Click', input: 'Input', change: 'Change', submit: 'Submit', navigate: 'Navigation', scroll: 'Scroll', merged: 'Merged' }
      : { click: '点击', input: '输入', change: '变更', submit: '提交', navigate: '跳转', scroll: '滚动', merged: '合并' };
    return labels[type] || (this.language === 'en-US' ? 'Action' : '操作');
  }

  _moveStep(index, offset) {
    const steps = this.session?.steps;
    const targetIndex = index + offset;
    if (!Array.isArray(steps) || targetIndex < 0 || targetIndex >= steps.length) return;
    const [step] = steps.splice(index, 1);
    steps.splice(targetIndex, 0, step);
    this._renderStepEditor();
  }

  _deleteStep(index) {
    const steps = this.session?.steps;
    if (!Array.isArray(steps) || index < 0 || index >= steps.length) return;
    steps.splice(index, 1);
    this._renderStepEditor();
  }

  _toggleStepImportant(index) {
    const step = this.session?.steps?.[index];
    if (!step) return;
    step.important = !step.important;
    this._renderStepEditor();
  }

  _toggleStepScreenshot(index) {
    const step = this.session?.steps?.[index];
    if (!step?.screenshot) return;
    step.includeScreenshot = step.includeScreenshot === false;
    this._renderStepEditor();
  }

  _mergeStepWithNext(index) {
    const steps = this.session?.steps;
    if (!Array.isArray(steps) || index < 0 || index >= steps.length - 1) return;

    const current = steps[index] || {};
    const next = steps[index + 1] || {};
    const currentAction = this._getStepEditableAction(current).trim();
    const nextAction = this._getStepEditableAction(next).trim();
    const action = [currentAction, nextAction].filter(Boolean).join('\n→ ');
    steps.splice(index, 2, {
      ...current,
      type: 'merged',
      action,
      elementName: [current.elementName || current.text, next.elementName || next.text].filter(Boolean).join(' / '),
      selector: next.selector || current.selector,
      rawSelector: next.rawSelector || current.rawSelector,
      x: Number.isFinite(next.x) ? next.x : current.x,
      y: Number.isFinite(next.y) ? next.y : current.y,
      screenshot: next.screenshot || current.screenshot,
      includeScreenshot: next.includeScreenshot === false && current.includeScreenshot === false ? false : undefined,
      important: Boolean(current.important || next.important),
      mergedCount: (current.mergedCount || 1) + (next.mergedCount || 1),
      mergedTypes: [...(current.mergedTypes || [current.type]).filter(Boolean), ...(next.mergedTypes || [next.type]).filter(Boolean)]
    });
    this._renderStepEditor();
  }

  async startRecordingHere() {
    try {
      const [tab] = await queryTabs({ active: true, currentWindow: true });
      if (!tab) throw new ExtensionError('无法获取当前标签页', 'TAB_ERROR');
      const response = await sendMessage({ type: 'START_RECORDING', tabId: tab.id });
      if (response?.error) throw new ExtensionError(response.error, 'RECORDING_ERROR');
      window.close();
    } catch (error) {
      this._showError(`${this._t('startFailed')}: ${error.message}`);
    }
  }
});
