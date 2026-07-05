(function (global) {
  'use strict';

  const fail = (code, message) => ({ ok: false, code, message });
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function isVisible(element) {
    if (!element) return false;
    const style = global.getComputedStyle ? global.getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function accessibleName(element) {
    const labelled = element.getAttribute?.('aria-labelledby');
    const labelledText = labelled && global.document.getElementById
      ? labelled.split(/\s+/).map(id => global.document.getElementById(id)?.textContent || '').join(' ')
      : '';
    const labelText = element.labels?.length
      ? Array.from(element.labels).map(label => label.textContent || '').join(' ')
      : '';
    return normalize(element.getAttribute?.('aria-label') || labelledText || labelText ||
      element.textContent || element.value || element.getAttribute?.('value'));
  }

  function findTarget(target) {
    const locator = typeof target === 'string' ? { selector: target } : (target || {});
    for (const method of ['selector', 'rawSelector']) {
      if (!locator[method]) continue;
      try {
        const element = global.document.querySelector(locator[method]);
        if (element) return { ok: true, element, method };
      } catch (_error) { /* Invalid recorded selectors are allowed to fall back. */ }
    }

    if (!locator.role && !locator.name) return fail('TARGET_NOT_FOUND', 'Target was not found.');
    let candidates;
    try {
      candidates = Array.from(locator.role
        ? global.document.querySelectorAll(`[role="${String(locator.role).replace(/["\\]/g, '\\$&')}"]`)
        : global.document.querySelectorAll('*'));
    } catch (_error) {
      candidates = [];
    }
    candidates = candidates.filter(element => isVisible(element) &&
      (!locator.name || accessibleName(element) === normalize(locator.name)));
    if (candidates.length === 1) return { ok: true, element: candidates[0], method: 'semantic' };
    if (candidates.length > 1) return fail('AMBIGUOUS_TARGET', 'Semantic target matched multiple visible elements.');
    return fail('TARGET_NOT_FOUND', 'Target was not found.');
  }

  function conditionUrlMatches(condition) {
    if (condition.value || condition.url) return global.location.href === (condition.value || condition.url);
    if (condition.origin !== undefined && global.location.origin !== condition.origin) return false;
    if (condition.path !== undefined && global.location.pathname !== condition.path) return false;
    return condition.origin !== undefined || condition.path !== undefined;
  }

  function checkCondition(condition) {
    if (!condition) return true;
    if (Array.isArray(condition)) return condition.every(checkCondition);
    if (condition.type === 'url') return conditionUrlMatches(condition);
    if (condition.type === 'visible' || condition.type === 'hidden') {
      let element = null;
      try { element = global.document.querySelector(condition.selector); } catch (_error) { return condition.type === 'hidden'; }
      return condition.type === 'visible' ? isVisible(element) : !isVisible(element);
    }
    return false;
  }

  function originAllowed(url, origins) {
    const schema = global.SmartPagesWorkflowSchema;
    if (schema?.isOriginAllowed) return schema.isOriginAllowed(url, origins);
    if (!Array.isArray(origins)) return false;
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && origins.some(origin => {
        try { return !String(origin).includes('*') && new URL(origin).origin === origin && origin === parsed.origin; }
        catch (_error) { return false; }
      });
    } catch (_error) { return false; }
  }

  function resolveValue(value, variables) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'variable')) {
      if (!variables || !Object.hasOwn(variables, value.variable)) return fail('MISSING_VARIABLE', `Variable ${String(value.variable)} is missing.`);
      return { ok: true, value: variables[value.variable] };
    }
    return { ok: true, value };
  }

  function setNativeValue(element, value) {
    let prototype = Object.getPrototypeOf(element);
    while (prototype) {
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) { setter.call(element, value); return; }
      prototype = Object.getPrototypeOf(prototype);
    }
    element.value = value;
  }

  async function executeStep(step, context = {}) {
    if (!originAllowed(global.location.href, context.allowedOrigins)) {
      return fail('ORIGIN_NOT_ALLOWED', 'Current page origin is not allowed.');
    }
    if (!step || !['click', 'input', 'select', 'scroll', 'wait', 'assert', 'navigate'].includes(step.action)) {
      return fail('UNSUPPORTED_ACTION', `Unsupported action: ${String(step?.action)}.`);
    }
    const precondition = step.precondition ?? step.preconditions;
    if (!checkCondition(precondition)) return fail('PRECONDITION_FAILED', 'Step precondition failed.');

    const needsTarget = ['click', 'input', 'select'].includes(step.action);
    const located = needsTarget ? findTarget(step.target) : null;
    if (needsTarget && !located.ok) return located;
    const input = step.input || {};
    const resolved = resolveValue(Object.hasOwn(input, 'value') ? input.value : step.value, context.variables);
    if (!resolved.ok) return resolved;

    if (step.action === 'click') located.element.click();
    if (step.action === 'input') {
      located.element.focus?.();
      setNativeValue(located.element, String(resolved.value ?? ''));
      located.element.dispatchEvent(new global.Event('input', { bubbles: true }));
      located.element.dispatchEvent(new global.Event('change', { bubbles: true }));
    }
    if (step.action === 'select') {
      const value = String(resolved.value ?? '');
      if (!Array.from(located.element.options || []).some(option => String(option.value) === value)) {
        return fail('INVALID_OPTION', 'Select option does not exist.');
      }
      setNativeValue(located.element, value);
      located.element.dispatchEvent(new global.Event('change', { bubbles: true }));
    }
    if (step.action === 'scroll') {
      const x = Number(input.x);
      const y = Number(input.y);
      global.scrollTo(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
    }
    if (step.action === 'wait') {
      const ms = Number(input.ms);
      await new Promise(resolve => global.setTimeout(resolve, Math.min(Math.max(Number.isFinite(ms) ? ms : 0, 0), 10000)));
    }
    if (step.action === 'navigate') {
      const url = input.url;
      if (typeof url !== 'string' || !originAllowed(url, context.allowedOrigins)) {
        return fail('ORIGIN_NOT_ALLOWED', 'Navigation origin is not allowed.');
      }
      global.location.assign(url);
      const navigationPostcondition = step.postcondition ?? step.postconditions;
      return {
        ok: true,
        code: 'NAVIGATION_STARTED',
        postconditionPending: Boolean(navigationPostcondition && Object.keys(navigationPostcondition).length),
      };
    }
    const condition = step.action === 'assert' ? (step.condition ?? step.conditions) : null;
    if (condition && !checkCondition(condition)) return fail('PRECONDITION_FAILED', 'Assertion failed.');
    const postcondition = step.postcondition ?? step.postconditions;
    if (!checkCondition(postcondition)) return fail('POSTCONDITION_FAILED', 'Step postcondition failed.');
    return { ok: true, code: 'STEP_COMPLETED' };
  }

  const api = Object.freeze({ findTarget, checkCondition, executeStep });
  global.SmartPagesWorkflowReplayer = api;

  if (global.chrome?.runtime?.onMessage) {
    if (global.smartPagesWorkflowReplayListener) {
      global.chrome.runtime.onMessage.removeListener(global.smartPagesWorkflowReplayListener);
    }
    global.smartPagesWorkflowReplayListener = function (message, _sender, sendResponse) {
      if (message?.type !== 'WORKFLOW_EXECUTE_STEP') return false;
      Promise.resolve(executeStep(message.step, message.context || {
        variables: message.variables,
        allowedOrigins: message.allowedOrigins,
      })).then(sendResponse, error => sendResponse(fail('EXECUTION_FAILED', String(error?.message || error))));
      return true;
    };
    global.chrome.runtime.onMessage.addListener(global.smartPagesWorkflowReplayListener);
  }
})(globalThis);
