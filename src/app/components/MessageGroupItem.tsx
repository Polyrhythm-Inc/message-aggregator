'use client';

import { useState, useMemo } from 'react';
import { SlackMessage } from '@/types/slack';
import { ExternalProject, ContactMatchResult } from '@/lib/ai-org-projects-client';
import { extractSlackMessageIdFromText, hasSlackMessageId } from '@/lib/slack-url-parser';
import MessageItem, { SenderInfoOverride } from './MessageItem';
import MessageDiffView from './MessageDiffView';

type Props = {
  title: string;
  messages: SlackMessage[];
  externalProjects: ExternalProject[];
  onDelete: (ts: string) => Promise<void>;
  onBulkDelete: (tsArray: string[]) => Promise<void>;
  onExternalProjectChange: (ts: string, externalProjectId: string | null) => void;
  deleteMode?: boolean;
  deleteDisabledTs?: Set<string>;
  deletedTs?: Set<string>;
  // 転送メッセージから取得した送信者情報のマップ（ts -> SenderInfo）
  senderInfoMap?: Map<string, SenderInfoOverride>;
  // 担当者マッチング結果を取得する関数
  getContactMatch?: (ts: string) => ContactMatchResult | null;
  // デバッグ用: 各メッセージを起点に次へスクロールするコールバック生成関数
  createDebugScrollNext?: (ts: string) => () => void;
  // 差分表示を有効にするかどうか（【編集済み】を含むグループの場合true）
  showDiff?: boolean;
};

// メッセージからテキストコンテンツを抽出する関数
function extractMessageText(message: SlackMessage): string {
  if (message.email) {
    return `${message.email.subject}\n\n${message.email.body}`;
  }
  return message.text || '';
}

// メッセージのタイトルを抽出する関数（MessageList.tsxと同じロジック）
function extractMessageTitle(message: SlackMessage): string {
  // 1. メールの場合は件名
  if (message.email?.subject) {
    return message.email.subject;
  }

  // 2. Slackのヘッダーブロック
  if (message.blocks) {
    const headerBlock = message.blocks.find((block) => block.type === 'header');
    if (headerBlock?.text?.text) {
      return headerBlock.text.text;
    }
  }

  // 3. textの先頭行（最初の改行まで）
  if (message.text) {
    const lines = message.text.split('\n');
    return lines[0];
  }

  return '';
}

// メッセージが【編集済み】マーカーを持つかどうかを判定
function hasEditedMarker(message: SlackMessage): boolean {
  const title = extractMessageTitle(message);
  return title.startsWith('【編集済み】');
}

export default function MessageGroupItem({
  title,
  messages,
  externalProjects,
  onDelete,
  onBulkDelete,
  onExternalProjectChange,
  deleteMode = false,
  deleteDisabledTs = new Set(),
  deletedTs = new Set(),
  senderInfoMap = new Map(),
  getContactMatch,
  createDebugScrollNext,
  showDiff = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  // アクティブ（未削除）なメッセージのみカウント
  const activeMessages = messages.filter((m) => !deletedTs.has(m.ts));
  const activeCount = activeMessages.length;

  // すべてのメッセージが削除済みかどうか
  const allDeleted = activeCount === 0;

  const handleBulkDeleteClick = async () => {
    if (allDeleted || bulkDeleting) return;

    if (confirmingBulkDelete) {
      setBulkDeleting(true);
      try {
        const tsArray = activeMessages.map((m) => m.ts);
        await onBulkDelete(tsArray);
      } finally {
        setBulkDeleting(false);
        setConfirmingBulkDelete(false);
      }
    } else {
      setConfirmingBulkDelete(true);
      setTimeout(() => setConfirmingBulkDelete(false), 3000);
    }
  };

  // 差分表示用のマップを作成
  // キー: 【編集済み】メッセージのts、値: 比較対象のメッセージ（同じSlackメッセージIDを持つ、【編集済み】より古いメッセージの中で最新のもの）
  const compareToMessageMap = useMemo(() => {
    const map = new Map<string, SlackMessage>();
    if (!showDiff || messages.length < 2) {
      return map;
    }

    // 【編集済み】マーカーを持つメッセージを探す
    for (let i = 0; i < messages.length; i++) {
      const currentMessage = messages[i];

      // 【編集済み】マーカーがないメッセージはスキップ
      if (!hasEditedMarker(currentMessage)) {
        continue;
      }

      // 【編集済み】メッセージのSlackメッセージIDを抽出
      const messageText = extractMessageText(currentMessage);
      const slackMessageId = extractSlackMessageIdFromText(messageText);

      if (!slackMessageId) {
        continue;
      }

      // このメッセージより古いメッセージの中から、同じSlackメッセージIDを持つものを探す
      // messages配列は新しい順（messages[0]が最新）なので、indexが大きいほど古い
      for (let j = i + 1; j < messages.length; j++) {
        const olderMessage = messages[j];
        const olderMessageText = extractMessageText(olderMessage);

        // 同じSlackメッセージIDを持つか確認
        if (hasSlackMessageId(olderMessageText, slackMessageId)) {
          // 【編集済み】メッセージの比較対象として設定
          map.set(currentMessage.ts, olderMessage);
          break; // 最初に見つかったもの（最も新しい古いメッセージ）を使用
        }
      }
    }

    return map;
  }, [showDiff, messages]);

  // 最新のメッセージのタイムスタンプを表示用に取得
  const latestMessage = messages[0];
  const formatTimestamp = (ts: string): string => {
    const seconds = parseFloat(ts);
    const date = new Date(seconds * 1000);
    return date.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`rounded-lg shadow-sm border transition-all ${
        allDeleted
          ? 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 opacity-50'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* グループヘッダー */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 展開/折りたたみアイコン */}
          <button
            className="flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* タイトルとメタ情報 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                {activeCount}件
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {formatTimestamp(latestMessage.ts)}
              </span>
            </div>
            <p className="text-gray-900 dark:text-gray-100 font-medium truncate mt-1" title={title}>
              {title}
            </p>
          </div>
        </div>

        {/* 一括削除ボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleBulkDeleteClick();
          }}
          disabled={bulkDeleting || allDeleted}
          className={`flex-shrink-0 ml-4 px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            allDeleted
              ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : confirmingBulkDelete
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
        >
          {allDeleted
            ? '削除済み'
            : bulkDeleting
            ? '削除中...'
            : confirmingBulkDelete
            ? `${activeCount}件削除OK？`
            : `${activeCount}件削除`}
        </button>
      </div>

      {/* 展開時のメッセージ一覧 */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="p-2 space-y-2">
            {messages.map((message, index) => {
              const compareToMessage = compareToMessageMap.get(message.ts);
              const shouldShowDiff = showDiff && compareToMessage;

              return (
                <div
                  key={message.ts}
                  data-message-ts={message.ts}
                  className="scroll-mt-12 pl-4 border-l-2 border-gray-200 dark:border-gray-600"
                >
                  {/* 差分表示（【編集済み】メッセージに対して、同じSlackメッセージIDを持つ古いメッセージとの比較を表示） */}
                  {shouldShowDiff && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
                          差分表示
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          （編集前との比較）
                        </span>
                      </div>
                      <MessageDiffView
                        oldText={extractMessageText(compareToMessage)}
                        newText={extractMessageText(message)}
                      />
                    </div>
                  )}
                  {/* 最新メッセージのみ全文表示、それ以外は差分のみ */}
                  {index === 0 ? (
                    <MessageItem
                      message={message}
                      externalProjects={externalProjects}
                      onDelete={() => onDelete(message.ts)}
                      onExternalProjectChange={(externalProjectId) =>
                        onExternalProjectChange(message.ts, externalProjectId)
                      }
                      deleteMode={deleteMode}
                      deleteDisabled={deleteDisabledTs.has(message.ts)}
                      deleted={deletedTs.has(message.ts)}
                      senderInfoOverride={senderInfoMap.get(message.ts)}
                      contactMatch={getContactMatch?.(message.ts)}
                      onDebugScrollNext={createDebugScrollNext?.(message.ts)}
                    />
                  ) : (
                    <MessageItem
                      message={message}
                      externalProjects={externalProjects}
                      onDelete={() => onDelete(message.ts)}
                      onExternalProjectChange={(externalProjectId) =>
                        onExternalProjectChange(message.ts, externalProjectId)
                      }
                      deleteMode={deleteMode}
                      deleteDisabled={deleteDisabledTs.has(message.ts)}
                      deleted={deletedTs.has(message.ts)}
                      senderInfoOverride={senderInfoMap.get(message.ts)}
                      contactMatch={getContactMatch?.(message.ts)}
                      onDebugScrollNext={createDebugScrollNext?.(message.ts)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
