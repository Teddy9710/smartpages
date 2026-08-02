# 使用 Supabase 免费版保存云端文档

SmartPages 使用 Supabase Auth、Postgres 和私有 Storage 保存生成的文档。扩展只需要客户端可公开使用的 anon/publishable key；不要填写 `service_role` key。

## 初始化

1. 在 Supabase 创建免费项目，区域建议选择离用户较近的 Singapore。
2. 打开项目的 SQL Editor，运行 [`supabase/schema.sql`](../supabase/schema.sql)。
3. 在 Authentication → Providers 中启用 Email。开发期间可关闭 Confirm email；正式使用建议开启。
4. 在 Project Settings → API 复制 Project URL 和 anon/publishable key。
5. 打开 SmartPages 设置页，在“云端文档（Supabase）”中填写并保存。
6. 返回侧边栏，打开“云端文档”，注册或登录后即可保存。

## 数据和安全

- 文档正文保存在 `public.cloud_documents`。
- Base64 截图会上传到私有 `smartpages-assets` bucket，正文仅保存资产路径。
- Row Level Security 和 Storage Policies 将数据限制到当前登录用户。
- 登录会话保存在扩展的 `chrome.storage.local` 中。
- 编辑器内容同时保留一份本地草稿，云端失败不会清空当前文档。

## 免费额度注意事项

截图通常比正文占用更多空间。Supabase 免费版包含 1 GB Storage；建议在正式发布前增加图片压缩、用量提示和资产清理功能。
