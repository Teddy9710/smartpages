# Content Script Startup Fix

## Problem

The extension declares `content/recorder.js` as a Manifest V3 content script,
but `_startContentScriptListening()` still calls `chrome.scripting.executeScript()`
before contacting it. Some ordinary pages reject that dynamic injection with a
generic `Blocked` error even though the manifest-loaded receiver is available.
Recording therefore fails before the extension attempts normal messaging.

## Design

- `_startContentScriptListening()` first sends `START_LISTENING` to the target
  tab.
- If messaging succeeds, no dynamic injection is attempted.
- If messaging reports a missing or closed receiver, the extension injects
  `content/recorder.js` and retries `START_LISTENING` once.
- Other messaging errors propagate without attempting injection.
- Existing state rollback and restricted-page error handling remain unchanged.
- `_injectContentScript()` retains its all-frames to main-frame fallback for
  tabs where recovery injection is genuinely required.

## Testing

- Verify a reachable manifest content script receives `START_LISTENING` without
  any `executeScript` call.
- Verify a missing receiver causes one recovery injection followed by one
  successful message retry.
- Verify a non-connection messaging error does not trigger injection and still
  rolls back recording state when requested.
- Run tests, lint, type-check, and build verification.

## Scope

This change does not alter extension permissions, the manifest, page CSP, or
recording data. It only changes the startup order and fallback conditions.
