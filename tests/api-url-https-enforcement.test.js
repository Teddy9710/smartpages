const assert = require('node:assert/strict');

global.chrome = {
  runtime: { lastError: null },
  storage: { local: { get(_, cb) { cb({}); } } }
};

const { buildModelApiRequest, isLocalOrPrivateUrl, ExtensionError } = require('../utils/common.js');

const BASE_CONFIG = { apiKey: 'test-key', apiFormat: 'openai' };

function assertInsecureUrl(baseUrl) {
  assert.throws(
    () => buildModelApiRequest({ ...BASE_CONFIG, baseUrl }, 'hello'),
    (err) => err instanceof ExtensionError && err.code === 'INSECURE_URL'
  );
}

function assertAllowed(baseUrl) {
  const result = buildModelApiRequest({ ...BASE_CONFIG, baseUrl }, 'hello');
  assert.ok(result.url.startsWith(baseUrl));
}

// Remote HTTP must be blocked
assertInsecureUrl('http://api.example.com');
assertInsecureUrl('http://api.openai.com/v1');

// Remote HTTPS must pass
assertAllowed('https://api.example.com/v1');
assertAllowed('https://api.openai.com/v1');

// Loopback must pass over plain HTTP
assertAllowed('http://localhost:11434/v1');
assertAllowed('http://127.0.0.1:8080/v1');

// Private LAN ranges must pass over plain HTTP
assertAllowed('http://192.168.1.100:8080/v1');
assertAllowed('http://10.0.0.1:11434/v1');
assertAllowed('http://172.16.0.5:8080/v1');

// isLocalOrPrivateUrl unit checks
assert.equal(isLocalOrPrivateUrl('http://localhost:11434'), true);
assert.equal(isLocalOrPrivateUrl('http://127.0.0.1:8080'), true);
assert.equal(isLocalOrPrivateUrl('http://::1:8080'), false); // ::1 as hostname only
assert.equal(isLocalOrPrivateUrl('http://192.168.1.1'), true);
assert.equal(isLocalOrPrivateUrl('http://10.0.0.1'), true);
assert.equal(isLocalOrPrivateUrl('http://172.16.5.5'), true);
assert.equal(isLocalOrPrivateUrl('http://172.15.5.5'), false);
assert.equal(isLocalOrPrivateUrl('http://172.32.5.5'), false);
assert.equal(isLocalOrPrivateUrl('http://api.example.com'), false);

// Non-regression: Authorization header is present in HTTPS request
const req = buildModelApiRequest({ ...BASE_CONFIG, baseUrl: 'https://api.example.com/v1' }, 'hello');
assert.ok(req.fetchOptions.headers['Authorization'].startsWith('Bearer '));
