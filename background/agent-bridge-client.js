(function (global) {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    host: '127.0.0.1',
    port: '',
    token: ''
  });

  function createAgentBridgeClient(options) {
    const WebSocketImpl = options.WebSocketImpl || global.WebSocket;
    const getConfig = options.getConfig;
    const runner = options.runner;
    const extensionId = options.extensionId || global.chrome?.runtime?.id || 'unknown';
    let socket = null;
    let status = { connected: false, lastError: null };
    let reconnectTimer = null;
    let reconnectDelayMs = 1000;

    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect().catch(error => console.warn('[SmartPages AgentBridge] reconnect failed:', error));
      }, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    }

    function send(message) {
      if (!socket || socket.readyState !== WebSocketImpl.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    }

    async function connect() {
      const config = { ...DEFAULT_CONFIG, ...(await getConfig()) };
      if (!config.enabled || !config.port || !config.token) {
        status = { connected: false, lastError: 'Bridge is not configured.' };
        return status;
      }
      const nextSocket = new WebSocketImpl(`ws://${config.host}:${config.port}`);
      socket = nextSocket;
      nextSocket.onopen = () => {
        if (socket !== nextSocket) return;
        status = { connected: true, lastError: null };
        reconnectDelayMs = 1000;
        send({
          type: 'hello',
          protocolVersion: 1,
          extensionId,
          token: config.token
        });
      };
      nextSocket.onmessage = event => {
        if (socket !== nextSocket) return;
        handleMessage(event.data).catch(error => {
          console.warn('[SmartPages AgentBridge] message failed:', error);
        });
      };
      nextSocket.onerror = () => {
        if (socket !== nextSocket) return;
        status = { connected: false, lastError: 'WebSocket error.' };
      };
      nextSocket.onclose = () => {
        if (socket !== nextSocket) return;
        status = { connected: false, lastError: 'Bridge disconnected.' };
        scheduleReconnect();
      };
      return status;
    }

    async function handleMessage(raw) {
      const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!message.id || !message.type) return;
      try {
        const payload = await dispatch(message.type, message.payload || {});
        send({ id: message.id, ok: true, payload });
      } catch (error) {
        send({
          id: message.id,
          ok: false,
          error: {
            code: error.code || 'RUN_FAILED',
            message: error.message || 'SmartPages extension bridge request failed.'
          }
        });
      }
    }

    async function dispatch(type, payload) {
      switch (type) {
        case 'startRun':
          return await runner.startRun(payload);
        case 'getRunStatus':
          return await runner.getRunStatus(payload);
        case 'cancelRun':
          return await runner.cancelRun(payload);
        default: {
          const error = new Error(`Unknown bridge request type: ${type}`);
          error.code = 'INVALID_PARAMETERS';
          throw error;
        }
      }
    }

    return {
      connect,
      handleMessage,
      getStatus: () => ({ ...status })
    };
  }

  global.SmartPagesAgentBridge = Object.freeze({
    createAgentBridgeClient
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createAgentBridgeClient };
  }
})(globalThis);
