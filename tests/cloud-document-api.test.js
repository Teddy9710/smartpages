const assert = require('node:assert/strict');

const {
  CLOUD_CONFIG_KEY,
  CLOUD_SESSION_KEY,
  LocalDocumentDraftStore,
  LocalDirectoryDocumentStore,
  SupabaseCloudDocumentProvider
} = require('../utils/cloudDocumentApi.js');

class MemoryStore {
  constructor(values = {}) { this.values = { ...values }; }
  async get(key) { return this.values[key]; }
  async set(key, value) { this.values[key] = value; }
  async remove(key) { delete this.values[key]; }
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => data
  };
}

(async () => {
  const storage = new MemoryStore();
  const draftStore = new LocalDocumentDraftStore({ storage, now: () => 1234 });
  await draftStore.save({ title: 'Draft', content: '# Draft', format: 'markdown' });
  assert.deepEqual(await draftStore.load(), {
    id: null,
    revision: 0,
    title: 'Draft',
    format: 'markdown',
    content: '# Draft',
    updatedAt: 1234
  });
  await draftStore.clear();
  assert.equal(await draftStore.load(), null);

  const directoryStore = new LocalDirectoryDocumentStore();
  assert.equal(directoryStore._safeFileName('Release:\nnotes?. '), 'Release--notes-');
  assert.equal(directoryStore._safeFileName('\u0000'), '-');

  const requests = [];
  let uuidIndex = 0;
  const providerStorage = new MemoryStore({
    [CLOUD_CONFIG_KEY]: {
      url: 'https://project.supabase.co/',
      anonKey: 'anon-key',
      bucket: 'smartpages-assets'
    },
    [CLOUD_SESSION_KEY]: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 9999999999,
      user: { id: 'user-1', email: 'user@example.com' }
    }
  });
  const provider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    now: () => 1000,
    randomUUID: () => `uuid-${++uuidIndex}`,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes('/storage/v1/object/sign/')) {
        return jsonResponse({ signedURL: '/object/sign/smartpages-assets/user-1/uuid-1/uuid-2.png?token=signed' });
      }
      if (url.includes('/storage/v1/object/')) return jsonResponse({ Key: 'asset' });
      if (url.endsWith('/rest/v1/rpc/save_generated_document')) {
        const body = JSON.parse(options.body);
        return jsonResponse({
          id: body.p_id,
          title: body.p_title,
          format: body.p_format,
          content: body.p_content,
          revision: body.p_expected_revision ? body.p_expected_revision + 1 : 1,
          created_at: '2026-01-01',
          updated_at: body.p_expected_revision ? '2026-01-02' : '2026-01-01'
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });

  assert.equal((await provider.getConfig()).url, 'https://project.supabase.co');
  assert.equal(
    SupabaseCloudDocumentProvider.normalizeConfig({ url: 'https://project.supabase.co/rest/v1', anonKey: 'key' }).url,
    'https://project.supabase.co'
  );
  assert.equal(
    SupabaseCloudDocumentProvider.normalizeConfig({ url: 'https://project.supabase.co/auth/v1/', anonKey: 'key' }).url,
    'https://project.supabase.co'
  );
  assert.equal(provider._headers({ anonKey: 'sb_publishable_test' }).Authorization, undefined);
  assert.equal(provider._headers({ anonKey: 'sb_publishable_test' }, 'user-jwt').Authorization, 'Bearer user-jwt');
  const saved = await provider.saveDocument({
    title: 'Cloud doc',
    format: 'markdown',
    content: '# Cloud doc\n\n![shot](data:image/png;base64,aGVsbG8=)'
  });
  assert.equal(saved.id, 'uuid-1');
  assert.equal(saved.revision, 1);
  assert.match(saved.content, /https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign/);
  const insertRequest = requests.find(request => request.url.endsWith('/rest/v1/rpc/save_generated_document'));
  const insertBody = JSON.parse(insertRequest.options.body);
  assert.equal(insertBody.p_event, 'cloud_save');
  assert.equal(insertBody.p_expected_revision, null);
  assert.match(insertBody.p_content, /smartpages-asset:\/\/user-1\/uuid-1\/uuid-2\.png/);
  assert.doesNotMatch(insertBody.p_content, /data:image/);
  assert.ok(requests.some(request => request.url.includes('/storage/v1/object/smartpages-assets/user-1/uuid-1/uuid-2.png')));
  const signRequest = requests.find(request => request.url.includes('/storage/v1/object/sign/'));
  assert.ok(signRequest.url.endsWith('/user-1/uuid-1/uuid-2.png'));
  assert.doesNotMatch(signRequest.url, /png\)/);

  const updated = await provider.saveDocument({
    id: saved.id,
    revision: saved.revision,
    title: saved.title,
    format: saved.format,
    content: saved.content
  });
  assert.equal(updated.revision, 2);
  const patchRequest = requests.filter(request => request.url.endsWith('/rest/v1/rpc/save_generated_document'))[1];
  const patchBody = JSON.parse(patchRequest.options.body);
  assert.equal(patchBody.p_expected_revision, 1);
  assert.match(patchBody.p_content, /smartpages-asset:\/\/user-1\/uuid-1\/uuid-2\.png/);
  assert.doesNotMatch(patchBody.p_content, /token=signed/);

  const conflictProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    now: () => 1000,
    randomUUID: () => 'unused',
    fetch: async () => jsonResponse({ code: '40001', message: 'VERSION_CONFLICT' }, 409)
  });
  await assert.rejects(
    () => conflictProvider.saveDocument({ id: 'uuid-1', revision: 1, title: 'Changed', content: '# Changed' }),
    error => error.code === 'VERSION_CONFLICT'
  );

  const authErrorProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    fetch: async () => jsonResponse({ code: 'weak_password', message: 'Password is too weak' }, 422)
  });
  await assert.rejects(
    () => authErrorProvider.signUp('user@example.com', '123456'),
    error => error.code === 'weak_password' && error.status === 422
  );

  const signedUrlFailureProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    randomUUID: (() => { let index = 0; return () => `fallback-${++index}`; })(),
    fetch: async (url, options = {}) => {
      if (url.includes('/storage/v1/object/sign/')) return jsonResponse({ message: 'Object not found' }, 404);
      if (url.includes('/storage/v1/object/')) return jsonResponse({ Key: 'asset' });
      if (url.endsWith('/rest/v1/rpc/save_generated_document')) {
        const body = JSON.parse(options.body);
        return jsonResponse({ id: body.p_id, title: body.p_title, format: body.p_format, content: body.p_content, revision: 1 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  const fallbackSaved = await signedUrlFailureProvider.saveDocument({
    title: 'Fallback',
    content: '![shot](data:image/png;base64,aGVsbG8=)'
  });
  assert.match(fallbackSaved.content, /data:image\/png/);
  assert.equal(fallbackSaved.assetWarning, 'Object not found');

  const historyRequests = [];
  const historyProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    fetch: async url => {
      historyRequests.push(url);
      if (url.includes('/cloud_document_versions?document_id=eq.doc-1')) {
        return jsonResponse([{ id: 2, document_id: 'doc-1', revision: 2, event: 'cloud_save' }]);
      }
      if (url.includes('/cloud_document_versions?id=eq.2')) {
        return jsonResponse([{ id: 2, document_id: 'doc-1', revision: 2, content: '# v2' }]);
      }
      if (url.includes('/cloud_documents?document_type=eq.generated')) return jsonResponse([]);
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  await historyProvider.listDocuments('Release notes');
  assert.match(historyRequests[0], /document_type=eq\.generated/);
  assert.match(historyRequests[0], /title=ilike\.\*Release%20notes\*/);
  assert.deepEqual(await historyProvider.listDocumentVersions('doc-1'), [{ id: 2, document_id: 'doc-1', revision: 2, event: 'cloud_save' }]);
  assert.equal((await historyProvider.getDocumentVersion(2)).content, '# v2');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
