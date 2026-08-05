const assert = require('node:assert/strict');

global.chrome = {
  runtime: { lastError: null },
  storage: { local: { get(_, cb) { cb({}); } } }
};

const { buildModelApiRequest, isLoopbackUrl, ExtensionError } = require('../utils/common.js');

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

// Hostname-prefix bypass regression — must be blocked
assertInsecureUrl('http://10.evil.example');
assertInsecureUrl('http://172.16.evil.example');
assertInsecureUrl('http://192.168.evil.example');
assertInsecureUrl('http://127.0.0.1.evil.example');

// RFC-1918 LAN addresses — blocked (policy: loopback only)
assertInsecureUrl('http://192.168.1.100:8080/v1');
assertInsecureUrl('http://10.0.0.1:11434/v1');
assertInsecureUrl('http://172.16.0.5:8080/v1');

// Remote HTTPS must pass
assertAllowed('https://api.example.com/v1');
assertAllowed('https://api.openai.com/v1');

// Loopback over HTTP must pass
assertAllowed('http://localhost:11434/v1');
assertAllowed('http://127.0.0.1:8080/v1');
assertAllowed('http://127.0.0.99:8080/v1');
assertAllowed('http://[::1]:8080/v1');

// isLoopbackUrl unit checks
assert.equal(isLoopbackUrl('http://localhost:11434'), true);
assert.equal(isLoopbackUrl('http://127.0.0.1:8080'), true);
assert.equal(isLoopbackUrl('http://127.255.255.255'), true);
assert.equal(isLoopbackUrl('http://[::1]:8080'), true);
assert.equal(isLoopbackUrl('http://10.0.0.1'), false);
assert.equal(isLoopbackUrl('http://192.168.1.1'), false);
assert.equal(isLoopbackUrl('http://10.evil.example'), false);
assert.equal(isLoopbackUrl('http://api.example.com'), false);

// Non-regression: Authorization header is present in HTTPS request
const req = buildModelApiRequest({ ...BASE_CONFIG, baseUrl: 'https://api.example.com/v1' }, 'hello');
assert.ok(req.fetchOptions.headers['Authorization'].startsWith('Bearer '));
