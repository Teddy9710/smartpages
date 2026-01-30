# 插件更新日志

## 2026年1月30日更新

### 新增功能

1. **通义万相图像生成插件** (`skills/tongyi-wanxiang-gen`)
   - 实现了阿里云通义万相API集成
   - 支持通过API生成高质量图像
   - 包含异步任务处理和图片下载功能
   - 支持多种图像尺寸和模型

2. **Discord消息压缩功能** (`skills/discord-msg-compressor`)
   - 实现了Discord消息历史压缩功能
   - 配置了滑动窗口+摘要模式
   - 自动保留最近10条相关消息
   - 每20条消息转换为摘要存档

3. **语音转文字功能**
   - 集成了PocketSphinx语音识别
   - 支持OGG/WAV音频文件转换
   - 自动处理用户发送的音频消息
   - 转换为文字内容进行处理

### 技术改进

- 优化了插件架构和模块化设计
- 增强了API错误处理和重试机制
- 改进了异步任务管理和状态检查
- 完善了配置管理和错误日志记录

### 使用示例

#### 通义万相图像生成
```python
from skills.tongyi-wanxiang-gen.main import run_skill

args = {
    "prompt": "你的图像描述",
    "size": "1024*1024",  # 注意用*而非x
    "model": "qwen-image-plus"
}

result = run_skill(args)
```

#### Discord消息压缩
- 自动处理Discord消息历史
- 配置滑动窗口大小和摘要转换频率
- 保持上下文连续性的同时减少存储占用

### API配置

- DashScope API密钥：已配置
- 支持模型：qwen-image-plus, qwen-image-max
- 异步任务处理：支持长时间运行的任务