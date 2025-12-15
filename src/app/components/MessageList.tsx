'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SlackMessage } from '@/types/slack';
import MessageItem from './MessageItem';

function isWithin24Hours(ts: string): boolean {
  const seconds = parseFloat(ts);
  const messageDate = new Date(seconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - messageDate.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return diffMs <= twentyFourHoursMs;
}

export default function MessageList() {
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div key={message.ts}>
          {index === dividerIndex && dividerIndex >= 0 && (
            <div className="flex items-center gap-4 py-4">
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
              <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                24時間以上前
              </span>
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
            </div>
          )}
          <MessageItem
            message={message}
            onDelete={() => handleDelete(message.ts)}
          />
        </div>
      ))}
    </div>
  );
}
