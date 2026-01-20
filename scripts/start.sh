#!/bin/bash

# Message Aggregator 起動スクリプト
# 5100ポートで起動しているプロセスを停止してから起動する

PORT=5100
PROJECT_DIR="/Users/yunoki/Dropbox/project/message-aggregator/src/message-aggregator"
LOG_DIR="$PROJECT_DIR/logs"

# ログディレクトリを作成
mkdir -p "$LOG_DIR"

# 5100ポートで起動しているプロセスを停止
echo "$(date): Checking for processes on port $PORT..." >> "$LOG_DIR/startup.log"
PID=$(/usr/sbin/lsof -ti :$PORT)
if [ -n "$PID" ]; then
    echo "$(date): Killing process $PID on port $PORT" >> "$LOG_DIR/startup.log"
    kill -9 $PID 2>/dev/null
    sleep 2
fi

# プロジェクトディレクトリに移動
cd "$PROJECT_DIR"

# 環境変数を設定（必要に応じて）
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# Node.jsのパスを確認
if command -v node &> /dev/null; then
    NODE_PATH=$(which node)
    echo "$(date): Using Node.js at $NODE_PATH" >> "$LOG_DIR/startup.log"
else
    echo "$(date): ERROR - Node.js not found" >> "$LOG_DIR/startup.log"
    exit 1
fi

# アプリケーションを起動（ポート5100で）
echo "$(date): Starting Message Aggregator on port $PORT..." >> "$LOG_DIR/startup.log"
cd "$PROJECT_DIR/src"

# .env.localから環境変数を読み込む
if [ -f .env.local ]; then
    echo "$(date): Loading .env.local..." >> "$LOG_DIR/startup.log"
    export $(grep -v '^#' .env.local | xargs)
    echo "$(date): DATABASE_URL=${DATABASE_URL:0:50}..." >> "$LOG_DIR/startup.log"
fi

exec npx next start -p $PORT >> "$LOG_DIR/app.log" 2>&1
