# 使用 Supabase 免费版保存云端文档

SmartPages 使用 Supabase Auth、Postgres 和私有 Storage 保存生成的文档。扩展只需要客户端可公开使用的 anon/publishable key；不要填写 `service_role` key。

## 初始化

1. 在 Supabase 创建免费项目，区域建议选择离用户较近的 Singapore。
2. 打开项目的 SQL Editor，运行 [`supabase/schema.sql`](../supabase/schema.sql)。已有 SmartPages 云端表的项目也需要重新运行一次，以创建版本历史表和保存函数；脚本可重复执行。
3. 在 Authentication → Providers 中启用 Email。开发期间可关闭 Confirm email；正式使用建议开启。
4. 在 Project Settings → API 复制 Project URL 和 anon/publishable key。
5. 打开 SmartPages 设置页，在“云端文档（Supabase）”中填写并保存。
6. 返回侧边栏，打开“生成文档历史”，注册或登录后即可保存。

## 使用生成文档历史

- 登录后，每次 AI 生成成功会自动写入一条“生成”版本；点击“保存云端”会在同一文档下追加版本。
- 点击侧边栏顶部的历史按钮可搜索生成文档、打开当前内容继续编辑、展开所有版本、把任一版本另存为最新版本，或删除文档及其全部版本。
- 打开旧版本后继续编辑，再点击“保存云端”，会在当前版本链末尾创建新版本，不会覆盖旧快照。
- “文档管理”中的上传内容是 AI 参考文档，仍使用原有参考文档列表，不会进入生成文档历史。

## 数据和安全

- 文档当前内容保存在 `public.cloud_documents`，不可变版本快照保存在 `public.cloud_document_versions`。
- Base64 截图会上传到私有 `smartpages-assets` bucket，正文仅保存资产路径；超过 512 KB 的静态图片会在明显缩小时转为 WebP。
- Row Level Security 和 Storage Policies 将数据限制到当前登录用户。
- 登录会话保存在扩展的 `chrome.storage.local` 中。
- 编辑器内容同时保留一份本地草稿，云端失败不会清空当前文档。

## 免费额度注意事项

截图通常比正文占用更多空间。SmartPages 会压缩较大的静态截图，并在删除文档或保存失败时清理对应资产；仍建议在 Supabase 控制台设置用量告警。
