# SmartPages：网页流程录制 + AI 自动生成操作文档的开源浏览器插件

> 平台：csdn
> 语气：教程式，强调安装、配置和使用步骤
> 建议标签：Chrome插件, AI, 文档生成, 自动化测试, 开源项目

![SmartPages 演示](../../docs/assets/smartpages-demo-zh.gif)

这是我最近做的一个开源项目：SmartPages。

它想解决一个很具体的问题：很多团队都需要写操作手册、测试步骤、Bug 复现说明、培训文档，但这些内容往往要反复截图、手写步骤、整理格式。

SmartPages 的做法是：录制一次真实网页操作流程，记录点击、输入、页面跳转和截图，然后调用 AI 生成结构化文档。生成后可以继续编辑，也可以导出 Markdown、HTML 或纯文本。

下面是可按平台微调的基础内容：

## 为什么做 SmartPages

写产品操作手册、内部 SOP、测试用例和 Bug 复现步骤时，最消耗精力的通常不是实际操作，而是事后重新截图、回忆步骤、补充说明和调整格式。

SmartPages 希望把这段重复劳动压缩掉：你只需要正常完成一次网页操作，它会记录点击、输入、页面跳转和关键截图，再交给你选择的 AI 模型生成结构化文档。

## 它能做什么

- 录制真实网页操作，自动整理步骤与截图
- 生成用户指南、教程、内部 SOP、测试用例和 Bug 报告
- 支持 OpenAI、Gemini、Claude、DeepSeek、Kimi、Qwen、GLM、MiniMax，以及兼容 OpenAI API 的服务
- 在侧边栏继续编辑、预览和 AI 优化
- 导出 Markdown、HTML、Word、PDF、ZIP 和图片
- 保存本地文档历史，也可选配 Supabase 云同步

## 基本使用流程

1. 下载扩展包，打开 `chrome://extensions/` 或 `edge://extensions/`，开启开发者模式并加载扩展。
2. 在设置页选择模型服务商，填写 API Key、Base URL 和模型名称，测试连接后保存。
3. 打开目标网页并开始录制，按正常路径完成操作后停止录制。
4. 确认步骤和文档目标，生成、修改并导出文档。

## 隐私与控制

API Key 保存在浏览器 Chrome Storage 中。录制内容只在生成文档时发送给你配置的模型 API；只有显式开启图片输入后，未隐藏的步骤截图才会随请求发送。Supabase 同步默认关闭。

录制时仍应主动避开密码、验证码、Token、证件号等敏感信息。

## v1.3 新增内容

- 导出、校验和回放机器可读的 `.smartpages.json` 工作流
- 本地 SmartPages MCP / Agent Bridge
- Supabase 云文档存储
- 更稳定的 iframe 录制、工作流回放和 GIF 编码

项目目前支持 Chrome、Edge 等 Chromium 浏览器，欢迎体验并反馈真实使用场景。

项目地址：
https://github.com/Teddy9710/smartpages

欢迎试用，也欢迎提 Issue、建议或 Star。

---

发布前检查：标题是否像本平台用户会点开的标题；GIF 是否能正常显示；外链是否允许；是否需要保存草稿后再人工预览。