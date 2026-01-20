#!/bin/bash

# Message Aggregator 健全性監視スクリプト
# 30秒ごとにHTTPステータスをチェックし、異常があれば自動再起動

# PATH設定（LaunchAgent環境用）
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin"

NGROK_URL="https://msg-agg-poly.au.ngrok.io"
LOCAL_URL="http://localhost:5100"
PLIST_NAME="com.yunoki.message-aggregator"
LOG_FILE="/Users/yunoki/Dropbox/project/message-aggregator/src/message-aggregator/logs/health-check.log"
CHECK_INTERVAL=30
MAX_FAILURES=2

# カウンター
FAILURE_COUNT=0
CHECK_COUNT=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  # 即座にフラッシュ
  sync
}

restart_service() {
  log "Restarting $PLIST_NAME..."
  launchctl unload ~/Library/LaunchAgents/${PLIST_NAME}.plist 2>/dev/null
  sleep 2
  launchctl load ~/Library/LaunchAgents/${PLIST_NAME}.plist
  log "Service restarted"
  FAILURE_COUNT=0
  sleep 10  # 起動待ち
}

check_health() {
  # 1. ローカルサーバーのチェック
  LOCAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LOCAL_URL" --max-time 10 2>/dev/null)

  if [[ "$LOCAL_STATUS" != "200" ]]; then
    log "ERROR: Local server returned status $LOCAL_STATUS"
    return 1
  fi

  # 2. ngrok経由のメインページチェック
  NGROK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$NGROK_URL" --max-time 15 2>/dev/null)

  if [[ "$NGROK_STATUS" != "200" ]]; then
    log "ERROR: ngrok endpoint returned status $NGROK_STATUS"
    return 1
  fi

  # 3. 静的ファイル（JS/CSS）のチェック - HTMLからすべてのパスを取得してチェック
  HTML_CONTENT=$(curl -s "$NGROK_URL" --max-time 15 2>/dev/null)

  # _next/static のすべてのJS/CSSファイルをチェック
  STATIC_FILES=$(echo "$HTML_CONTENT" | grep -oE '_next/static/[^"]+\.(js|css)' | sort -u)

  for FILE_PATH in $STATIC_FILES; do
    FILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$NGROK_URL/$FILE_PATH" --max-time 5 2>/dev/null)

    if [[ "$FILE_STATUS" != "200" ]]; then
      log "ERROR: Static file returned status $FILE_STATUS ($FILE_PATH)"
      return 1
    fi
  done

  return 0
}

# メインループ
log "Health check service started"

while true; do
  CHECK_COUNT=$((CHECK_COUNT + 1))
  log "Starting check #$CHECK_COUNT"

  if check_health; then
    if [[ $FAILURE_COUNT -gt 0 ]]; then
      log "Service recovered"
    fi
    # 5分ごと（10回に1回）にOKログ出力
    if [[ $((CHECK_COUNT % 10)) -eq 0 ]]; then
      log "Health check OK (#$CHECK_COUNT)"
    fi
    FAILURE_COUNT=0
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    log "Health check failed (count: $FAILURE_COUNT/$MAX_FAILURES)"

    if [[ $FAILURE_COUNT -ge $MAX_FAILURES ]]; then
      log "Max failures reached, restarting service..."
      restart_service
    fi
  fi

  sleep $CHECK_INTERVAL
done
