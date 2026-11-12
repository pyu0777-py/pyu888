@echo off
chcp 65001 >nul
title Astro 项目全能助手
color 0A

echo ========================================
echo      Astro 项目全能助手正在启动...
echo ========================================
echo.

:: 第一步：清理缓存
echo [1/3] 正在清理旧缓存...
powershell -ExecutionPolicy Bypass -File .\clear-cover-cache.ps1
echo.

:: 第二步：启动开发服务器
echo [2/3] 正在启动本地开发服务器...
start npm run dev
timeout /t 3 /nobreak >nul
echo.

:: 第三步：询问是否提交
echo [3/3] 网站已启动！你可以去浏览器看效果了。
echo 当你改完代码想上传时，请在下方输入 y 并回车；
echo 如果只是想看看网站，直接关闭此窗口即可。
echo ----------------------------------------
set /p choice="现在要提交并推送代码吗？(y/n): "

if /i "%choice%"=="y" (
    echo.
    echo 正在打包代码...
    git add .
    git commit -m "更新代码"
    
    echo 正在推送到 GitHub...
    git push -u origin main
    
    echo.
    echo ========================================
    echo      恭喜！代码已成功上传！
    echo ========================================
) else (
    echo.
    echo 好的，保持网站运行中。
)

pause