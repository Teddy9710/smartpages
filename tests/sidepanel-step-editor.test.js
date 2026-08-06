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
    },
    Node: {
      TEXT_NODE: 3,
      ELEMENT_NODE: 1
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
  const manager = Object.create(SidePanelManager.prototype);
  const screenshot = 'data:image/png;base64,AAAA';
  manager.session = { steps: [{ screenshot }] };
  const image = {
    nodeType: 1,
    tagName: 'IMG',
    dataset: {},
    getAttribute: name => ({ alt: '步骤1截图', src: screenshot })[name] || ''
  };

  assert.equal(
    manager._nodeToMarkdown(image),
    `![步骤1截图](${screenshot})`,
    'switching to edit must preserve a session screenshot as an inline image'
  );
}

{
  const hidden = SidePanelManager.getStepScreenshotStatus({ screenshot: 'x', includeScreenshot: false });
  const available = SidePanelManager.getStepScreenshotStatus({ screenshot: 'x' });
  const missing = SidePanelManager.getStepScreenshotStatus({});

  assert.equal(hidden, 'hidden');
  assert.equal(available, 'available');
  assert.equal(missing, 'missing');
}

{
  const manager = Object.create(SidePanelManager.prototype);
  manager.language = 'en-US';
  manager.session = {
    steps: Array.from({ length: 15 }, (_, index) => ({
      screenshot: `data:image/png;base64,${String(index + 1).padStart(4, 'A')}`,
      includeScreenshot: index === 7 ? false : undefined
    }))
  };

  assert.equal(manager._getModelScreenshotInputs({ multimodalEnabled: false }).length, 0);
  const inputs = manager._getModelScreenshotInputs({ multimodalEnabled: true });
  assert.equal(inputs.length, 12);
  assert.match(inputs[0].label, /Screenshot 1/);
  assert.match(inputs.at(-1).label, /Screenshot 15/);
  assert.equal(inputs.some(input => /Screenshot 8\b/.test(input.label)), false);
}

{
  const manager = Object.create(SidePanelManager.prototype);
  const leakedAnalysis = `The user wants me to generate a Markdown user guide based on the recorded web operations.

Let me analyze the recorded steps:

Step 1: Open the user menu
Step 2: Click Profile

So the flow is: repository page to profile page.

# 打开 GitHub 个人主页

## 操作步骤

点击右上角头像。`;

  assert.equal(
    manager._normalizeGeneratedContent(leakedAnalysis, 'markdown'),
    '# 打开 GitHub 个人主页\n\n## 操作步骤\n\n点击右上角头像。'
  );
  assert.equal(
    manager._normalizeGeneratedContent('普通介绍段落。\n\n# 正式标题\n\n正文。', 'markdown'),
    '普通介绍段落。\n\n# 正式标题\n\n正文。',
    'normal introductory prose must not be removed'
  );
  assert.equal(
    manager._normalizeGeneratedContent('<think>internal reasoning</think>\n# 标题\n\n正文。', 'markdown'),
    '# 标题\n\n正文。'
  );
}
