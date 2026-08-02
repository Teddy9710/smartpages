/**
 * SmartPages cloud document support.
 *
 * The UI talks to this provider-neutral facade instead of depending on a
 * vendor SDK. Supabase is the first provider and uses its public REST APIs.
 */
(function initCloudDocumentApi(globalScope) {
  'use strict';

  const CLOUD_CONFIG_KEY = 'cloudStorageConfig';
  const CLOUD_SESSION_KEY = 'cloudStorageSession';
  const LOCAL_DRAFT_KEY = 'generatedDocumentDraft';
  const DEFAULT_BUCKET = 'smartpages-assets';

  class CloudDocumentError extends Error {
    constructor(message, code = 'CLOUD_ERROR', status = 0) {
      super(message);
      this.name = 'CloudDocumentError';
      this.code = code;
      this.status = status;
    }
  }

  class ChromeLocalStore {
    async get(key) {
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get([key], value => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(value || {});
        });
      });
      return result[key];
    }

    async set(key, value) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }

    async remove(key) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(key, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      });
    }
  }

  class LocalDocumentDraftStore {
    constructor(options = {}) {
      this.storage = options.storage || new ChromeLocalStore();
      this.key = options.key || LOCAL_DRAFT_KEY;
      this.now = options.now || (() => Date.now());
    }

    async save(draft) {
      const value = {
        id: draft?.id || null,
        revision: Number(draft?.revision) || 0,
        title: String(draft?.title || ''),
        format: ['markdown', 'html', 'text'].includes(draft?.format) ? draft.format : 'markdown',
        content: String(draft?.content || ''),
        updatedAt: this.now()
      };
      await this.storage.set(this.key, value);
      return value;
    }

    async load() {
      const value = await this.storage.get(this.key);
      return value && typeof value.content === 'string' ? value : null;
    }

    async clear() {
      await this.storage.remove(this.key);
    }
  }

  class SupabaseCloudDocumentProvider {
    constructor(options = {}) {
      this.storage = options.storage || new ChromeLocalStore();
      this.fetch = options.fetch || globalScope.fetch?.bind(globalScope);
      this.now = options.now || (() => Date.now());
      this.randomUUID = options.randomUUID || (() => globalScope.crypto.randomUUID());
      this.assetUrlMap = new Map();
      if (!this.fetch) throw new CloudDocumentError('Fetch API is unavailable', 'FETCH_UNAVAILABLE');
    }

    async getConfig() {
      const value = await this.storage.get(CLOUD_CONFIG_KEY);
      return SupabaseCloudDocumentProvider.normalizeConfig(value || {});
    }

    async saveConfig(config) {
      const value = SupabaseCloudDocumentProvider.normalizeConfig(config);
      if (!value.url || !value.anonKey) {
        throw new CloudDocumentError('Supabase URL and anon key are required', 'CONFIG_REQUIRED');
      }
      await this.storage.set(CLOUD_CONFIG_KEY, value);
      return value;
    }

    async isConfigured() {
      const config = await this.getConfig();
      return Boolean(config.url && config.anonKey);
    }

    static normalizeConfig(config) {
      let url = String(config?.url || '').trim();
      try {
        if (url) {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:') throw new Error('HTTPS is required');
          // The dashboard may expose a Data API URL ending in /rest/v1.
          // SmartPages needs the project origin because it also calls Auth and Storage.
          url = parsed.origin;
        }
      } catch (_error) {
        url = '';
      }
      return {
        provider: 'supabase',
        url,
        anonKey: String(config?.anonKey || '').trim(),
        bucket: String(config?.bucket || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET
      };
    }

    async signUp(email, password) {
      return this._authenticate('/auth/v1/signup', { email, password });
    }

    async signIn(email, password) {
      return this._authenticate('/auth/v1/token?grant_type=password', { email, password });
    }

    async _authenticate(path, body) {
      const config = await this._requireConfig();
      const response = await this.fetch(`${config.url}${path}`, {
        method: 'POST',
        headers: this._headers(config),
        body: JSON.stringify(body)
      });
      const data = await this._readResponse(response);
      const session = this._normalizeSession(data);
      if (!session.accessToken) {
        if (data?.user && !data?.session) {
          return { pendingConfirmation: true, user: data.user };
        }
        throw new CloudDocumentError('Authentication did not return a session', 'AUTH_SESSION_MISSING');
      }
      await this.storage.set(CLOUD_SESSION_KEY, session);
      return session;
    }

    async signOut() {
      const config = await this.getConfig();
      const session = await this.storage.get(CLOUD_SESSION_KEY);
      if (config.url && config.anonKey && session?.accessToken) {
        await this.fetch(`${config.url}/auth/v1/logout`, {
          method: 'POST',
          headers: this._headers(config, session.accessToken)
        }).catch(() => null);
      }
      await this.storage.remove(CLOUD_SESSION_KEY);
    }

    async getSession() {
      const session = await this.storage.get(CLOUD_SESSION_KEY);
      if (!session?.accessToken) return null;
      if (Number(session.expiresAt) > Math.floor(this.now() / 1000) + 60) return session;
      if (!session.refreshToken) {
        await this.storage.remove(CLOUD_SESSION_KEY);
        return null;
      }
      return this._refreshSession(session.refreshToken);
    }

    async _refreshSession(refreshToken) {
      const config = await this._requireConfig();
      const response = await this.fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: this._headers(config),
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!response.ok) {
        await this.storage.remove(CLOUD_SESSION_KEY);
        throw new CloudDocumentError('Cloud session expired. Please sign in again.', 'AUTH_EXPIRED', response.status);
      }
      const session = this._normalizeSession(await response.json());
      await this.storage.set(CLOUD_SESSION_KEY, session);
      return session;
    }

    async listDocuments() {
      const context = await this._authorizedContext();
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?select=id,title,format,revision,created_at,updated_at&order=updated_at.desc`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      return this._readResponse(response);
    }

    async getDocument(id) {
      const context = await this._authorizedContext();
      const safeId = encodeURIComponent(String(id || ''));
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?id=eq.${safeId}&select=*`,
        { headers: this._headers(context.config, context.session.accessToken) }
      );
      const rows = await this._readResponse(response);
      if (!rows?.length) throw new CloudDocumentError('Cloud document was not found', 'NOT_FOUND', 404);
      const document = rows[0];
      document.content = await this._hydrateAssets(document.content, context);
      return document;
    }

    async refreshAssetUrls(content) {
      const context = await this._authorizedContext();
      return this._hydrateAssets(this._dehydrateKnownAssets(content), context);
    }

    async saveDocument(input) {
      const context = await this._authorizedContext();
      const documentId = input?.id || this.randomUUID();
      const cloudContent = await this._uploadEmbeddedAssets(String(input?.content || ''), documentId, context);
      const payload = {
        id: documentId,
        user_id: context.session.user.id,
        title: String(input?.title || 'SmartPages document').slice(0, 200),
        format: ['markdown', 'html', 'text'].includes(input?.format) ? input.format : 'markdown',
        content: cloudContent
      };

      let response;
      if (input?.id) {
        const revision = Math.max(1, Number(input.revision) || 1);
        response = await this.fetch(
          `${context.config.url}/rest/v1/cloud_documents?id=eq.${encodeURIComponent(documentId)}&revision=eq.${revision}`,
          {
            method: 'PATCH',
            headers: { ...this._headers(context.config, context.session.accessToken), Prefer: 'return=representation' },
            body: JSON.stringify({ ...payload, revision: revision + 1, updated_at: new Date(this.now()).toISOString() })
          }
        );
      } else {
        response = await this.fetch(`${context.config.url}/rest/v1/cloud_documents`, {
          method: 'POST',
          headers: { ...this._headers(context.config, context.session.accessToken), Prefer: 'return=representation' },
          body: JSON.stringify(payload)
        });
      }

      const rows = await this._readResponse(response);
      if (!rows?.length) {
        throw new CloudDocumentError('This document changed in another session. Reload it before saving.', 'VERSION_CONFLICT', 409);
      }
      const saved = rows[0];
      try {
        saved.content = await this._hydrateAssets(saved.content, context);
      } catch (error) {
        // The database write already succeeded. A temporary signed-URL failure
        // must not make the UI retry the insert and create a duplicate document.
        saved.content = String(input?.content || '');
        saved.assetWarning = error.message;
      }
      return saved;
    }

    async deleteDocument(id) {
      const context = await this._authorizedContext();
      const response = await this.fetch(
        `${context.config.url}/rest/v1/cloud_documents?id=eq.${encodeURIComponent(String(id || ''))}`,
        {
          method: 'DELETE',
          headers: this._headers(context.config, context.session.accessToken)
        }
      );
      await this._readResponse(response, true);
      return true;
    }

    async _uploadEmbeddedAssets(content, documentId, context) {
      let result = this._dehydrateKnownAssets(content);
      const matches = [...new Set(result.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi) || [])];
      for (const dataUrl of matches) {
        const match = dataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
        if (!match) continue;
        const extension = this._safeImageExtension(match[1]);
        const assetId = this.randomUUID();
        const path = `${context.session.user.id}/${documentId}/${assetId}.${extension}`;
        const bytes = this._decodeBase64(match[2]);
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/${encodeURIComponent(context.config.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'POST',
            headers: {
              ...this._headers(context.config, context.session.accessToken, false),
              'Content-Type': `image/${match[1]}`,
              'x-upsert': 'false'
            },
            body: bytes
          }
        );
        await this._readResponse(response, true);
        result = result.split(dataUrl).join(`smartpages-asset://${path}`);
      }
      return result;
    }

    async _hydrateAssets(content, context) {
      let result = String(content || '');
      // Asset paths are generated from UUIDs and image extensions. Keep the
      // matcher deliberately narrow so Markdown's closing `)` is not treated
      // as part of the object name.
      const markers = [...new Set(result.match(/smartpages-asset:\/\/[A-Za-z0-9._%/-]+/g) || [])];
      for (const marker of markers) {
        const path = marker.slice('smartpages-asset://'.length);
        const response = await this.fetch(
          `${context.config.url}/storage/v1/object/sign/${encodeURIComponent(context.config.bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'POST',
            headers: this._headers(context.config, context.session.accessToken),
            body: JSON.stringify({ expiresIn: 3600 })
          }
        );
        const data = await this._readResponse(response);
        const signedPath = data?.signedURL || data?.signedUrl;
        if (!signedPath) continue;
        const signedUrl = /^https?:\/\//i.test(signedPath)
          ? signedPath
          : `${context.config.url}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
        this.assetUrlMap.set(signedUrl, marker);
        result = result.split(marker).join(signedUrl);
      }
      return result;
    }

    _dehydrateKnownAssets(content) {
      let result = String(content || '');
      for (const [signedUrl, marker] of this.assetUrlMap.entries()) {
        result = result.split(signedUrl).join(marker);
      }
      result = result.replace(
        /https:\/\/[^\s"'()]+\/storage\/v1\/object\/sign\/[^/\s"'()]+\/([^\s"'()?]+)(?:\?[^\s"'()]*)?/gi,
        (_match, encodedPath) => {
          try {
            return `smartpages-asset://${decodeURIComponent(encodedPath)}`;
          } catch (_error) {
            return `smartpages-asset://${encodedPath}`;
          }
        }
      );
      return result;
    }

    _decodeBase64(value) {
      const binary = globalScope.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    _safeImageExtension(value) {
      const extension = String(value || '').toLowerCase().replace('jpeg', 'jpg');
      return ['png', 'jpg', 'gif', 'webp'].includes(extension) ? extension : 'png';
    }

    async _authorizedContext() {
      const config = await this._requireConfig();
      const session = await this.getSession();
      if (!session?.accessToken || !session?.user?.id) {
        throw new CloudDocumentError('Please sign in to Supabase first', 'AUTH_REQUIRED', 401);
      }
      return { config, session };
    }

    async _requireConfig() {
      const config = await this.getConfig();
      if (!config.url || !config.anonKey) {
        throw new CloudDocumentError('Configure Supabase in Settings first', 'CONFIG_REQUIRED');
      }
      return config;
    }

    _headers(config, accessToken = '', includeJson = true) {
      const headers = {
        apikey: config.anonKey
      };
      // New sb_publishable_* keys are valid in `apikey` but must not be sent as
      // Bearer tokens. Authorization is only for a signed-in user's JWT.
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (includeJson) headers['Content-Type'] = 'application/json';
      return headers;
    }

    _normalizeSession(data) {
      const expiresIn = Number(data?.expires_in) || 3600;
      return {
        accessToken: data?.access_token || data?.session?.access_token || '',
        refreshToken: data?.refresh_token || data?.session?.refresh_token || '',
        expiresAt: Number(data?.expires_at || data?.session?.expires_at) || Math.floor(this.now() / 1000) + expiresIn,
        user: data?.user || data?.session?.user || null
      };
    }

    async _readResponse(response, allowEmpty = false) {
      if (response.ok) {
        if (allowEmpty || response.status === 204) return null;
        return response.json();
      }
      const data = await response.json().catch(() => ({}));
      const message = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
      const code = data?.code || data?.error_code || 'REQUEST_FAILED';
      throw new CloudDocumentError(String(message || 'Cloud request failed'), String(code), response.status);
    }
  }

  const exports = {
    CLOUD_CONFIG_KEY,
    CLOUD_SESSION_KEY,
    LOCAL_DRAFT_KEY,
    CloudDocumentError,
    ChromeLocalStore,
    LocalDocumentDraftStore,
    SupabaseCloudDocumentProvider
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  Object.assign(globalScope, exports);
})(typeof globalThis !== 'undefined' ? globalThis : window);
