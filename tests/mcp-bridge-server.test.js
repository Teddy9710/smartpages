const assert = require('node:assert/strict');
const test = require('node:test');
const WebSocket = require('ws');

const { BridgeServer } = require('../packages/smartpages-mcp/src/bridge-server');
const { PROTOCOL_VERSION } = require('../packages/smartpages-mcp/src/protocol');

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise(resolve => {
    ws.once('message', data => resolve(JSON.parse(String(data))));
  });
}

test('BridgeServer authenticates hello and forwards requests', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 500 });
  await server.start();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await waitForOpen(ws);

  ws.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, extensionId: 'ext', token: 'secret' }));
  assert.equal((await nextMessage(ws)).type, 'helloAck');

  const pending = server.forward('getRunStatus', { runId: 'run_1' });
  const request = await nextMessage(ws);
  assert.equal(request.type, 'getRunStatus');
  ws.send(JSON.stringify({ id: request.id, ok: true, payload: { status: 'COMPLETED' } }));

  assert.deepEqual(await pending, { status: 'COMPLETED' });
  ws.close();
  await server.stop();
});

test('BridgeServer rejects wrong token', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 500 });
  await server.start();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await waitForOpen(ws);

  const closed = new Promise(resolve => ws.once('close', resolve));
  ws.send(JSON.stringify({ type: 'hello', protocolVersion: PROTOCOL_VERSION, extensionId: 'ext', token: 'bad' }));
  await closed;

  assert.equal(server.isExtensionConnected(), false);
  await server.stop();
});

test('BridgeServer fails fast when extension is offline', async () => {
  const server = new BridgeServer({ token: 'secret', port: 0, requestTimeoutMs: 50 });
  await server.start();
  await assert.rejects(
    () => server.forward('getRunStatus', { runId: 'run_1' }),
    /EXTENSION_OFFLINE/
  );
  await server.stop();
});
