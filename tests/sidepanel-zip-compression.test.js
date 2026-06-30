const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const sandbox = {
  console,
  Blob,
  TextEncoder,
  Uint8Array,
  DataView,
  DocumentApi: class {},
  DocUIHelper: class {},
  debounce: fn => fn,
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve({}) },
    storage: { sync: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) }
  },
  document: { addEventListener: () => {}, getElementById: () => null, querySelector: () => null },
  window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 }
};
sandbox.globalThis = sandbox;
vm.runInNewContext(`${source}\nglobalThis.SidePanelManager = SidePanelManager;`, sandbox);

(async () => {
  const manager = Object.create(sandbox.SidePanelManager.prototype);
  manager._compressZipData = async () => new Uint8Array([1, 2, 3]);

  const zip = await manager._buildZip([
    { name: 'guide.txt', blob: new Blob(['aaaaaaaaaaaaaaaa'], { type: 'text/plain' }) }
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const local = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  assert.equal(local.getUint32(0, true), 0x04034b50);
  assert.equal(local.getUint16(8, true), 8);
  assert.equal(local.getUint32(18, true), 3);
  assert.equal(local.getUint32(22, true), 16);

  const centralOffset = bytes.findIndex((value, index) =>
    value === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x01 && bytes[index + 3] === 0x02
  );
  const central = new DataView(bytes.buffer, bytes.byteOffset + centralOffset, bytes.byteLength - centralOffset);
  assert.equal(central.getUint16(10, true), 8);
  assert.equal(central.getUint32(20, true), 3);
  assert.equal(central.getUint32(24, true), 16);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
