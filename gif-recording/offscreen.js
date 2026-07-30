/* global SmartGifEncoder */
(function() {
  'use strict';

  const FRAME_RATE = 8;
  const MAX_WIDTH = 960;
  let active = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'gif-recorder-offscreen') return;
    if (message.type === 'GIF_RECORDER_START_STREAM') {
      start(message).then(() => sendResponse({ success: true })).catch(error => sendResponse({ error: error.message || String(error) }));
      return true;
    }
    if (message.type === 'GIF_RECORDER_STOP_STREAM') {
      stop().then(() => sendResponse({ success: true })).catch(error => sendResponse({ error: error.message || String(error) }));
      return true;
    }
  });

  async function start({ streamId, maxDurationSeconds }) {
    if (active) throw new Error('GIF recorder is already active');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
    const video = document.getElementById('capture-video');
    video.srcObject = stream;
    await video.play();

    const ratio = Math.min(1, MAX_WIDTH / video.videoWidth);
    const width = Math.max(2, Math.floor(video.videoWidth * ratio / 2) * 2);
    const height = Math.max(2, Math.floor(video.videoHeight * ratio / 2) * 2);
    const canvas = document.getElementById('capture-canvas');
    canvas.width = width;
    canvas.height = height;

    active = {
      stream,
      video,
      canvas,
      context: canvas.getContext('2d', { willReadFrequently: true }),
      encoder: new SmartGifEncoder(width, height, Math.round(100 / FRAME_RATE)),
      intervalId: null,
      timeoutId: null
    };
    captureFrame();
    active.intervalId = setInterval(captureFrame, Math.round(1000 / FRAME_RATE));
    active.timeoutId = setTimeout(() => stop().catch(reportFailure), maxDurationSeconds * 1000);
  }

  function captureFrame() {
    if (!active) return;
    const { context, canvas, video, encoder } = active;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    encoder.addFrame(context.getImageData(0, 0, canvas.width, canvas.height).data);
  }

  async function stop() {
    if (!active) return;
    const recorder = active;
    active = null;
    clearInterval(recorder.intervalId);
    clearTimeout(recorder.timeoutId);
    recorder.stream.getTracks().forEach(track => track.stop());
    recorder.video.srcObject = null;

    const blob = new Blob([recorder.encoder.finish()], { type: 'image/gif' });
    if (blob.size < 100) throw new Error('没有捕获到可生成 GIF 的画面');
    const blobUrl = URL.createObjectURL(blob);
    const result = await chrome.runtime.sendMessage({ type: 'GIF_RECORDER_DOWNLOAD', blobUrl });
    // chrome.downloads has consumed the Blob URL before its response resolves.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    if (result?.error) throw new Error(result.error);
  }

  function reportFailure(error) {
    chrome.runtime.sendMessage({ type: 'GIF_RECORDER_FAILED', error: error.message || String(error) }).catch(() => {});
  }
})();
