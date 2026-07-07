'use strict';

const WebSocket = require('ws');
const { ERROR_CODES, PROTOCOL_VERSION, createRequest } = require('./protocol');

class BridgeServer {
  constructor(options) {
    this.token = options.token;
    this.host = options.host || '127.0.0.1';
    this.requestTimeoutMs = options.requestTimeoutMs || 30000;
    this.server = null;
    this.extensionSocket = null;
    this.pending = new Map();
    this.port = options.port || 0;
  }

  async start() {
    this.server = new WebSocket.Server({ host: this.host, port: this.port });
    await new Promise(resolve => this.server.once('listening', resolve));
    this.port = this.server.address().port;
    this.server.on('connection', socket => this._handleConnection(socket));
  }

  async stop() {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(this._error(ERROR_CODES.EXTENSION_DISCONNECTED));
    }
    this.pending.clear();
    if (this.extensionSocket) this.extensionSocket.close();
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }
  }

  isExtensionConnected() {
    return Boolean(this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN);
  }

  async forward(type, payload) {
    if (!this.isExtensionConnected()) {
      throw this._error(ERROR_CODES.EXTENSION_OFFLINE);
    }

    const request = createRequest(type, payload);
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(this._error(ERROR_CODES.TIMEOUT));
      }, this.requestTimeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
    });

    this.extensionSocket.send(JSON.stringify(request));
    return promise;
  }

  _handleConnection(socket) {
    let authenticated = false;

    socket.on('message', data => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch (_error) {
        socket.close();
        return;
      }

      if (!authenticated) {
        if (!this._isValidHello(message)) {
          socket.close();
          return;
        }
        authenticated = true;
        if (this.extensionSocket && this.extensionSocket !== socket) this.extensionSocket.close();
        this.extensionSocket = socket;
        socket.send(JSON.stringify({ type: 'helloAck', protocolVersion: PROTOCOL_VERSION }));
        return;
      }

      this._handleResponse(message);
    });

    socket.on('close', () => {
      if (this.extensionSocket === socket) {
        this.extensionSocket = null;
        for (const [id, entry] of this.pending.entries()) {
          clearTimeout(entry.timer);
          entry.reject(this._error(ERROR_CODES.EXTENSION_DISCONNECTED));
          this.pending.delete(id);
        }
      }
    });
  }

  _isValidHello(message) {
    return message &&
      message.type === 'hello' &&
      message.protocolVersion === PROTOCOL_VERSION &&
      typeof message.extensionId === 'string' &&
      message.token === this.token;
  }

  _handleResponse(message) {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.ok) {
      entry.resolve(message.payload);
    } else {
      entry.reject(this._error(
        message.error?.code || ERROR_CODES.RUN_FAILED,
        message.error?.message || 'Bridge request failed.'
      ));
    }
  }

  _error(code, message = code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = {
  BridgeServer
};
