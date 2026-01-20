# 图标文件说明

本插件需要以下尺寸的图标文件：

- icon16.png (16x16) - 工具栏小图标
- icon32.png (32x32) - Windows扩展管理
- icon48.png (48x48) - 扩展管理页面
- icon128.png (128x128) - Chrome Web Store

## 推荐图标设计

- 主色调：#667eea (紫色) 到 #764ba2 (深紫)
- 设计元素：文档/笔的图标
- 风格：简洁、现代

## 快速创建图标

您可以使用以下方法创建图标：

### 方法1: 在线工具
访问 https://www.favicon-generator.org/ 或类似的在线图标生成工具

### 方法2: 使用代码生成图标
在项目根目录运行：

```bash
# 使用ImageMagick
convert -size 128x128 xc:none -fill "#667eea" -draw "circle 64,64 64,0" -fill white -pointsize 80 -gravity center -annotate 0 "S" icons/icon128.png
convert icons/icon128.png -resize 48x48 icons/icon48.png
convert icons/icon128.png -resize 32x32 icons/icon32.png
convert icons/icon128.png -resize 16x16 icons/icon16.png
```

### 方法3: 使用简单图标
在开发期间，您可以使用纯色方块作为临时图标，任何PNG图像都可以工作。

## 临时解决方案

开发期间，您可以：
1. 从网上下载免费图标（如 Flaticon, Icons8）
2. 使用简单的PNG图片作为占位符
3. 使用浏览器默认图标（修改manifest.json中的icons部分）
