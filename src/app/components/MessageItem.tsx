'use client';

import { useState, useMemo, ReactNode } from 'react';
import { SlackMessage } from '@/types/slack';
import { extractSlackUrlInfo, SlackUrlInfo } from '@/lib/slack-url-parser';

type Props = {
  message: SlackMessage;
  onDelete: () => Promise<void>;
};

function formatTimestamp(ts: string): string {
  const seconds = parseFloat(ts);
  const date = new Date(seconds * 1000);

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isWithin24Hours(ts: string): boolean {
  const seconds = parseFloat(ts);
  const messageDate = new Date(seconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - messageDate.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return diffMs <= twentyFourHoursMs;
}

function formatMessageText(text: string): ReactNode[] {
  // メンションを変換
  const processed = text.replace(/<@U031ZRTQY>/g, '@柚木仁 (Hitoshi Yunoki)');

  // URLを検出してリンク化
  const urlRegex = /https?:\/\/[^\s<>]+/g;
  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(processed)) !== null) {
    // URL前のテキスト
    if (match.index > lastIndex) {
      result.push(processed.slice(lastIndex, match.index));
    }
    // URLをリンクとして追加
    result.push(
      <a
        key={match.index}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {match[0]}
      </a>
    );
    lastIndex = urlRegex.lastIndex;
  }

  // 残りのテキスト
  if (lastIndex < processed.length) {
    result.push(processed.slice(lastIndex));
  }

  return result.length > 0 ? result : [processed];
}

export default function MessageItem({ message, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 返信関連の状態
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);

  // メッセージからSlack URL情報を抽出
  const slackUrlInfo: SlackUrlInfo | null = useMemo(() => {
    return extractSlackUrlInfo(message.text || '');
  }, [message.text]);

  const canReply = slackUrlInfo !== null;

  const handleDeleteClick = () => {
    if (confirming) {
      setDeleting(true);
      onDelete().finally(() => {
        setDeleting(false);
        setConfirming(false);
      });
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const handleReplyClick = () => {
    setReplying(!replying);
    setReplyError(null);
    setReplySuccess(false);
  };

  const handleReply = async () => {
    if (!slackUrlInfo || !replyText.trim()) return;

    setSending(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      const res = await fetch('/api/slack/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: slackUrlInfo.workspace,
          channelId: slackUrlInfo.channelId,
          threadTs: slackUrlInfo.threadTs || slackUrlInfo.messageTs,
          text: replyText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '返信に失敗しました');
      }

      // 成功時
      setReplyText('');
      setReplySuccess(true);
      setTimeout(() => {
        setReplying(false);
        setReplySuccess(false);
      }, 2000);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSending(false);
    }
  };

  // メールの場合とそうでない場合で表示を分ける
  const renderContent = () => {
    if (message.email) {
      return (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
              メール
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              From: {message.email.from}
            </span>
          </div>
          <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">
            {message.email.subject}
          </p>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words text-sm">
            {formatMessageText(message.email.body)}
          </p>
        </div>
      );
    }

    return (
      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
        {message.text ? formatMessageText(message.text) : '(内容なし)'}
      </p>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-2">
        <span
          className={`text-sm ${
            isWithin24Hours(message.ts)
              ? 'text-orange-500 font-bold'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {formatTimestamp(message.ts)}
        </span>
        <div className="flex gap-2">
          {canReply && (
            <button
              onClick={handleReplyClick}
              className={`px-3 py-1 text-sm rounded-md transition-colors min-w-[56px] ${
                replying
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}
            >
              返信
            </button>
          )}
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 min-w-[72px] ${
              confirming
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
          >
            {deleting ? '削除中...' : confirming ? '削除OK？' : '削除'}
          </button>
        </div>
      </div>
      {renderContent()}

      {/* 返信フォーム */}
      {replying && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (replyText.trim() && !sending) {
                  handleReply();
                }
              }
            }}
            placeholder="返信を入力..."
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            disabled={sending}
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              {replyError && (
                <p className="text-red-500 dark:text-red-400 text-sm">
                  {replyError}
                </p>
              )}
              {replySuccess && (
                <p className="text-green-500 dark:text-green-400 text-sm">
                  返信を送信しました
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setReplying(false);
                  setReplyText('');
                  setReplyError(null);
                }}
                disabled={sending}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || sending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? '送信中...' : '送信 ⌘↵'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
