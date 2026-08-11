const assert = require('node:assert/strict');
const { createLogger } = require('../utils/logger.js');

function output() {
  const calls = [];
  return {
    calls,
    console: {
      clear: () => calls.push(['clear']),
      log: (...args) => calls.push(['info', ...args]),
      debug: (...args) => calls.push(['debug', ...args]),
      warn: (...args) => calls.push(['warn', ...args]),
      error: (...args) => calls.push(['error', ...args])
    }
  };
}

{
  const target = output();
  const log = createLogger({ console: target.console, quiet: true });
  log.clear();
  log.info('info');
  log.debug('debug');
  log.warn('warn');
  log.error('error');
  assert.deepEqual(target.calls, [['error', 'error']]);
}

{
  const target = output();
  const log = createLogger({ console: target.console, verbose: true });
  log.info('info');
  log.debug('debug');
  assert.deepEqual(target.calls, [['info', 'info'], ['debug', 'debug']]);
}
