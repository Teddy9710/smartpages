const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor({ role = '', name = '', tagName = 'BUTTON', visible = true, value = '', options = [], type = '', href = '', id = '', ariaLabel = '', labelledBy = '' } = {}) {
    this.role = role;
    this.tagName = tagName;
    this.textContent = name;
    this.value = value;
    this.options = options.map(option => ({ value: option }));
    this.visible = visible;
    this.events = [];
    this.clicked = 0;
    this.focused = false;
    this.labels = [];
    this.type = type;
    this.href = href;
    this.id = id;
    this.ariaLabel = ariaLabel;
    this.labelledBy = labelledBy;
  }
  getAttribute(name) {
    const values = { role: this.role, 'aria-label': this.ariaLabel, 'aria-labelledby': this.labelledBy, type: this.type, href: this.href, id: this.id };
    return values[name] || null;
  }
  getBoundingClientRect() { return this.visible ? { width: 10, height: 10 } : { width: 0, height: 0 }; }
  click() { this.clicked += 1; }
  focus() { this.focused = true; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
}

function createEnvironment() {
  const selectors = new Map();
  const elements = [];
  const listeners = [];
  const removed = [];
  const assigned = [];
  const scrolls = [];
  const waits = [];
  const document = {
    querySelector(selector) {
      if (selector === '[invalid') throw new SyntaxError('invalid selector');
      return selectors.get(selector) || null;
    },
    querySelectorAll(selector) {
      const role = /^\[role="(.+)"\]$/.exec(selector)?.[1];
      return role ? elements.filter(element => element.role === role) : elements;
    },
    getElementById(id) { return elements.find(element => element.id === id) || null; },
  };
  const location = { href: 'https://example.com/start', origin: 'https://example.com', pathname: '/start', assign: url => assigned.push(url) };
  const chrome = { runtime: { onMessage: {
    addListener(listener) { listeners.push(listener); },
    removeListener(listener) { removed.push(listener); },
  } } };
  function Event(type, init) { this.type = type; this.bubbles = init?.bubbles; }
  const sandbox = { console, URL, document, location, chrome, Event, Element: FakeElement,
    getComputedStyle: element => ({ display: element.visible ? 'block' : 'none', visibility: 'visible', opacity: '1' }),
    scrollTo: (x, y) => scrolls.push([x, y]),
    setTimeout: (callback, ms) => { waits.push(ms); callback(); return 1; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const source = fs.readFileSync(path.join(__dirname, '..', 'content/workflow-replayer.js'), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'content/workflow-replayer.js' });
  return { api: sandbox.SmartPagesWorkflowReplayer, sandbox, selectors, elements, listeners, removed, assigned, scrolls, waits };
}

const context = { variables: { username: 'Ada' }, allowedOrigins: ['https://example.com'] };
const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  const env = createEnvironment();
  const button = new FakeElement();
  env.selectors.set('#save', button);
  assert.deepEqual(plain(await env.api.executeStep({ action: 'click', target: { selector: '#save' } }, context)), { ok: true, code: 'STEP_COMPLETED' });
  assert.equal(button.clicked, 1);
  assert.equal(env.api.checkCondition({ type: 'url', value: 'https://example.com/start' }), true);
  assert.equal(env.api.checkCondition({ type: 'visible', selector: '#save' }), true);
  assert.equal(env.api.checkCondition({ type: 'hidden', selector: '#save' }), false);

  const rawButton = new FakeElement();
  env.selectors.set('.raw-save', rawButton);
  assert.equal((await env.api.executeStep({ action: 'click', target: { selector: '.missing', rawSelector: '.raw-save' } }, context)).ok, true);
  assert.equal(rawButton.clicked, 1);

  const implicitButton = new FakeElement({ tagName: 'BUTTON', name: 'Native Save' });
  env.elements.push(implicitButton);
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'button', name: 'native save' } }, context)).ok, true);
  assert.equal(implicitButton.clicked, 1);

  const overriddenButton = new FakeElement({ tagName: 'BUTTON', role: 'link', name: 'Override Link' });
  env.elements.push(overriddenButton);
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'button', name: 'override link' } }, context)).code, 'TARGET_NOT_FOUND');
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'link', name: 'override link' } }, context)).ok, true);

  const labelledText = new FakeElement({ tagName: 'SPAN', name: 'Referenced Name', id: 'reference' });
  const labelledButton = new FakeElement({ tagName: 'BUTTON', ariaLabel: 'Conflicting Name', labelledBy: 'reference' });
  env.elements.push(labelledText, labelledButton);
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'button', name: 'referenced name' } }, context)).ok, true);

  const labelledInput = new FakeElement({ tagName: 'INPUT', type: 'text', value: 'typed secret' });
  labelledInput.labels = [{ textContent: 'Account Name' }];
  env.elements.push(labelledInput);
  assert.equal(env.api.findTarget({ role: 'textbox', name: 'account name' }).ok, true);
  assert.equal(env.api.findTarget({ role: 'textbox', name: 'typed secret' }).code, 'TARGET_NOT_FOUND');
  assert.equal((await env.api.executeStep({ action: 'click', target: { selector: '#save', rawSelector: '.raw-save' } }, context)).ok, true);
  assert.equal(button.clicked, 2);
  assert.equal(rawButton.clicked, 1);

  const input = new FakeElement({ tagName: 'INPUT' });
  env.selectors.set('#name', input);
  assert.equal((await env.api.executeStep({ action: 'input', target: { selector: '#name' }, input: { value: { variable: 'username' } } }, context)).ok, true);
  assert.equal(input.value, 'Ada');
  assert.deepEqual(input.events, ['input', 'change']);

  const converterSource = fs.readFileSync(path.join(__dirname, '..', 'workflow/converter.js'), 'utf8');
  vm.runInNewContext(converterSource, env.sandbox, { filename: 'workflow/converter.js' });
  const convertedInputStep = env.sandbox.SmartPagesWorkflowConverter.convertSession({
    pageUrl: 'https://example.com/start',
    steps: [{ type: 'input', selector: '#name', elementName: 'Display name', value: 'recorded-secret' }],
  }).workflow.steps[0];
  input.value = '';
  assert.equal((await env.api.executeStep(convertedInputStep, {
    variables: { 'display-name': 'Grace' },
    allowedOrigins: ['https://example.com'],
  })).ok, true);
  assert.equal(input.value, 'Grace');
  assert.notEqual(input.value, '{variable:display-name}');
  assert.equal((await env.api.executeStep(convertedInputStep, {
    variables: {},
    allowedOrigins: ['https://example.com'],
  })).code, 'MISSING_VARIABLE');

  const select = new FakeElement({ tagName: 'SELECT', options: ['cn', 'us'] });
  env.selectors.set('#country', select);
  assert.equal((await env.api.executeStep({ action: 'select', target: { selector: '#country' }, input: { value: 'cn' } }, context)).ok, true);
  assert.equal(select.value, 'cn');
  assert.equal((await env.api.executeStep({ action: 'select', target: { selector: '#country' }, input: { value: 'xx' } }, context)).code, 'INVALID_OPTION');

  const semantic = new FakeElement({ role: 'button', name: '  Submit   Order ' });
  env.elements.push(semantic);
  assert.equal((await env.api.executeStep({ action: 'click', target: { selector: '[invalid', rawSelector: '.missing', role: 'button', name: 'submit order' } }, context)).ok, true);
  env.elements.push(new FakeElement({ role: 'button', name: 'SUBMIT ORDER' }));
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'button', name: 'submit order' } }, context)).code, 'AMBIGUOUS_TARGET');
  env.elements.push(new FakeElement({ role: 'link', name: 'Only visible match', visible: false }));
  const visibleLink = new FakeElement({ role: 'link', name: 'Only visible match' });
  env.elements.push(visibleLink);
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'link', name: 'only visible match' } }, context)).ok, true);
  assert.equal(visibleLink.clicked, 1);
  assert.equal((await env.api.executeStep({ action: 'click', target: { role: 'link', name: 'missing' } }, context)).code, 'TARGET_NOT_FOUND');

  assert.equal((await env.api.executeStep({ action: 'assert', precondition: { type: 'url', value: 'https://example.com/nope' } }, context)).code, 'PRECONDITION_FAILED');
  assert.equal((await env.api.executeStep({ action: 'click', target: { selector: '#save' }, postcondition: { type: 'visible', selector: '#missing' } }, context)).code, 'POSTCONDITION_FAILED');
  assert.equal((await env.api.executeStep({ action: 'assert' }, { ...context, allowedOrigins: ['https://other.example'] })).code, 'ORIGIN_NOT_ALLOWED');

  assert.equal((await env.api.executeStep({ action: 'navigate', input: { url: 'https://evil.example/x' } }, context)).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(env.assigned.length, 0);
  assert.deepEqual(plain(await env.api.executeStep({ action: 'navigate', input: { url: 'https://example.com/next' } }, context)), { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true });
  assert.deepEqual(env.assigned, ['https://example.com/next']);
  assert.deepEqual(plain(await env.api.executeStep({ action: 'navigate', input: { url: { variable: 'destination' } } }, {
    ...context,
    variables: { destination: 'https://example.com/from-variable' },
  })), { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true });
  assert.equal(env.assigned.at(-1), 'https://example.com/from-variable');
  assert.deepEqual(plain(await env.api.executeStep({ action: 'navigate', input: { url: 'https://example.com/final' }, postcondition: { type: 'url', value: 'https://example.com/final' } }, context)), { ok: true, code: 'NAVIGATION_STARTED', postconditionPending: true });

  assert.equal((await env.api.executeStep({ action: 'scroll', input: { x: 'bad', y: 12 } }, context)).ok, true);
  assert.deepEqual(env.scrolls.at(-1), [0, 12]);
  assert.equal((await env.api.executeStep({ action: 'wait', input: { ms: 50000 } }, context)).ok, true);
  assert.equal(env.waits.at(-1), 10000);
  assert.deepEqual(plain(await env.api.executeStep({ action: 'assert', condition: { type: 'hidden', selector: '#missing' } }, context)), { ok: true, code: 'STEP_COMPLETED' });
  assert.equal((await env.api.executeStep({ action: 'assert', condition: { type: 'visible', selector: '#missing' } }, context)).code, 'PRECONDITION_FAILED');
  assert.equal((await env.api.executeStep({ action: 'input', target: { selector: '#name' }, input: { value: { variable: 'absent' } } }, context)).code, 'MISSING_VARIABLE');
  assert.equal((await env.api.executeStep({ action: 'dance' }, context)).code, 'UNSUPPORTED_ACTION');

  const oldListener = () => {};
  env.sandbox.smartPagesWorkflowReplayListener = oldListener;
  const source = fs.readFileSync(path.join(__dirname, '..', 'content/workflow-replayer.js'), 'utf8');
  vm.runInNewContext(source, env.sandbox);
  assert.equal(env.removed.includes(oldListener), true);
  const listener = env.sandbox.smartPagesWorkflowReplayListener;
  assert.equal(listener({ type: 'UNRELATED' }, {}, () => assert.fail('must not respond')), false);
  let response;
  assert.equal(listener({ type: 'WORKFLOW_EXECUTE_STEP', step: { action: 'assert' }, context }, {}, value => { response = value; }), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(response.code, 'STEP_COMPLETED');

  console.log('workflow-replayer tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
