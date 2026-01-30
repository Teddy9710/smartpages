---
name: wanxiang-image-gen
description: 通过阿里云通义万相API生成图像
emoji: 🖼️
tags: ["image-generation", "aliyun", "dashscope"]
requires:
  bins: ["python3"]
  env: ["DASHSCOPE_API_KEY"]
primaryEnv: "DASHSCOPE_API_KEY"
---

# 通义万相图像生成

使用阿里云通义万相API生成高质量图像。

## 功能

- 文生图：根据文本提示生成图像
- 支持多种模型：qwen-image-plus, qwen-image-max 等
- 支持多种尺寸：1024*1024, 768*768 等
- 支持批量生成：一次生成多张图片
- 支持同步/异步模式
- 支持风格和质量参数

## 使用方法

```python
from wanxiang_image_gen_skill import run_skill

# 基本使用
args = {
    "prompt": "一只小熊猫在竹林里玩耍，高清细节",
    "size": "1024*1024",  # 注意使用*而不是x
    "model": "qwen-image-plus"
}

# 批量生成多张图片
args_batch = {
    "prompt": "风景画，山水，中国传统风格",
    "size": "1024*1024",
    "model": "qwen-image-plus",
    "n": 3,  # 生成3张图片
    "style": "chinese_painting",  # 指定风格
    "quality": "high"  # 指定质量
}

# 同步模式（立即返回结果）
args_sync = {
    "prompt": "现代建筑，未来主义风格",
    "size": "1024*1024",
    "model": "qwen-image-plus",
    "sync": True  # 使用同步模式
}

result = run_skill(args)
if result["success"]:
    print(f"图片已生成: {result['image_paths']}")
    print(f"生成数量: {result['image_count']}")
else:
    print(f"生成失败: {result['error']}")
```

## 参数

- `prompt` (必需): 图像生成的文本提示
- `size` (可选): 图像尺寸，默认 "1024*1024"
- `model` (可选): 使用的模型，默认 "qwen-image-plus"
- `n` (可选): 生成图片数量，默认 1，最大 4
- `style` (可选): 图片风格
- `quality` (可选): 图片质量
- `sync` (可选): 是否使用同步模式，默认 False

## 模型选项

- `qwen-image-plus`: 平衡性能与质量
- `qwen-image-max`: 更高的图像真实度
- `qwen-image`: 基础模型

## 模式说明

- **异步模式** (默认): 快速提交任务，后台处理，返回任务ID
- **同步模式**: 阻塞等待直到生成完成，适用于简单场景

## 注意事项

- API密钥默认使用预设值，可在参数中覆盖
- 异步模式适合批量生成，同步模式适合实时需求
- 尺寸格式必须使用星号(*)连接宽高，如 "1024*1024"
- 批量生成时，单次最多生成4张图片