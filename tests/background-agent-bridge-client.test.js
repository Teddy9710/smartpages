const assert = require('node:assert/strict');
const test = require('node:test');

const { createAgentBridgeClient } = require('../background/agent-bridge-client');

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose && this.onclose(); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen && this.onopen(); }
  receive(message) { this.onmessage && this.onmessage({ data: JSON.stringify(message) }); }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSED = 3;
FakeWebSocket.instances = [];

test('bridge client sends hello and dispatches startRun', async () => {
  FakeWebSocket.instances = [];
  const calls = [];
  const client = createAgentBridgeClient({
    WebSocketImpl: FakeWebSocket,
    extensionId: 'ext',
    getConfig: async () => ({ enabled: true, host: '127.0.0.1', port: 1234, token: 'secret' }),
    runner: {
      startRun: async payload => {
        calls.push(payload);
        return { runId: 'run_1', status: 'RUNNING' };
      }
    }
  });

  await client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  assert.equal(socket.url, 'ws://127.0.0.1:1234');
  assert.equal(socket.sent[0].type, 'hello');
  assert.equal(socket.sent[0].token, 'secret');

  socket.receive({ id: 'msg_1', type: 'startRun', payload: { workflow: { workflowId: 'wf' }, variables: {} } });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(socket.sent[1], {
    id: 'msg_1',
    ok: true,
    payload: { runId: 'run_1', status: 'RUNNING' }
  });
});

test('bridge client reports unknown request errors', async () => {
  FakeWebSocket.instances = [];
  const client = createAgentBridgeClient({
    WebSocketImpl: FakeWebSocket,
    extensionId: 'ext',
    getConfig: async () => ({ enabled: true, host: '127.0.0.1', port: 1234, token: 'secret' }),
    runner: {}
  });

  await client.connect();
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  socket.receive({ id: 'msg_2', type: 'unknown', payload: {} });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(socket.sent[1].ok, false);
  assert.equal(socket.sent[1].error.code, 'INVALID_PARAMETERS');
});
