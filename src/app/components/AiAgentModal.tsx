'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultMessage: string;
};

export default function AiAgentModal({ isOpen, onClose, defaultMessage }: Props) {
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(async () => {
    if (sending || !message) return;

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message, sending]);

  // モーダルが開いたときにフォーカスとデフォルト値を設定
  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage);
      setError(null);
      setSuccess(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultMessage]);

  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !sending) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, sending]);

  const handleSubmit = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      // ai-org-coreのセッション開始APIをコール（Next.jsプロキシ経由）
      // /api/ai-org/* は next.config.ts の rewrites で ai-org-core に転送される
      const apiUrl = '/api/ai-org/sessions';
      const fullUrl = new URL(apiUrl, window.location.origin).toString();
      console.log('Sending request to:', fullUrl);
      console.log('Request body:', { goal: message.trim(), autoStart: true });
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: message.trim(),
          autoStart: true,
        }),
      });
      console.log('Response status:', res.status);
      console.log('Response headers:', Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'セッション開始に失敗しました');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('AiAgentModal API call failed:', err);
      // エラー詳細を取得
      if (err instanceof TypeError) {
        // ネットワークエラー（Failed to fetch / Load failed）
        const msg = err.message;
        if (msg === 'Failed to fetch' || msg === 'Load failed') {
          // ブラウザのキャッシュやService Worker問題の可能性を示唆
          setError(`ネットワークエラー: ${msg}。ハードリロード（Cmd+Shift+R）を試すか、開発者ツールのNetworkタブでエラー詳細を確認してください。`);
        } else {
          setError(`TypeError: ${msg}`);
        }
      } else {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      }
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            AIエージェントに送信
          </h2>
          <button
            onClick={onClose}
            disabled={sending}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              メッセージ（ゴール）
            </label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={sending || !message}
              className={`
                p-1 rounded transition-colors
                ${copied
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
              `}
              title={copied ? 'コピーしました！' : 'クリップボードにコピー'}
            >
              {copied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            rows={8}
            disabled={sending}
            placeholder="AIエージェントに依頼する内容を入力..."
          />
        </div>

        {error && (
          <p className="text-red-500 dark:text-red-400 text-sm mb-4">{error}</p>
        )}
        {success && (
          <p className="text-green-500 dark:text-green-400 text-sm mb-4">
            セッションを開始しました
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || sending}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? '送信中...' : '送信 ⌘↵'}
          </button>
        </div>
      </div>
    </div>
  );
}
