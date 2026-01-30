---
name: discord-message-compressor
description: 管理Discord消息历史，实现滑动窗口和摘要归档
emoji: 🗂️
tags: ["discord", "message-management", "history", "compression"]
requires:
  bins: ["python3"]
---

# Discord消息压缩器

管理Discord消息历史记录，使用滑动窗口和摘要归档机制来控制上下文长度。

## 功能

- **滑动窗口**: 保留最近N条消息（默认10条）
- **摘要归档**: 每达到阈值（默认20条）就创建摘要
- **上下文导出/导入**: 支持将当前上下文保存到文件
- **持久化存储**: 重启后仍保留状态

## 使用方法

```python
from discord_message_compressor import run_skill

# 添加消息
result = run_skill({
    "action": "add_message",
    "message": {
        "id": "msg_123",
        "author": "username",
        "content": "Hello, world!",
        "timestamp": "2023-12-01T10:00:00"
    }
})

# 获取当前上下文
context = run_skill({"action": "get_context"})

# 导出上下文到文件
export_result = run_skill({
    "action": "export",
    "filepath": "/path/to/context.json"
})

# 从文件导入上下文
import_result = run_skill({
    "action": "import",
    "filepath": "/path/to/context.json"
})
```

## 参数

- `action`: 操作类型
  - `add_message`: 添加新消息
  - `get_context`: 获取当前上下文
  - `export`: 导出上下文
  - `import`: 导入上下文
- `message`: 消息对象（当action为add_message时）
- `filepath`: 文件路径（当action为export/import时）

## 摘要内容

创建的摘要包含：
- 时间范围
- 消息数量
- 参与者列表
- 话题提取
- 关键点摘要

## 配置

- 窗口大小：默认保留最近10条消息
- 摘要阈值：达到20条消息时创建摘要
- 这些值可以在初始化时修改