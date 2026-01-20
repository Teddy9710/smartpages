#!/bin/bash

# Smart Page Scribe 测试辅助脚本
# 用于验证项目完整性

echo "==================================="
echo "Smart Page Scribe 项目完整性检查"
echo "==================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查结果
pass=0
fail=0

# 检查函数
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((pass++))
    else
        echo -e "${RED}✗${NC} $1 (缺失)"
        ((fail++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        ((pass++))
    else
        echo -e "${RED}✗${NC} $1/ (缺失)"
        ((fail++))
    fi
}

echo "1. 检查核心文件..."
check_file "manifest.json"
check_file "package.json"
check_file "README.md"
echo ""

echo "2. 检查目录结构..."
check_dir "popup"
check_dir "settings"
check_dir "sidepanel"
check_dir "background"
check_dir "content"
check_dir "icons"
echo ""

echo "3. 检查Popup文件..."
check_file "popup/popup.html"
check_file "popup/popup.css"
check_file "popup/popup.js"
echo ""

echo "4. 检查Settings文件..."
check_file "settings/settings.html"
check_file "settings/settings.css"
check_file "settings/settings.js"
echo ""

echo "5. 检查SidePanel文件..."
check_file "sidepanel/sidepanel.html"
check_file "sidepanel/sidepanel.css"
check_file "sidepanel/sidepanel.js"
echo ""

echo "6. 检查Background服务..."
check_file "background/background.js"
echo ""

echo "7. 检查Content Script..."
check_file "content/recorder.js"
echo ""

echo "8. 检查图标文件..."
check_file "icons/icon16.png"
check_file "icons/icon32.png"
check_file "icons/icon48.png"
check_file "icons/icon128.png"

if [ ! -f "icons/icon16.png" ]; then
    echo -e "${YELLOW}⚠${NC} 图标文件缺失，请在浏览器中打开 icons/placeholder.html 生成"
fi
echo ""

echo "9. 检查文档..."
check_file "README.md"
check_file "QUICKSTART.md"
check_file "TESTING.md"
echo ""

echo "10. 验证manifest.json语法..."
if command -v python &> /dev/null; then
    if python -m json.tool manifest.json > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} manifest.json 语法正确"
        ((pass++))
    else
        echo -e "${RED}✗${NC} manifest.json 语法错误"
        ((fail++))
    fi
else
    echo -e "${YELLOW}⚠${NC} 跳过（未找到Python）"
fi
echo ""

echo "==================================="
echo "检查结果："
echo -e "  ${GREEN}通过：${pass}${NC}"
echo -e "  ${RED}失败：${fail}${NC}"
echo "==================================="
echo ""

if [ $fail -eq 0 ]; then
    echo -e "${GREEN}✓ 所有检查通过！可以开始测试插件了。${NC}"
    echo ""
    echo "下一步："
    echo "1. 在浏览器中打开 chrome://extensions/"
    echo "2. 启用开发者模式"
    echo "3. 加载已解压的扩展程序"
    echo "4. 选择当前目录"
    echo ""
    echo "详细测试步骤请参考：TESTING.md"
    exit 0
else
    echo -e "${RED}✗ 发现 ${fail} 个问题，请修复后重试${NC}"
    exit 1
fi
