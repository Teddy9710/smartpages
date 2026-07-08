# SmartPages

<p align="right"><a href="README.en.md">English</a></p>

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="SmartPages 图标">
</p>

<h3 align="center">录一次操作，自动写成清晰文档</h3>

<p align="center">
  开源的浏览器工作流录制与 AI 文档生成工具。<br>
  自动捕获操作和截图，生成可编辑、可优化、可导出的专业文档。
</p>

<p align="center">
  <img alt="Chrome Extension MV3" src="https://img.shields.io/badge/Chrome%20Extension-MV3-2563eb">
  <img alt="Version 1.2.0" src="https://img.shields.io/badge/version-1.2.0-7c3aed">
  <img alt="Export formats" src="https://img.shields.io/badge/export-Markdown%20%7C%20HTML%20%7C%20PDF-14b8a6">
  <img alt="License GPL v3" src="https://img.shields.io/badge/license-GPL%20v3-111827">
</p>

<p align="center">
  <img src="docs/assets/smartpages-demo-zh.gif" width="860" alt="SmartPages 从录制网页操作到生成文档的演示">
</p>

## 为什么选择 SmartPages

写操作手册、测试用例或 Bug 复现步骤，最费时间的往往不是操作本身，而是重新整理每一步、截图和措辞。SmartPages 把这段重复劳动压缩成一次录制。

| 自动捕获 | AI 成文 | 灵活交付 |
| --- | --- | --- |
| 记录点击、输入、页面跳转和步骤截图 | 生成用户指南、教程、测试用例、问题报告 | 直接编辑、AI 润色，导出 Markdown、HTML、纯文本和 PDF |

- **自带模型选择权**：支持 GPT、Gemini、Claude、DeepSeek 等服务，也兼容自定义 OpenAI-compatible API。
- **文档风格可控**：可配置提示词、风格指南和示例文档，让输出贴近团队规范。
- **开源且可自托管配置**：扩展本身开源，API Key 保存在浏览器 Chrome Storage 中。

## 它如何工作

1. 在目标网页点击扩展图标，开始录制。
2. 正常完成操作，SmartPages 自动记录步骤和截图。
3. 停止录制，在侧边栏选择文档类型或输入自定义目标。
4. 调用你配置的模型生成文档。
5. 直接编辑、AI 优化，然后复制或导出。

## 安装

### 直接加载源码

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择项目根目录。

### 构建后加载

```bash
git clone https://github.com/Teddy9710/smartpages.git
cd smartpages
npm install
npm run build
```

回到扩展管理页，选择项目中的 `dist/` 目录。后续修改代码后重新运行 `npm run build`，再刷新扩展。

## 快速开始

1. 打开扩展设置，选择模型服务商并填写 API Key、Base URL 和模型名。
2. 点击“测试连接”。
3. 打开需要记录的网页，开始录制并完成操作。
4. 停止录制，在侧边栏选择文档目标并生成。
5. 在预览区直接修改，或使用 AI 继续优化。
6. 复制内容，或导出为 Markdown、HTML、纯文本、Word、ZIP、图片和 PDF。

> PDF 按钮会打开浏览器打印窗口；选择“另存为 PDF”即可保存固定版式文件。

## 核心能力

### 记录真实网页操作

- 捕获点击、输入和 SPA 路由变化。
- 为关键步骤保留页面截图。
- 需要时自动补注入录制脚本，减少手动刷新。

### 生成符合目标的文档

- 内置用户指南、教程、测试用例、问题报告等文档目标。
- 支持追加要求或完全自定义提示词。
- 可按文档类型提供风格指南和 Markdown / HTML 示例。
- 可设置输出格式和最大 Token，适应不同交付场景。

### 在侧边栏完成交付

- 在渲染预览中直接编辑，也可切换到 Markdown 源码。
- 支持 AI 二次优化与版本回退。
- 支持复制、下载和多种导出格式。
- 可管理 TXT、Markdown、HTML、RTF 等文档资源。

## 产品界面

<p align="center">
  <img src="docs/assets/readme-hero.png" width="760" alt="SmartPages 产品界面">
</p>

| 界面 | 用途 |
| --- | --- |
| Popup 弹窗 | 开始或停止录制，查看状态，打开文档助手 |
| Side Panel 侧边栏 | 生成、编辑、优化和导出文档 |
| Settings 设置页 | 配置模型、提示词、风格指南、示例文档和输出格式 |

## 模型兼容

SmartPages 支持两类 API：

- **OpenAI-compatible Chat Completions**：GPT / OpenAI、Gemini / Google、GLM、DeepSeek、MiniMax、Kimi、OpenRouter、SiliconFlow、DashScope，以及自定义兼容服务。
- **Anthropic Messages API**：Claude / Anthropic。

不同服务商的模型名、Base URL、上下文长度和计费规则不同，请以对应官方文档为准。

## 隐私与安全

- API Key 存储在 Chrome Storage 中，不写入仓库。
- 录制数据只在生成文档时发送到你配置的模型 API。
- 扩展页面启用 Manifest V3 CSP，第三方脚本在本地打包。
- 动态 HTML 在渲染和导出前经过清理，降低 XSS 风险。
- 生成提示词要求遮蔽密码、Token、手机号、证件号等敏感内容；录制前仍建议主动避开敏感信息。

## 开发与贡献

```bash
npm run dev         # watch 模式构建 dist/
npm test            # 运行测试
npm run lint        # ESLint 检查
npm run typecheck   # TypeScript 类型检查
npm run build       # 生成可加载的 dist/
npm run verify      # 完整验证
```

更多资料：

- [快速上手](QUICKSTART.md)
- [测试指南](TESTING.md)
- [故障排查](TROUBLESHOOTING.md)
- [代码结构](CODE_STRUCTURE.md)
- [示例文档](docs/examples/README.md)

欢迎提交 Issue 和 Pull Request。贡献前请阅读[贡献者许可协议（CLA）](CONTRIBUTING.md)。

## 许可证

SmartPages 采用双许可证模式：

| 使用场景 | 许可证 | 说明 |
| --- | --- | --- |
| 个人、学习、非商业用途 | [GPL v3](LICENSE) | 可免费使用、修改和分发；衍生作品需继续开源 |
| 商业用途 | 商业许可证 | 集成到商业产品、SaaS 或企业部署前需另行获得授权 |

- 版权所有者（汪鸿儒）保留所有商业权利，可不受限制地商业使用。
- 未经授权，不得将本软件用于任何商业目的，包括但不限于商业产品集成、SaaS 服务、企业部署。
- 商业授权咨询请通过 GitHub Issues 联系作者。

---

## 可执行工作流预览（Phase 1）

SmartPages 可以把一次录制同时导出为供人阅读的 Markdown 文档和供机器读取的 `.smartpages.json` 工作流。侧边栏提供本地 **Test Run**，用于在当前浏览器标签页中审核和回放该流程。

- 支持的动作：`navigate`、`click`、`input`、`select`、`scroll`、`wait` 和 `assert`。
- 工作流只能访问明确声明的、完全匹配的 HTTP/HTTPS Origin；不接受通配符或浏览器特权协议。
- 高风险步骤会在向页面发送操作前暂停，并要求用户明确确认。
- 工作流 JSON 属于不可信输入，执行前必须通过 Schema 校验。
- 密码、Token 等敏感信息应在运行时提供；录制到的输入值不会写入导出的工作流。
- Phase 1 完全在扩展本地运行。MCP Server 与 Native Messaging 只是后续架构方向，**不包含在 Phase 1 中**。

当前预览面向受控的同站点流程回放，不代表已经具备生产级 MCP 集成或跨站点自主操作能力。
 
---

## 本地 Agent Bridge（实验性 Phase 2A）

SmartPages 可以把导出的 `.smartpages.json` workflow 暴露给本机 Agent 调用。轻量版只在本机运行：Agent 通过 MCP stdio 调用 `smartpages-mcp`，`smartpages-mcp` 再通过 `127.0.0.1` WebSocket 连接 SmartPages 扩展，实际页面操作仍由扩展完成。

使用方式：

1. 在侧边栏导出 `.smartpages.json` workflow。
2. 将文件放入 `%LOCALAPPDATA%\SmartPages\workflows\`。
3. 启动本地 MCP Bridge：

   ```bash
   npm run mcp:serve
   ```

4. 复制终端显示的 host、port 和 token。
5. 打开 SmartPages 设置页，启用“本地 Agent Bridge”，填入 port 和 token，点击“测试 Agent Bridge”。
6. 在 Agent 的 MCP 配置中使用 `smartpages-mcp`，即可调用 `list_workflows`、`start_run`、`get_run_status` 和 `cancel_run`。

第一版只支持本机调用。SmartPages 不提供任意 JavaScript 执行、任意文件读取或绕过扩展权限的工具；高风险动作仍由扩展在操作发生前要求用户确认。
