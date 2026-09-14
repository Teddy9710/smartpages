const assert = require('node:assert/strict');
const { ChromeLocalStore, CLOUD_SESSION_KEY, CLOUD_CONFIG_KEY } = require('../utils/cloudDocumentApi');

const local = { cloudStorageSession: { accessToken: 'legacy-token' } };
const session = {};
function area(values) {
  return {
    get(keys, done) { done(Object.fromEntries(keys.map(key => [key, values[key]]))); },
    set(data, done) { Object.assign(values, data); done(); },
    remove(key, done) { delete values[key]; done?.(); return Promise.resolve(); }
  };
}
global.chrome = { runtime: {}, storage: { local: area(local), session: area(session) } };
(async () => {
  const storage = new ChromeLocalStore();
  await storage.set(CLOUD_SESSION_KEY, { accessToken: 'new-token' });
  assert.equal(local[CLOUD_SESSION_KEY], undefined);
  assert.equal((await storage.get(CLOUD_SESSION_KEY)).accessToken, 'new-token');
  assert.equal(local.cloudStorageSession, undefined);
  await storage.set(CLOUD_CONFIG_KEY, { provider: 'supabase' });
  assert.equal(local[CLOUD_CONFIG_KEY].provider, 'supabase');
  await storage.remove(CLOUD_SESSION_KEY);
  assert.equal(await storage.get(CLOUD_SESSION_KEY), undefined);
})().catch(error => { console.error(error); process.exitCode = 1; });
