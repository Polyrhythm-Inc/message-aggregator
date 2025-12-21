'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SlackMessage } from '@/types/slack';
import MessageItem from './MessageItem';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5分
const COUNTDOWN_SECONDS = 10; // カウントダウン秒数

function isWithin24Hours(ts: string): boolean {
  const seconds = parseFloat(ts);
  const messageDate = new Date(seconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - messageDate.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return diffMs <= twentyFourHoursMs;
}

function getDateString(ts: string): string {
  const seconds = parseFloat(ts);
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

type Props = {
  deleteMode: boolean;
};

export default function MessageList({ deleteMode }: Props) {
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/slack/messages');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '取得に失敗しました');
      }
      const data = await res.json();
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = async (ts: string) => {
    const res = await fetch('/api/slack/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ts }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '削除に失敗しました');
    }

    // 削除後、即座に状態から削除し、再取得
    setMessages((prev) => prev.filter((m) => m.ts !== ts));

    // バックグラウンドで再取得（ローディング表示なし）
    fetch('/api/slack/messages')
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // countdownの状態とrefを同期
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);

  // アイドル検出とカウントダウン
  useEffect(() => {
    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      // カウントダウン中ならキャンセル
      if (countdownRef.current !== null) {
        setCountdown(null);
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }
    };

    const startCountdown = () => {
      setCountdown(COUNTDOWN_SECONDS);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            // カウントダウン終了、再読み込み
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            fetchMessages();
            lastActivityRef.current = Date.now();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const checkIdle = () => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS && countdownRef.current === null) {
        startCountdown();
      }
    };

    // アクティビティイベントのリスナー
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => {
      window.addEventListener(event, resetActivity);
    });

    // 1秒ごとにアイドルチェック
    idleTimerRef.current = setInterval(checkIdle, 1000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetActivity);
      });
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [fetchMessages]);

  // 24時間の境界インデックスを計算
  const dividerIndex = useMemo(() => {
    for (let i = 0; i < messages.length; i++) {
      if (!isWithin24Hours(messages[i].ts)) {
        return i;
      }
    }
    return -1; // 全て24時間以内、または全て24時間以降
  }, [messages]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-200">{error}</p>
        <button
          onClick={fetchMessages}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          再試行
        </button>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        メッセージがありません
      </div>
    );
  }

  return (
    <>
      {/* カウントダウン表示 */}
      {countdown !== null && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <span className="text-sm">
            {countdown}秒後に再読み込み
          </span>
        </div>
      )}

      <div className="space-y-4">
        {messages.map((message, index) => {
          const currentDate = getDateString(message.ts);
          const prevDate = index > 0 ? getDateString(messages[index - 1].ts) : null;
          const showDateDivider = prevDate !== null && prevDate !== currentDate;

          return (
            <div key={message.ts}>
              {/* 24時間以上前の区切り */}
              {index === dividerIndex && dividerIndex >= 0 && (
                <div className="flex items-center gap-4 py-4">
                  <div className="flex-1 h-px bg-orange-300 dark:bg-orange-600"></div>
                  <span className="text-sm text-orange-500 dark:text-orange-400 whitespace-nowrap font-medium">
                    24時間以上前
                  </span>
                  <div className="flex-1 h-px bg-orange-300 dark:bg-orange-600"></div>
                </div>
              )}
              {/* 日付の区切り */}
              {showDateDivider && (
                <div className="flex items-center gap-4 py-4">
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {currentDate}
                  </span>
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
                </div>
              )}
              <MessageItem
                message={message}
                onDelete={() => handleDelete(message.ts)}
                deleteMode={deleteMode}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
