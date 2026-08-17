# 使用腾讯云 CloudBase 保存云端文档

SmartPages 支持腾讯云 CloudBase PostgreSQL 原生模式，适合主要用户位于中国大陆的部署。扩展使用客户端可公开的 Publishable Key，不需要也不应保存腾讯云 SecretId、SecretKey 或服务端密钥。

## 初始化

1. 在腾讯云云开发平台创建环境，地域优先选择上海。
2. 启用 PostgreSQL 原生数据库和身份认证，并开启邮箱/密码登录。
3. 在 DMC 数据库管理中运行 [`cloudbase/schema.sql`](../cloudbase/schema.sql)。
4. 在 API Key 页面创建 Publishable Key，并按控制台提示允许认证、PostgreSQL API 和云存储能力。
5. 如果控制台要求配置安全来源，将扩展来源加入允许列表；扩展 ID 固定后再配置正式环境。
6. 打开 SmartPages 设置页，选择“腾讯云 CloudBase（国内）”，填写环境 ID、Publishable Key 和地域。
7. 返回侧边栏注册或登录，然后保存生成文档。

## 数据与权限

- 当前内容和不可变版本分别位于 `public.cloud_documents` 与 `public.cloud_document_versions`。
- Base64 截图上传到私有 `smartpages-assets` Bucket，正文只保存对象路径；超过 512 KB 的静态图片会在明显缩小时转为 WebP。
- PostgreSQL RLS 与 Storage RLS 均按 `auth.uid()` 隔离用户数据。
- CloudBase 登录状态由官方 Web SDK 保存在本地；SmartPages 不保存腾讯云服务端密钥。
- 删除文档会同步清理其对象目录；数据库保存失败时会回滚本次新上传的图片。

## 注意

- CloudBase 邮箱注册策略以控制台配置为准；启用邮箱验证时，用户需要先完成验证再登录。
- 免费体验和正式套餐额度会变化，请以腾讯云最新价格页为准。
- Supabase 和 CloudBase 配置二选一；切换服务商不会自动迁移已有云端数据。
