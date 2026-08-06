# 高级工作流与本地 Agent Bridge

<p align="right"><a href="advanced-workflows.md">English</a></p>

本指南介绍 SmartPages 的机器可读工作流导出、本地测试运行，以及实验性的本地 Agent Bridge。标准的录制与文档生成流程请先阅读[项目首页](../README.zh-CN.md)。

## 可执行工作流预览（Phase 1）

SmartPages 可以把一次录制同时导出为供人阅读的 Markdown 文档和供机器读取的 `.smartpages.json` 工作流。侧边栏提供本地 **Test Run**，用于在当前浏览器标签页中审核和回放该流程。

### 安全边界

- 支持的动作包括 `navigate`、`click`、`input`、`select`、`scroll`、`wait` 和 `assert`。
- 工作流只能访问明确声明、完全匹配的 HTTP/HTTPS Origin；不接受通配符或浏览器特权协议。
- 高风险步骤会在向页面发送操作前暂停，并要求用户明确确认。
- 工作流 JSON 属于不可信输入，执行前必须通过 Schema 校验。
- 密码、Token 等敏感信息应在运行时提供；录制到的输入值不会写入导出的工作流。
- Phase 1 完全在扩展本地运行。

当前预览面向受控的同站点流程回放，不提供跨站点自主浏览能力。

## 本地 Agent Bridge（实验性 Phase 2A）

SmartPages 可以通过 MCP 将导出的 `.smartpages.json` 工作流提供给本地 Agent。轻量版 Bridge 只在用户的电脑上运行：

```text
本地 Agent → smartpages-mcp（stdio）→ 127.0.0.1 WebSocket → SmartPages 扩展
```

实际页面操作仍由浏览器扩展完成，并由扩展执行工作流安全检查。

## 配置步骤

1. 在侧边栏导出 `.smartpages.json` 工作流。
2. 将文件放入 `%LOCALAPPDATA%\SmartPages\workflows\`。
3. 启动本地 MCP Bridge：

   ```bash
   npm run mcp:serve
   ```

4. 复制终端显示的 host、port 和 token。
5. 打开 SmartPages 设置页，启用**本地 Agent Bridge**，填入端口和 token，然后点击**测试 Agent Bridge**。
6. 在本地 Agent 的 MCP 配置中使用 `smartpages-mcp`。

MCP Server 提供 `list_workflows`、`start_run`、`get_run_status` 和 `cancel_run`。

## 首次接入检查清单

1. 在 `chrome://extensions` 开启开发者模式，并加载项目的 `dist/` 目录，而不是源码根目录。
2. 在 SmartPages 设置页保存模型 API Key。重载扩展后，本地配置仍会保留。
3. 使用 `127.0.0.1`、Bridge 端口和 `bridge-token.json` 中的 token 配置扩展。
4. 当扩展请求工作流目标站点的访问权限时予以允许。例如，本地演示页需要 `http://localhost/*`。
5. 在安装了 SmartPages 扩展的桌面 Chrome 中打开工作流要求的起始页面。

Agent 只能通过该扩展回放操作；其他浏览器实例或内置浏览器标签不会被 Bridge 控制。

## 回放与排障

- `start_run` 会先校验工作流 Schema、允许的 Origin、运行时变量和首步前置条件；检查失败时不会执行页面操作。
- 工作流会优先匹配首步 URL 前置条件对应的已打开标签，降低在错误页面执行的风险。
- Bridge 断开后，扩展会自动尝试重连；也可点击**测试 Agent Bridge**立即重新连接。
- 不要将 API Key、Bridge token、密码或其他敏感值写入 `.smartpages.json` 或提交到仓库。

当前版本只支持本机调用。SmartPages 不提供任意 JavaScript 执行、任意文件读取或绕过扩展权限的工具；高风险动作仍需在执行前得到确认。

## 相关文档

- [SmartPages 项目首页](../README.zh-CN.md)
- [快速上手](../QUICKSTART.md)
- [故障排查](../TROUBLESHOOTING.md)
