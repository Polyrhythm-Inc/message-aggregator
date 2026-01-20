#!/bin/bash
#
# Message Aggregator 開発サーバー起動スクリプト（Watchdog付き）
#
# 機能:
# - ヘルスチェックによる自動再起動
# - メモリ使用量監視
# - 定期的なプロセス再起動（オプション）
#

PORT=5100
PROJECT_DIR="/Users/yunoki/Dropbox/project/message-aggregator/src/message-aggregator"
SRC_DIR="$PROJECT_DIR/src"
LOG_DIR="$PROJECT_DIR/logs"
HEALTH_CHECK_INTERVAL=30  # ヘルスチェック間隔（秒）
HEALTH_CHECK_TIMEOUT=10   # ヘルスチェックタイムアウト（秒）
MAX_RESTART_ATTEMPTS=5    # 最大再起動試行回数
MEMORY_THRESHOLD_MB=2000  # メモリ警告閾値（MB）

# ログディレクトリを作成
mkdir -p "$LOG_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WATCHDOG] $1" | tee -a "$LOG_DIR/watchdog.log"
}

# サーバーを停止
stop_server() {
    local pid=$(/usr/sbin/lsof -ti :$PORT 2>/dev/null)
    if [ -n "$pid" ]; then
        log "Stopping server (PID: $pid)..."
        kill -15 $pid 2>/dev/null
        sleep 2
        # まだ動いていれば強制終了
        pid=$(/usr/sbin/lsof -ti :$PORT 2>/dev/null)
        if [ -n "$pid" ]; then
            log "Force killing server (PID: $pid)..."
            kill -9 $pid 2>/dev/null
            sleep 1
        fi
    fi
}

# サーバーを起動
start_server() {
    log "Starting development server on port $PORT..."
    cd "$SRC_DIR"

    # .env.localから環境変数を読み込む
    if [ -f .env.local ]; then
        export $(grep -v '^#' .env.local | xargs)
    fi

    # バックグラウンドで起動（Turbopack使用）
    npm run dev > "$LOG_DIR/dev-server.log" 2>&1 &
    local server_pid=$!

    # 起動待ち（最大30秒）
    for i in {1..30}; do
        sleep 1
        if curl -s --max-time 2 "http://127.0.0.1:$PORT" > /dev/null 2>&1; then
            log "Server started successfully (PID: $server_pid)"
            return 0
        fi
    done

    log "ERROR: Server failed to start within 30 seconds"
    return 1
}

# ヘルスチェック
health_check() {
    local response=$(curl -s --max-time $HEALTH_CHECK_TIMEOUT -w "%{http_code}" "http://127.0.0.1:$PORT" -o /dev/null 2>/dev/null)
    if [ "$response" = "200" ]; then
        return 0
    else
        return 1
    fi
}

# メモリ使用量チェック
check_memory() {
    local pid=$(/usr/sbin/lsof -ti :$PORT 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
        # macOSでのメモリ使用量取得（MB単位）
        local mem_kb=$(ps -o rss= -p $pid 2>/dev/null | tr -d ' ')
        if [ -n "$mem_kb" ]; then
            local mem_mb=$((mem_kb / 1024))
            if [ $mem_mb -gt $MEMORY_THRESHOLD_MB ]; then
                log "WARNING: High memory usage: ${mem_mb}MB (threshold: ${MEMORY_THRESHOLD_MB}MB)"
                return 1
            fi
        fi
    fi
    return 0
}

# シグナルハンドラ
cleanup() {
    log "Received shutdown signal. Stopping server..."
    stop_server
    exit 0
}

trap cleanup SIGINT SIGTERM

# メインループ
main() {
    log "=== Watchdog starting ==="
    log "Port: $PORT"
    log "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
    log "Memory threshold: ${MEMORY_THRESHOLD_MB}MB"

    local restart_count=0
    local last_restart_time=0

    # 初回起動
    stop_server
    if ! start_server; then
        log "ERROR: Initial server start failed"
        exit 1
    fi

    while true; do
        sleep $HEALTH_CHECK_INTERVAL

        # ヘルスチェック
        if ! health_check; then
            log "Health check failed! Restarting server..."
            stop_server

            # リスタートカウント更新（1時間以内の再起動回数をカウント）
            local current_time=$(date +%s)
            if [ $((current_time - last_restart_time)) -gt 3600 ]; then
                restart_count=0
            fi
            restart_count=$((restart_count + 1))
            last_restart_time=$current_time

            if [ $restart_count -gt $MAX_RESTART_ATTEMPTS ]; then
                log "ERROR: Too many restart attempts ($restart_count). Exiting..."
                exit 1
            fi

            if ! start_server; then
                log "ERROR: Server restart failed (attempt $restart_count/$MAX_RESTART_ATTEMPTS)"
                sleep 10
                continue
            fi
        fi

        # メモリチェック
        check_memory
    done
}

main "$@"
