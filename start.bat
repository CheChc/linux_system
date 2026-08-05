@echo off
REM KERNEL://EXPLORER - Windows 一键启动
REM 双击本文件，或命令行执行: start.bat
cd /d "%~dp0"
echo 启动本地服务器: http://localhost:8899
start "" python -m http.server 8899
timeout /t 1 > nul
start http://localhost:8899
echo 服务器已启动。关闭黑色命令行窗口即可停止。
