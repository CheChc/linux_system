#!/bin/bash
# KERNEL://EXPLORER — macOS 一键启动
# 双击本文件，或终端执行: bash start.command
cd "$(dirname "$0")"
echo "启动本地服务器: http://localhost:8899"
python3 -m http.server 8899 > /dev/null 2>&1 &
SERVER_PID=$!
sleep 1
open "http://localhost:8899"
echo "服务器已启动 (PID $SERVER_PID)。关闭本终端窗口即可停止。"
