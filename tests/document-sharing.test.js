const assert = require('node:assert/strict');
const { DocUIHelper } = require('../utils/docUIUtils.js');

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalDocument = globalThis.document;
const notifications = [];

globalThis.document = { documentElement: { lang: 'zh-CN' } };

const helper = new DocUIHelper({
  getApi: () => ({
    async getDocumentContent() {
      return {
        success: true,
        document: { name: 'guide.pdf', content: '完整文档正文' }
      };
    }
  }),
  onNotify: (message, type) => notifications.push({ message, type })
});

(async () => {
  let sharedData = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      canShare: data => Array.isArray(data.files),
      share: async data => { sharedData = data; }
    }
  });
  await helper.shareDocument('doc-1');
  assert.equal(sharedData.title, 'guide.pdf');
  assert.equal(sharedData.files?.[0]?.name, 'guide-SmartPages.txt');
  assert.equal(notifications.at(-1).type, 'success');

  let copiedText = '';
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async text => { copiedText = text; } } }
  });
  await helper.shareDocument('doc-1');
  assert.equal(copiedText, '完整文档正文');
  assert.match(notifications.at(-1).message, /已复制完整文档内容/);

  let cancellationNotified = false;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      }
    }
  });
  const beforeCancel = notifications.length;
  await helper.shareDocument('doc-1');
  cancellationNotified = notifications.length !== beforeCancel;
  assert.equal(cancellationNotified, false);
})().finally(() => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  globalThis.document = originalDocument;
}).catch(error => {
  console.error(error);
  process.exit(1);
});
