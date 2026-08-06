# Advanced Workflows and Local Agent Bridge

<p align="right"><a href="advanced-workflows.zh-CN.md">中文</a></p>

This guide covers SmartPages' machine-readable workflow export, local test runs, and the experimental Local Agent Bridge. For the standard recording and document-generation flow, start with the [main README](../README.md).

## Executable Workflow Preview (Phase 1)

SmartPages can export a recorded session as both a human-readable Markdown document and a machine-readable `.smartpages.json` workflow. The side panel provides a local **Test Run** for reviewing and replaying that workflow in the current browser tab.

### Safety boundaries

- Supported actions are `navigate`, `click`, `input`, `select`, `scroll`, `wait`, and `assert`.
- Workflows can access only explicitly declared, exactly matching HTTP/HTTPS origins. Wildcards and privileged URL schemes are rejected.
- High-risk steps pause before page dispatch and require explicit confirmation.
- Workflow JSON is untrusted input and must pass schema validation before execution.
- Passwords, tokens, and other secrets are runtime inputs; recorded values are not exported into the workflow.
- Phase 1 runs locally inside the extension.

The preview is intended for controlled, same-site workflow replay. It does not provide autonomous cross-site browsing.

## Local Agent Bridge (Experimental Phase 2A)

SmartPages can expose exported `.smartpages.json` workflows to a local agent through MCP. The lightweight bridge runs only on the user's machine:

```text
Local agent → smartpages-mcp (stdio) → 127.0.0.1 WebSocket → SmartPages extension
```

The browser extension still performs the actual page operations and enforces workflow safety checks.

## Setup

1. Export a `.smartpages.json` workflow from the side panel.
2. Put the file in `%LOCALAPPDATA%\SmartPages\workflows\`.
3. Start the local MCP bridge:

   ```bash
   npm run mcp:serve
   ```

4. Copy the host, port, and token shown in the terminal.
5. Open SmartPages Settings, enable **Local Agent Bridge**, enter the port and token, and select **Test Agent Bridge**.
6. Configure the local agent to use `smartpages-mcp`.

The MCP server exposes `list_workflows`, `start_run`, `get_run_status`, and `cancel_run`.

## First-time checklist

1. Enable Developer mode at `chrome://extensions` and load the project's `dist/` directory, not the source root.
2. Save the model API key in SmartPages Settings. It remains in the extension's local configuration after a reload.
3. Configure the extension with `127.0.0.1`, the bridge port, and the token from `bridge-token.json`.
4. Allow site access when the extension requests permission for the workflow's target origin. A local demo page, for example, requires `http://localhost/*`.
5. Open the workflow's starting page in the desktop Chrome instance where SmartPages is installed.

The agent can replay actions only through that extension. Other browser instances and embedded browser tabs are not controlled by the bridge.

## Replay and troubleshooting

- `start_run` validates the workflow schema, allowed origins, runtime variables, and first-step preconditions before performing any page action.
- The workflow prefers an already-open tab matching the first step's URL precondition, reducing the risk of running on the wrong page.
- If the bridge disconnects, the extension attempts to reconnect automatically. Select **Test Agent Bridge** to reconnect immediately.
- Do not store API keys, bridge tokens, passwords, or other sensitive values in `.smartpages.json` files or commit them to the repository.

The current bridge supports local calls only. SmartPages does not expose arbitrary JavaScript execution, arbitrary file reads, or tools that bypass extension permissions. High-risk actions still require confirmation before dispatch.

## Related documentation

- [SmartPages overview](../README.md)
- [Quick start](../QUICKSTART.md)
- [Troubleshooting](../TROUBLESHOOTING.md)
