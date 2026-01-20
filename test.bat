@echo off
setlocal enabledelayedexpansion

echo ===================================
echo Smart Page Scribe 项目完整性检查
echo ===================================
echo.

set pass=0
set fail=0

:checkfile
if exist "%~1" (
    echo [√] %~1
    set /a pass+=1
) else (
    echo [X] %~1 ^(缺失^)
    set /a fail+=1
)
goto :eof

echo 1. 检查核心文件...
call :checkfile "manifest.json"
call :checkfile "package.json"
call :checkfile "README.md"
echo.

echo 2. 检查目录结构...
if exist "popup\" echo [√] popup\
if exist "settings\" echo [√] settings\
if exist "sidepanel\" echo [√] sidepanel\
if exist "background\" echo [√] background\
if exist "content\" echo [√] content\
if exist "icons\" echo [√] icons\
echo.

echo 3. 检查Popup文件...
call :checkfile "popup\popup.html"
call :checkfile "popup\popup.css"
call :checkfile "popup\popup.js"
echo.

echo 4. 检查Settings文件...
call :checkfile "settings\settings.html"
call :checkfile "settings\settings.css"
call :checkfile "settings\settings.js"
echo.

echo 5. 检查SidePanel文件...
call :checkfile "sidepanel\sidepanel.html"
call :checkfile "sidepanel\sidepanel.css"
call :checkfile "sidepanel\sidepanel.js"
echo.

echo 6. 检查Background服务...
call :checkfile "background\background.js"
echo.

echo 7. 检查Content Script...
call :checkfile "content\recorder.js"
echo.

echo 8. 检查图标文件...
call :checkfile "icons\icon16.png"
call :checkfile "icons\icon32.png"
call :checkfile "icons\icon48.png"
call :checkfile "icons\icon128.png"

if not exist "icons\icon16.png" (
    echo [!] 图标文件缺失，请在浏览器中打开 icons\placeholder.html 生成
)
echo.

echo 9. 检查文档...
call :checkfile "README.md"
call :checkfile "QUICKSTART.md"
call :checkfile "TESTING.md"
echo.

echo ===================================
echo 检查结果：
echo   通过：%pass%
echo   失败：%fail%
echo ===================================
echo.

if %fail%==0 (
    echo [√] 所有检查通过！可以开始测试插件了。
    echo.
    echo 下一步：
    echo 1. 在浏览器中打开 chrome://extensions/
    echo 2. 启用开发者模式
    echo 3. 加载已解压的扩展程序
    echo 4. 选择当前目录
    echo.
    echo 详细测试步骤请参考：TESTING.md
) else (
    echo [X] 发现 %fail% 个问题，请修复后重试
)

pause
