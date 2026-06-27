# Content Script Startup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start recording through the manifest-loaded content script without forcing a dynamic injection that some ordinary pages block.

**Architecture:** `_startContentScriptListening()` becomes message-first. Dynamic injection remains a recovery path used only when Chrome reports that no receiving content script exists, after which the start message is retried once.

**Tech Stack:** Chrome Extension Manifest V3 APIs, JavaScript, Node.js `assert` and `vm` tests.

---

### Task 1: Specify message-first startup behavior

**Files:**
- Modify: `tests/background-screenshot-throttle.test.js`

- [ ] **Step 1: Add a reachable-receiver test**

Create a manager whose `chrome.tabs.sendMessage` succeeds and whose
`_injectContentScript` records calls. After `_startContentScriptListening(11)`,
assert the event list is exactly:

```js
[
  { kind: 'message', tabId: 11, type: 'START_LISTENING' }
]
```

- [ ] **Step 2: Add a missing-receiver recovery test**

Make the first `sendMessage` call throw
`new Error('Could not establish connection. Receiving end does not exist.')`,
then succeed. Assert the event order is:

```js
[
  { kind: 'message', attempt: 1 },
  { kind: 'inject', tabId: 12 },
  { kind: 'message', attempt: 2 }
]
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node tests/background-screenshot-throttle.test.js`

Expected: FAIL because the current implementation injects before its first
message.

### Task 2: Implement message-first startup

**Files:**
- Modify: `background/background.js:337-365`

- [ ] **Step 1: Replace eager injection with direct messaging**

Use this control flow:

```js
try {
  await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
} catch (error) {
  if (this._isContentScriptConnectionError(error)) {
    try {
      await this._injectContentScript(tabId);
      await chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' });
      return;
    } catch (injectError) {
      // Preserve the existing reset and wrapped error behavior.
    }
  }
  // Preserve the existing reset and rethrow behavior.
}
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run: `node tests/background-screenshot-throttle.test.js`

Expected: PASS with no assertion failure.

### Task 3: Verify and commit

**Files:**
- Verify: `background/background.js`
- Verify: `tests/background-screenshot-throttle.test.js`

- [ ] **Step 1: Run complete verification**

Run: `npm run verify`

Expected: all tests, lint, type-check, and build commands exit successfully.

- [ ] **Step 2: Check scope and whitespace**

Run: `git diff --check` and inspect `git diff`.

Expected: no whitespace errors; production changes are limited to startup order.

- [ ] **Step 3: Commit**

```bash
git add background/background.js tests/background-screenshot-throttle.test.js docs/superpowers/plans/2026-06-27-content-script-startup-fix.md
git commit -m "fix: prefer manifest content script on recording start"
```
