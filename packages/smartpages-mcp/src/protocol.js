'use strict';

const PROTOCOL_VERSION = 1;

const ERROR_CODES = Object.freeze({
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  WORKFLOW_INVALID: 'WORKFLOW_INVALID',
  MISSING_VARIABLES: 'MISSING_VARIABLES',
  EXTENSION_OFFLINE: 'EXTENSION_OFFLINE',
  EXTENSION_DISCONNECTED: 'EXTENSION_DISCONNECTED',
  BRIDGE_AUTH_FAILED: 'BRIDGE_AUTH_FAILED',
  PROTOCOL_VERSION_UNSUPPORTED: 'PROTOCOL_VERSION_UNSUPPORTED',
  ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  RUN_ALREADY_ACTIVE: 'RUN_ALREADY_ACTIVE',
  RUN_CANCELLED: 'RUN_CANCELLED',
  RUN_FAILED: 'RUN_FAILED',
  TIMEOUT: 'TIMEOUT',
  INVALID_PARAMETERS: 'INVALID_PARAMETERS'
});

function createRequest(type, payload = {}, id = `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`) {
  return { id, type, payload };
}

function createSuccess(id, payload = {}) {
  return { id, ok: true, payload };
}

function createError(id, code, message) {
  return {
    id,
    ok: false,
    error: {
      code: String(code || ERROR_CODES.RUN_FAILED),
      message: String(message || 'SmartPages bridge request failed.')
    }
  };
}

function normalizeError(error) {
  if (!error) {
    return { code: ERROR_CODES.RUN_FAILED, message: 'Unknown SmartPages bridge error.' };
  }
  if (error.code || error.message) {
    return {
      code: String(error.code || ERROR_CODES.RUN_FAILED),
      message: String(error.message || 'SmartPages bridge request failed.')
    };
  }
  return { code: ERROR_CODES.RUN_FAILED, message: String(error) };
}

module.exports = {
  PROTOCOL_VERSION,
  ERROR_CODES,
  createRequest,
  createSuccess,
  createError,
  normalizeError
};
