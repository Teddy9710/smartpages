/*
 * Standalone GIF recording coordinator.
 *
 * This module deliberately has no dependency on RecordingManager, sessions,
 * screenshots, or document generation. Its only responsibility is to bridge
 * tabCapture, the offscreen recorder and the Downloads API.
 */
(function() {
  'use strict';

  const OFFSCREEN_PATH = 'gif-recording/offscreen.html';
  const MAX_DURATION_SECONDS = 30;

  class GifRecordingManager {
    constructor() {
      this.state = 'idle';
      this.tabId = null;
      this.startedAt = null;
      this.creatingOffscreenDocument = null;
    }

    getState() {
      return {
        state: this.state,
        elapsedSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
        maxDurationSeconds: MAX_DURATION_SECONDS
      };
    }

    async handleMessage(message) {
      switch (message.type) {
        case 'GET_GIF_RECORDING_STATE':
          return this.getState();
        case 'START_GIF_RECORDING':
          return this.start(message.tabId);
        case 'STOP_GIF_RECORDING':
          return this.stop();
        case 'GIF_RECORDER_DOWNLOAD':
          return this.download(message);
        case 'GIF_RECORDER_FAILED':
          this.reset();
          return { success: true };
        default:
          return { error: `Unknown GIF recorder message: ${message.type}` };
      }
    }

    async start(tabId) {
      if (this.state !== 'idle') return { error: 'GIF 录制已在进行中' };
      if (!tabId) return { error: '找不到当前标签页' };

      const tab = await chrome.tabs.get(tabId);
      if (!/^https?:/i.test(tab.url || '')) {
        return { error: '只能在普通网页中录制 GIF' };
      }

      await this.ensureOffscreenDocument();
      // Must be created from a user initiated popup action. The offscreen page
      // consumes this one-time ID immediately to obtain the tab media stream.
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      this.state = 'recording';
      this.tabId = tabId;
      this.startedAt = Date.now();
      this.broadcastState();

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'GIF_RECORDER_START_STREAM',
          target: 'gif-recorder-offscreen',
          streamId,
          maxDurationSeconds: MAX_DURATION_SECONDS
        });
        if (result?.error) throw new Error(result.error);
      } catch (error) {
        this.reset();
        throw error;
      }
      return { success: true, ...this.getState() };
    }

    async stop() {
      if (this.state !== 'recording') return { error: '当前没有 GIF 录制任务' };
      this.state = 'exporting';
      this.broadcastState();
      const result = await chrome.runtime.sendMessage({
        type: 'GIF_RECORDER_STOP_STREAM',
        target: 'gif-recorder-offscreen'
      });
      if (result?.error) {
        this.reset();
        return result;
      }
      return { success: true, ...this.getState() };
    }

    async download(message) {
      try {
        await chrome.downloads.download({
          url: message.blobUrl,
          filename: `smartpages-recording-${this.startedAt || Date.now()}.gif`,
          saveAs: true,
          conflictAction: 'uniquify'
        });
        this.reset();
        return { success: true };
      } catch (error) {
        this.reset();
        return { error: `GIF 下载失败：${error.message || error}` };
      }
    }

    async ensureOffscreenDocument() {
      const documentUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [documentUrl]
      });
      if (contexts.length) return;
      if (!this.creatingOffscreenDocument) {
        this.creatingOffscreenDocument = chrome.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: ['USER_MEDIA', 'BLOBS'],
          justification: 'Capture the user-selected tab and encode a downloadable GIF.'
        }).finally(() => { this.creatingOffscreenDocument = null; });
      }
      await this.creatingOffscreenDocument;
    }

    reset() {
      this.state = 'idle';
      this.tabId = null;
      this.startedAt = null;
      this.broadcastState();
    }

    broadcastState() {
      chrome.runtime.sendMessage({
        type: 'GIF_RECORDING_STATE_CHANGED',
        target: 'gif-recorder-ui',
        state: this.getState()
      }).catch(() => {});
    }
  }

  globalThis.GIF_RECORDING_MESSAGE_TYPES = [
    'GET_GIF_RECORDING_STATE', 'START_GIF_RECORDING', 'STOP_GIF_RECORDING',
    'GIF_RECORDER_DOWNLOAD', 'GIF_RECORDER_FAILED'
  ];
  globalThis.gifRecordingManager = new GifRecordingManager();
})();
