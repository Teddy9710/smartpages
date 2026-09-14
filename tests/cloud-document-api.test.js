const assert = require('node:assert/strict');

const {
  CLOUD_CONFIG_KEY,
  CLOUD_PROVIDER_CONFIGS_KEY,
  CLOUD_SESSION_KEY,
  LocalDocumentDraftStore,
  LocalDirectoryDocumentStore,
  SupabaseCloudDocumentProvider,
  CloudBaseDocumentProvider,
  CloudDocumentProvider
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
  const emptyProfileStorage = new MemoryStore();
  const freshFacade = new CloudDocumentProvider({ storage: emptyProfileStorage });
  await freshFacade.saveConfig({ provider: 'cloudbase', envId: 'test-env', accessKey: 'public-key' });
  assert.equal((await emptyProfileStorage.get(CLOUD_PROVIDER_CONFIGS_KEY)).supabase, undefined);

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

  const rollbackRequests = [];
  const rollbackProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    randomUUID: (() => { let index = 0; return () => `rollback-${++index}`; })(),
    fetch: async (url, options = {}) => {
      rollbackRequests.push({ url, options });
      if (url.includes('/storage/v1/object/smartpages-assets/')) return jsonResponse({ Key: 'asset' });
      if (url.endsWith('/rest/v1/rpc/save_generated_document')) {
        return jsonResponse({ code: 'DATABASE_ERROR', message: 'Database unavailable' }, 500);
      }
      if (url.endsWith('/storage/v1/object/smartpages-assets') && options.method === 'DELETE') {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  await assert.rejects(() => rollbackProvider.saveDocument({
    title: 'Rollback',
    content: '![shot](data:image/png;base64,aGVsbG8=)'
  }), /Database unavailable/);
  const rollbackDelete = rollbackRequests.find(request => request.options.method === 'DELETE');
  assert.deepEqual(JSON.parse(rollbackDelete.options.body).prefixes, ['user-1/rollback-1/rollback-2.png']);

  const deleteRequests = [];
  const deleteProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    fetch: async (url, options = {}) => {
      deleteRequests.push({ url, options });
      if (url.includes('/storage/v1/object/list/smartpages-assets')) {
        return jsonResponse([{ id: 'asset-id', name: 'asset.png' }]);
      }
      if (url.includes('/rest/v1/cloud_documents?') && options.method === 'DELETE') {
        return jsonResponse(null, 204);
      }
      if (url.endsWith('/storage/v1/object/smartpages-assets') && options.method === 'DELETE') {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  await deleteProvider.deleteDocument('doc-delete-1');
  const assetDelete = deleteRequests.find(request => request.url.endsWith('/storage/v1/object/smartpages-assets'));
  assert.deepEqual(JSON.parse(assetDelete.options.body).prefixes, ['user-1/doc-delete-1/asset.png']);

  const compressionRequests = [];
  const compressionProvider = new SupabaseCloudDocumentProvider({
    storage: providerStorage,
    randomUUID: (() => { let index = 0; return () => `compressed-${++index}`; })(),
    imageCompressor: async () => 'data:image/webp;base64,aGVsbG8=',
    fetch: async (url, options = {}) => {
      compressionRequests.push({ url, options });
      if (url.includes('/storage/v1/object/sign/')) {
        return jsonResponse({ signedURL: '/object/sign/smartpages-assets/user-1/compressed-1/compressed-2.webp?token=signed' });
      }
      if (url.includes('/storage/v1/object/')) return jsonResponse({ Key: 'asset' });
      if (url.endsWith('/rest/v1/rpc/save_generated_document')) {
        const body = JSON.parse(options.body);
        return jsonResponse({ id: body.p_id, title: body.p_title, format: body.p_format, content: body.p_content, revision: 1 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  await compressionProvider.saveDocument({
    title: 'Compressed',
    content: '![shot](data:image/png;base64,aGVsbG8=)'
  });
  const compressedUpload = compressionRequests.find(request => request.url.includes('/compressed-2.webp'));
  assert.equal(compressedUpload.options.headers['Content-Type'], 'image/webp');

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

  const cloudBaseRequests = [];
  const cloudBaseStorage = new MemoryStore({
    [CLOUD_CONFIG_KEY]: {
      provider: 'cloudbase',
      envId: 'smartpages-cn-1',
      accessKey: 'publishable-key',
      region: 'ap-shanghai',
      bucket: 'smartpages-assets'
    }
  });
  const cloudBaseApp = {
    auth: () => ({
      getSession: async () => ({ data: { user: { uid: 'cn-user-1', email: 'cn@example.com' } } }),
      currentUser: null
    }),
    rdb: () => ({
      rpc: async (name, body) => {
        cloudBaseRequests.push({ type: 'rpc', name, body });
        return {
          data: {
            id: body.p_id,
            title: body.p_title,
            format: body.p_format,
            content: body.p_content,
            revision: 1
          },
          error: null
        };
      },
      from: table => {
        const query = {
          delete() { return this; },
          eq() { return this; },
          then(resolve) {
            cloudBaseRequests.push({ type: 'db-delete', table });
            resolve({ data: [], error: null });
          }
        };
        return query;
      }
    }),
    storage: {
      from: bucket => ({
        upload: async (path, bytes, options) => {
          cloudBaseRequests.push({ type: 'upload', bucket, path, bytes, options });
          return { data: { path }, error: null };
        },
        createSignedUrl: async path => ({
          data: { fullSignedURL: `https://smartpages-cn-1.api.tcloudbasegateway.com/storage/${path}?token=signed` },
          error: null
        }),
        list: async prefix => ({
          data: { objects: [{ name: `${prefix}/asset.png` }], hasNext: false, nextCursor: null },
          error: null
        }),
        remove: async paths => {
          cloudBaseRequests.push({ type: 'remove', bucket, paths });
          return { data: paths.map(name => ({ name })), error: null };
        }
      })
    }
  };
  const cloudBaseProvider = new CloudBaseDocumentProvider({
    storage: cloudBaseStorage,
    cloudbase: { init: config => { cloudBaseRequests.push({ type: 'init', config }); return cloudBaseApp; } },
    randomUUID: (() => { let index = 0; return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`; })()
  });
  assert.equal((await cloudBaseProvider.getConfig()).provider, 'cloudbase');
  assert.equal((await cloudBaseProvider.getSession()).user.id, 'cn-user-1');
  assert.equal(CloudBaseDocumentProvider.normalizeConfig({ region: 'ap-beijing' }).region, 'ap-beijing');
  assert.equal(CloudBaseDocumentProvider.normalizeConfig({ region: 'ap-hongkong' }).region, 'ap-hongkong');
  assert.throws(() => CloudBaseDocumentProvider.normalizeConfig({ region: 'not a region' }), { code: 'CONFIG_INVALID' });
  const sessionFailureProvider = new CloudBaseDocumentProvider({
    storage: cloudBaseStorage,
    cloudbase: { init: () => ({ auth: () => ({ getSession: async () => { throw new Error('network unavailable'); } }) }) }
  });
  await assert.rejects(sessionFailureProvider.getSession(), { code: 'SESSION_FAILED', message: 'network unavailable' });
  const noSessionProvider = new CloudBaseDocumentProvider({
    storage: cloudBaseStorage,
    cloudbase: { init: () => ({ auth: () => ({ getSession: async () => null }) }) }
  });
  assert.equal(await noSessionProvider.getSession(), null);
  const cloudBaseSaved = await cloudBaseProvider.saveDocument({
    title: '国内云文档',
    format: 'markdown',
    content: '![截图](data:image/png;base64,aGVsbG8=)'
  });
  assert.equal(cloudBaseSaved.revision, 1);
  assert.match(cloudBaseSaved.content, /tcloudbasegateway\.com\/storage/);
  assert.ok(cloudBaseRequests.some(request => request.type === 'upload' && request.path.startsWith('cn-user-1/')));
  assert.match(cloudBaseRequests.find(request => request.type === 'rpc').body.p_content, /smartpages-asset:\/\/cn-user-1\//);
  await cloudBaseProvider.deleteDocument(cloudBaseSaved.id);
  assert.ok(cloudBaseRequests.some(request => request.type === 'db-delete'));
  assert.deepEqual(cloudBaseRequests.find(request => request.type === 'remove').paths, [
    `cn-user-1/${cloudBaseSaved.id}/asset.png`
  ]);

  const providerFacade = new CloudDocumentProvider({
    storage: cloudBaseStorage,
    cloudbase: { init: () => cloudBaseApp }
  });
  assert.equal((await providerFacade.getConfig()).provider, 'cloudbase');
  await providerFacade.saveConfig({
    provider: 'supabase',
    url: 'https://second-project.supabase.co',
    anonKey: 'second-key',
    bucket: 'smartpages-assets'
  });
  assert.equal((await providerFacade.getConfigForProvider('cloudbase')).envId, 'smartpages-cn-1');
  assert.equal((await providerFacade.getConfigForProvider('supabase')).url, 'https://second-project.supabase.co');
  assert.equal((await cloudBaseStorage.get(CLOUD_PROVIDER_CONFIGS_KEY)).cloudbase.envId, 'smartpages-cn-1');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
