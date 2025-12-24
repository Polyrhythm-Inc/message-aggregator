#!/bin/bash

# ngrok 起動スクリプト
# msg-aggregatorトンネルを起動

PROJECT_DIR="/Users/yunoki/Dropbox/project/message-aggregator/src/message-aggregator"
LOG_DIR="$PROJECT_DIR/logs"

# ログディレクトリを作成
mkdir -p "$LOG_DIR"

echo "$(date): Starting ngrok..." >> "$LOG_DIR/ngrok-startup.log"

# 既存のngrokプロセスを停止
pkill -f "ngrok start msg-aggregator" 2>/dev/null
sleep 1

# PATHを設定
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# ngrokを起動
exec ngrok start msg-aggregator >> "$LOG_DIR/ngrok.log" 2>&1
