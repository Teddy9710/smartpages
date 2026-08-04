# Workflow 取消按钮（Cancel Run）问题分析与优化建议

## 📋 背景

当用户在 sidepanel 中点击「取消」按钮取消正在执行的 Workflow Run 时，系统的取消流程存在多个不合理之处，可能导致取消不及时、竞态条件、页面残留状态等问题。

## 🔍 当前取消流程

### 流程链路

1. **UI 层（sidepanel.js）**：`cancelWorkflowReplay()` → 发送 `WORKFLOW_CANCEL_RUN` 消息
2. **Background 层（background.js）**：`cancel(runId)` → `_cancelUnlocked()`
3. **Content Script（workflow-replayer.js）**：无任何处理

### `_cancelUnlocked()` 当前实现

```js
async _cancelUnlocked() {
  if (!this.run) throw this._error('NO_RUN', 'No workflow run exists.');
  if (!this._isActive()) throw this._error('INVALID_RUN_STATE', 'Workflow run is already terminal.');
  this.run.status = WorkflowRunStatus.CANCELLED;
  this.run.endedAt = new Date().toISOString();
  this._log(this.run.pendingStep, 'CANCELLED');
  await this._notify();
  return this.getStatus();
}
```

---

## 🚨 发现的问题

### 问题 1：正在执行的 step 无法被中断（严重 🔴）

**位置**：`background.js` → `_advance()`

`_advance()` 中的 `while` 循环通过 `await chrome.tabs.sendMessage()` 执行每个 step。这个 Promise 不可取消。即使 `_cancelUnlocked()` 设置了 `status = CANCELLED`，当前正在 content script 中执行的 step（如 `wait` 10 秒）仍会继续执行完毕。

循环只在**下一轮迭代**时检查 `if (this.run.status === WorkflowRunStatus.CANCELLED) break;` 才会退出。

**影响**：用户点取消后，当前 step 仍在运行，可能持续数秒甚至更久，给用户造成"取消无效"的感觉。

### 问题 2：没有 AbortController / 取消信号传递（严重 🔴）

**位置**：`background.js` → `_cancelUnlocked()`

取消操作只修改了 background 中的状态，没有：
- 向 content script 发送取消通知
- 使用 `AbortController` 中断正在进行的 `chrome.tabs.sendMessage`
- 通知 `navigationPending` 的等待中断

如果正在等待页面导航（`NAVIGATION_STARTED` 状态），取消后 `handleTabComplete` 仍会被触发。虽然 `_matches` 检查会过滤掉，但仍产生无意义的处理。

### 问题 3：竞态条件——取消与 step 完成的竞争（中等 🟡）

**位置**：`background.js` → `_advance()` + `_cancelUnlocked()`

`_advance()` 循环中使用了 claim 机制：
```js
if (!this._matches(claim) || this.run.status !== WorkflowRunStatus.RUNNING) return this.getStatus();
```

但 `_cancelUnlocked()` 修改 `this.run.status` 时，如果取消操作和 step 执行完成恰好同时发生，可能出现：
- step 完成后检查 `status` 发现已不是 RUNNING，直接 return
- 但 step 的副作用（点击、输入等）已经发生在页面上
- 用户以为取消了，但页面上已经产生了不可逆的操作

**对比**：`start()`、`resume()`、`handleTabComplete()` 都通过 `_serialize` 保护，但 `cancel()` 的内部修改缺乏同步保护。

### 问题 4：取消后不清理页面状态（中等 🟡）

**位置**：`content/workflow-replayer.js`

取消时：
- 没有移除已注入的 `workflow-replayer.js`
- 没有通知 content script 停止任何进行中的操作
- 页面上可能残留 UI 高亮、覆盖层等录制/回放辅助元素

### 问题 5：取消按钮显示条件有 STARTING 盲区（低 🟢）

**位置**：`sidepanel.js` → `_renderWorkflowRun()`

```js
this._setWorkflowRunElementVisible(
  document.getElementById('btn-workflow-cancel'),
  !['FAILED', 'COMPLETED', 'CANCELLED', 'STARTING'].includes(state)
);
```

`STARTING` 状态下取消按钮不可见。如果 start 过程中卡住（如 `_ensureWorkflowReplayer` 注入失败），用户将无法取消，被卡在启动阶段。

### 问题 6：取消操作没有错误恢复（低 🟢）

**位置**：`sidepanel.js` → `cancelWorkflowReplay()`

```js
const response = await chrome.runtime.sendMessage({ type: 'WORKFLOW_CANCEL_RUN', runId });
if (!response || response.error) throw new Error('cancel failed');
```

如果取消本身失败了（如 background service worker 已卸载），只显示一个通用错误通知，没有重试或回退机制。Run 状态仍然保持活跃，用户被卡住。

### 问题 7：MCP Bridge 的取消是 fire-and-forget（低 🟢）

**位置**：`packages/smartpages-mcp/src/mcp-server.js` → `cancel_run`

通过 Agent Bridge 的 `cancelRun` 只是转发请求，没有：
- 确认 content script 真的停止了
- 超时机制
- 对 AI Agent 的取消确认反馈

---

## 💡 优化建议

### 建议 1：引入 AbortController 中断正在执行的 step

```js
// start() 中创建
this._abortController = new AbortController();

// _advance() 中传递 signal
result = await chrome.tabs.sendMessage(
  this.run.tabId,
  { type: 'WORKFLOW_EXECUTE_STEP', step, ... },
  { signal: this._abortController.signal }  // 注意：chrome API 不直接支持，需要 wrapper
);

// _cancelUnlocked() 中触发
this._abortController?.abort();
```

由于 Chrome Extension messaging 不原生支持 AbortSignal，可以使用超时 + 轮询包装：

```js
async _executeStepWithCancel(step, claim) {
  return new Promise((resolve, reject) => {
    const checkCancel = setInterval(() => {
      if (this.run.status === WorkflowRunStatus.CANCELLED) {
        clearInterval(checkCancel);
        reject(new Error('CANCELLED'));
      }
    }, 100);

    chrome.tabs.sendMessage(this.run.tabId, { type: 'WORKFLOW_EXECUTE_STEP', step, ... })
      .then(result => {
        clearInterval(checkCancel);
        resolve(result);
      })
      .catch(error => {
        clearInterval(checkCancel);
        reject(error);
      });
  });
}
```

### 建议 2：通知 content script 执行取消清理

```js
async _cancelUnlocked() {
  // ... 现有逻辑 ...
  
  // 通知 content script 清理
  if (this.run.tabId) {
    try {
      await chrome.tabs.sendMessage(this.run.tabId, { type: 'WORKFLOW_CANCEL' });
    } catch (_) { /* tab may already be closed */ }
  }
  
  return this.getStatus();
}
```

在 `workflow-replayer.js` 中增加取消处理：

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'WORKFLOW_CANCEL') {
    // 清理 UI 辅助元素
    document.querySelectorAll('[data-smartpages-highlight]').forEach(el => {
      el.removeAttribute('data-smartpages-highlight');
      el.style.outline = '';
    });
    sendResponse({ ok: true });
    return true;
  }
  // ... 现有 handler ...
});
```

### 建议 3：为 `_cancelUnlocked` 增加序列化保护

```js
async cancel(runId) {
  return this._serialize(async () => {
    await this.ensureHydrated();
    if (typeof runId !== 'string' || !runId.trim()) {
      throw this._error('INVALID_PARAMETERS', 'runId is required to cancel a workflow run.');
    }
    if (this.run && runId !== this.run.runId) {
      throw this._error('STALE_RUN', 'Cancellation does not match the current workflow run.');
    }
    return await this._cancelUnlocked();
  });
}
```

### 建议 4：允许 STARTING 状态下取消

```js
// sidepanel.js
this._setWorkflowRunElementVisible(
  document.getElementById('btn-workflow-cancel'),
  !['FAILED', 'COMPLETED', 'CANCELLED'].includes(state)  // 移除 STARTING
);
```

### 建议 5：增加取消超时和强制清理机制

```js
async cancel(runId) {
  // ... 正常取消流程 ...
  
  // 超时强制清理
  setTimeout(async () => {
    if (this.run?.status === WorkflowRunStatus.CANCELLED && this.run.tabId) {
      try {
        await chrome.tabs.sendMessage(this.run.tabId, { type: 'WORKFLOW_FORCE_CLEANUP' });
      } catch (_) {}
    }
  }, 3000);
}
```

---

## 📊 优先级

| 问题 | 严重程度 | 建议优先级 |
|------|---------|-----------|
| 正在执行的 step 无法中断 | 🔴 严重 | P0 |
| 没有 AbortController / 取消信号 | 🔴 严重 | P0 |
| 竞态条件 | 🟡 中等 | P1 |
| 取消后不清理页面状态 | 🟡 中等 | P1 |
| STARTING 状态无法取消 | 🟢 低 | P2 |
| 取消操作无错误恢复 | 🟢 低 | P2 |
| MCP Bridge fire-and-forget | 🟢 低 | P2 |

---

## 🏷️ Labels

`bug`, `enhancement`, `workflow-engine`, `agent-bridge`
