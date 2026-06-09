const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSidePanelManager() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
  const sandbox = {
    console,
    DocumentApi: class {},
    DocUIHelper: class {},
    debounce: (fn) => fn,
    chrome: {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: () => Promise.resolve({})
      },
      storage: {
        sync: {
          get: () => Promise.resolve({})
        }
      },
      tabs: {
        query: () => Promise.resolve([])
      }
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null
    },
    window: {
      addEventListener: () => {},
      innerWidth: 1280,
      innerHeight: 800
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);
  return sandbox.SidePanelManager;
}

const SidePanelManager = loadSidePanelManager();

{
  const manager = Object.create(SidePanelManager.prototype);
  manager.language = 'en-US';
  manager.session = {
    steps: [
      {
        type: 'click',
        action: 'Open settings',
        elementName: 'Settings',
        selector: '#settings',
        screenshot: 'data:image/png;base64,AAAA',
        includeScreenshot: false
      }
    ]
  };

  const stepsText = manager._buildStepsText();
  const injected = manager._injectScreenshots('Before [Screenshot 1] after', 'markdown');

  assert.match(stepsText, /hidden by user/i);
  assert.doesNotMatch(injected, /data:image\/png;base64,AAAA/);
  assert.equal(injected, 'Before [Screenshot 1] after');
}

{
  const manager = Object.create(SidePanelManager.prototype);
  manager.language = 'en-US';
  manager._renderStepEditor = () => {};
  manager.session = {
    steps: [
      {
        type: 'click',
        action: 'Open settings',
        elementName: 'Settings',
        screenshot: 'data:image/png;base64,AAAA'
      },
      {
        type: 'input',
        action: 'Enter API key',
        elementName: 'API Key',
        selector: '#api-key',
        screenshot: 'data:image/png;base64,BBBB'
      }
    ]
  };

  manager._mergeStepWithNext(0);

  assert.equal(manager.session.steps.length, 1);
  assert.equal(manager.session.steps[0].type, 'merged');
  assert.match(manager.session.steps[0].action, /Open settings/);
  assert.match(manager.session.steps[0].action, /Enter API key/);
  assert.equal(manager.session.steps[0].screenshot, 'data:image/png;base64,BBBB');
  assert.equal(manager.session.steps[0].mergedCount, 2);
}

{
  const hidden = SidePanelManager.getStepScreenshotStatus({ screenshot: 'x', includeScreenshot: false });
  const available = SidePanelManager.getStepScreenshotStatus({ screenshot: 'x' });
  const missing = SidePanelManager.getStepScreenshotStatus({});

  assert.equal(hidden, 'hidden');
  assert.equal(available, 'available');
  assert.equal(missing, 'missing');
}
