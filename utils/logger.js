(function (global) {
  'use strict';

  function createLogger(options = {}) {
    const output = options.console || global.console;
    const quiet = Boolean(options.quiet);
    const verbose = Boolean(options.verbose);
    return Object.freeze({
      clear: () => { if (!quiet) output.clear?.(); },
      info: (...args) => { if (!quiet) output.log(...args); },
      debug: (...args) => { if (!quiet && verbose) (output.debug || output.log).call(output, ...args); },
      warn: (...args) => { if (!quiet) output.warn(...args); },
      error: (...args) => output.error(...args)
    });
  }

  const api = Object.freeze({ createLogger });
  global.SmartPagesLogger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
