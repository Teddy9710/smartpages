# Smart Page Scribe - 文档上传功能

本文档详细介绍了Smart Page Scribe的文档上传功能。

## 功能概述

文档上传功能允许用户将各种格式的文档上传到本地存储或GitHub仓库，并将其与录制的会话相关联。

## 支持的文档格式

- PDF (.pdf)
- Word文档 (.docx)
- 纯文本 (.txt)
- Markdown (.md)
- HTML文件 (.html)
- 富文本格式 (.rtf)

## 上传方式

### 1. 本地上传

将文档上传到本地存储，便于后续检索和关联。

### 2. GitHub上传

直接将文档上传到指定的GitHub仓库，支持：

- 指定仓库和分支
- 自动提交消息生成
- 上传历史追踪

## 文档关联

上传的文档可以与录制会话关联，实现：

- 自动生成相关文档引用
- 会话和文档的双向查找
- 文档在生成的Markdown中的引用

## API接口

系统提供了RESTful API接口用于文档管理：

### 上传文档
```
POST /api/upload-document
Content-Type: multipart/form-data

FormData包含:
- file: 文件对象
- filename: 文件名
- size: 文件大小
- type: 文件类型
- description: 描述（可选）
- tags: 标签数组（可选）
- metadata: 元数据（可选）
```

### 获取文档
```
GET /api/documents/{documentId}
```

### 搜索文档
```
GET /api/search?q={query}&type={type}
```

### 删除文档
```
DELETE /api/documents/{documentId}
```

### 获取统计信息
```
GET /api/stats
```

## 使用方法

### 1. 通过上传面板

1. 点击扩展图标
2. 选择"文档上传"选项
3. 拖拽或选择文件
4. 填写描述和标签
5. 选择上传方式
6. 点击上传

### 2. 通过编程接口

```javascript
const uploadManager = new DocumentUploadManager();

// 单文件上传
const result = await uploadManager.uploadFile(file, {
  description: '文档描述',
  tags: ['tag1', 'tag2']
});

// 批量上传
const results = await uploadManager.uploadFiles(files, {
  batchProgressCallback: (progress, current, total) => {
    console.log(`上传进度: ${progress}% (${current}/${total})`);
  }
});

// GitHub上传
const githubResult = await uploadManager.uploadToGitHub(file, {
  token: 'your_github_token',
  repo: 'username/repository',
  branch: 'main'
});
```

## 关联管理

```javascript
const associator = new DocumentAssociator();

// 关联文档到会话
await associator.associateDocumentWithSession(documentInfo, sessionId);

// 获取会话相关文档
const docs = await associator.getDocumentsForSession(sessionId);

// 获取文档相关会话
const sessions = await associator.getSessionsForDocument(documentId);
```

## 性能和安全

- 文件上传采用异步处理，不会阻塞UI
- 支持大文件分块上传（待实现）
- GitHub上传使用Personal Access Token进行身份验证
- 本地存储使用Chrome Storage API加密存储

## 错误处理

系统提供了完善的错误处理机制：

- 文件格式验证
- 上传进度跟踪
- 错误重试机制
- 上传历史记录

## 配置选项

上传功能支持以下配置：

- 支持的文件格式列表
- 上传大小限制
- GitHub仓库默认设置
- 自动关联规则

## 扩展开发

如需扩展上传功能：

1. 修改 `supportedFormats` 数组以支持新格式
2. 扩展 `getFileIcon` 方法以添加新格式的图标
3. 实现新的上传处理器以支持其他存储服务
4. 扩展API处理器以支持新的功能