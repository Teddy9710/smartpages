(function (global) {
  'use strict';

  const HIGH_RISK = /submit|save|send|delete|remove|pay|purchase|confirm|提交|保存|发送|删除|移除|支付|购买|确认/i;
  const SECRET = /password|passcode|token|secret|api[\s_-]*key|密码|密钥/i;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function slug(value, fallback) {
    const result = String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return result || fallback;
  }

  function actionFor(step) {
    if (step.type === 'navigate') return 'navigate';
    if (step.type === 'scroll') return 'scroll';
    if (step.type === 'input') return 'input';
    if (step.type === 'select') return 'select';
    if (step.type === 'change') {
      const kind = `${step.elementRole || ''} ${step.tagName || ''} ${step.elementType || ''}`;
      return /select|combobox/i.test(kind) ? 'select' : 'input';
    }
    return 'click';
  }

  function targetFor(step) {
    const target = {};
    if (step.selector) target.selector = String(step.selector);
    if (step.rawSelector) target.rawSelector = String(step.rawSelector);
    if (step.elementRole) target.role = String(step.elementRole);
    if (step.elementName) target.name = String(step.elementName);
    else if (step.text) target.text = String(step.text);
    if (step.tagName) target.tagName = String(step.tagName);
    if (step.elementType) target.elementType = String(step.elementType);
    return target;
  }

  function variableLabel(step, index) {
    return step.elementName || step.name || step.elementRole || step.elementType || step.tagName || `value-${index + 1}`;
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function convertSession(session, options) {
    options = options || {};
    if (!session || !Array.isArray(session.steps) || session.steps.length === 0) {
      fail('EMPTY_SESSION', 'Session must contain at least one recorded step.');
    }

    let page;
    try {
      page = new URL(session.pageUrl);
      if (page.protocol !== 'http:' && page.protocol !== 'https:') throw new Error('unsupported protocol');
    } catch (_error) {
      fail('INVALID_PAGE_URL', 'Session pageUrl must be a valid HTTP or HTTPS URL.');
    }

    const workflowId = slug(options.workflowId || session.sessionId || session.title, 'recorded-workflow');
    const variables = [];
    const variableNames = new Set();
    const steps = session.steps.map((recorded, index) => {
      const action = actionFor(recorded);
      const riskText = `${recorded.elementType || ''} ${recorded.elementName || ''} ${recorded.name || ''} ${recorded.action || ''} ${recorded.text || ''}`;
      const step = {
        id: `step-${index + 1}`,
        action,
        risk: HIGH_RISK.test(riskText) ? 'high' : 'low',
      };

      if (index === 0) step.preconditions = [{ type: 'url', url: session.pageUrl }];
      if (action === 'navigate') {
        step.input = { url: recorded.to || recorded.url || session.pageUrl };
      } else if (action === 'scroll') {
        step.input = {
          x: finiteNumber(recorded.scroll?.x ?? recorded.x ?? 0),
          y: finiteNumber(recorded.scroll?.y ?? recorded.y ?? 0),
        };
      } else {
        step.target = targetFor(recorded);
        if (action === 'input' || action === 'select') {
          const label = variableLabel(recorded, index);
          const baseName = slug(label, `value-${index + 1}`);
          let name = baseName;
          let suffix = 2;
          while (variableNames.has(name)) name = `${baseName}-${suffix++}`;
          variableNames.add(name);
          variables.push({ name, required: true, secret: SECRET.test(`${label} ${recorded.elementType || ''}`) });
          step.input = { value: { variable: name } };
        }
      }
      return step;
    });

    const workflow = {
      schemaVersion: '1.0',
      workflowId,
      workflowVersion: 1,
      title: options.title || session.pageTitle || 'SmartPages workflow',
      generatedAt: options.now || new Date().toISOString(),
      allowedOrigins: [page.origin],
      variables,
      steps,
    };

    const schema = global.SmartPagesWorkflowSchema;
    if (schema && typeof schema.validateWorkflow === 'function') {
      const validation = schema.validateWorkflow(workflow);
      if (!validation.ok) fail('INVALID_GENERATED_WORKFLOW', `Generated workflow is invalid: ${validation.code}.`);
    }

    return { workflow, markdownLink: `${workflowId}.smartpages.json` };
  }

  global.SmartPagesWorkflowConverter = Object.freeze({ convertSession });
})(globalThis);
