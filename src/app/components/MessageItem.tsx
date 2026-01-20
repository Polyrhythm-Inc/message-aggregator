'use client';

import { useState, useMemo, useRef, useEffect, ReactNode } from 'react';
import { SlackMessage, SlackFile } from '@/types/slack';
import { ExternalProject, ContactMatchResult } from '@/lib/ai-org-projects-client';
import { extractSlackUrlInfo, SlackUrlInfo } from '@/lib/slack-url-parser';
import * as emoji from 'node-emoji';
import AiAgentModal from './AiAgentModal';
import ExternalProjectSelector from './ExternalProjectSelector';
import SlackFileViewerModal from './SlackFileViewerModal';
import ContactRegisterButton from './ContactRegisterButton';
import EmojiPicker from './EmojiPicker';

// 転送メッセージから取得した送信者情報
export type SenderInfoOverride = {
  userId: string;
  userName: string;
  displayName?: string;
  realName?: string;
};

type Props = {
  message: SlackMessage;
  externalProjects: ExternalProject[];
  onDelete: () => Promise<void>;
  onExternalProjectChange: (externalProjectId: string | null) => void;
  deleteMode?: boolean;
  deleteDisabled?: boolean;
  deleted?: boolean;
  // 転送メッセージから取得した送信者情報（上書き用）
  senderInfoOverride?: SenderInfoOverride;
  // 担当者マッチング結果（送信者から自動検出されたプロジェクト）
  contactMatch?: ContactMatchResult | null;
  // デバッグ用: 次のメッセージにスクロール（このメッセージを起点）
  onDebugScrollNext?: () => void;
};

function formatTimestamp(ts: string): string {
  const seconds = parseFloat(ts);
  const date = new Date(seconds * 1000);

  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Chatworkメッセージから送信者情報を抽出
 * 形式:
 * **Chatwork Message**
 * From: 棟元政惟
 * Room: 313028602
 */
type ChatworkSenderInfo = {
  name: string;
  roomId: string;
};

function extractChatworkSenderInfo(text: string): ChatworkSenderInfo | null {
  if (!text.startsWith('**Chatwork Message**')) {
    return null;
  }

  const fromMatch = text.match(/^From:\s*(.+)$/m);
  const roomMatch = text.match(/^Room:\s*(\d+)$/m);

  if (!fromMatch) {
    return null;
  }

  return {
    name: fromMatch[1].trim(),
    roomId: roomMatch ? roomMatch[1].trim() : '',
  };
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
  let processed = text.replace(/<@U031ZRTQY>/g, '@柚木仁 (Hitoshi Yunoki)');

  // Slack emoticonを絵文字に変換（:emoji_name: 形式）
  processed = emoji.emojify(processed);

  // URLを検出してリンク化
  const urlRegex = /https?:\/\/[^\s<>]+/g;
  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(processed)) !== null) {
    let url = match[0];
    let trailingChars = '';

    // 末尾の句読点や閉じ括弧を除去
    // ただし、対応する開き括弧がURL内にある場合は閉じ括弧を残す
    while (url.length > 0) {
      const lastChar = url[url.length - 1];
      if (lastChar === ')') {
        // URL内の開き括弧と閉じ括弧の数を比較
        const openCount = (url.match(/\(/g) || []).length;
        const closeCount = (url.match(/\)/g) || []).length;
        if (closeCount > openCount) {
          // 閉じ括弧が多い場合は末尾の閉じ括弧を除去
          trailingChars = lastChar + trailingChars;
          url = url.slice(0, -1);
        } else {
          break;
        }
      } else if (['.', ',', ';', '!', '?', "'", '"', ']', '}'].includes(lastChar)) {
        trailingChars = lastChar + trailingChars;
        url = url.slice(0, -1);
      } else {
        break;
      }
    }

    // URL前のテキスト
    if (match.index > lastIndex) {
      result.push(processed.slice(lastIndex, match.index));
    }
    // URLをリンクとして追加
    result.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {url}
      </a>
    );
    // 除去した末尾の文字をテキストとして追加
    if (trailingChars) {
      result.push(trailingChars);
    }
    lastIndex = urlRegex.lastIndex;
  }

  // 残りのテキスト
  if (lastIndex < processed.length) {
    result.push(processed.slice(lastIndex));
  }

  return result.length > 0 ? result : [processed];
}

export default function MessageItem({ message, externalProjects, onDelete, onExternalProjectChange, deleteMode = false, deleteDisabled = false, deleted = false, senderInfoOverride, contactMatch, onDebugScrollNext }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Chatworkメッセージから送信者情報を抽出
  const chatworkSenderInfo = useMemo(() => {
    return extractChatworkSenderInfo(message.text || '');
  }, [message.text]);

  // 返信関連の状態
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AIエージェントモーダルの状態
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // ファイルビューアモーダルの状態
  const [selectedFile, setSelectedFile] = useState<SlackFile | null>(null);

  // リアクション関連の状態
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionSending, setReactionSending] = useState(false);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [reactionSuccess, setReactionSuccess] = useState(false);

  // 翻訳関連の状態
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // 返信フォームが開いたときにフォーカス
  useEffect(() => {
    if (replying && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replying]);

  // メッセージからSlack URL情報を抽出
  const slackUrlInfo: SlackUrlInfo | null = useMemo(() => {
    return extractSlackUrlInfo(message.text || '');
  }, [message.text]);

  const canReply = slackUrlInfo !== null;

  const handleDeleteClick = () => {
    // 削除無効化中または削除済みは何もしない
    if (isDisabled) {
      return;
    }
    if (deleteMode || confirming) {
      // 削除モードの場合は即削除、確認中の場合も削除
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

  const handleReactionClick = () => {
    setEmojiPickerOpen(!emojiPickerOpen);
    setReactionError(null);
    setReactionSuccess(false);
  };

  const handleReaction = async (emojiName: string) => {
    if (!slackUrlInfo) return;

    setReactionSending(true);
    setReactionError(null);
    setReactionSuccess(false);

    try {
      const res = await fetch('/api/slack/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: slackUrlInfo.channelId,
          messageTs: slackUrlInfo.messageTs,
          name: emojiName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'リアクションの追加に失敗しました');
      }

      // 成功時
      setReactionSuccess(true);
      setTimeout(() => {
        setEmojiPickerOpen(false);
        setReactionSuccess(false);
      }, 1000);
    } catch (err) {
      setReactionError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setReactionSending(false);
    }
  };

  const handleTranslate = async () => {
    // トグル：既に翻訳結果がある場合は非表示にする
    if (translatedText) {
      setTranslatedText(null);
      return;
    }

    const textToTranslate = message.email
      ? `${message.email.subject}\n\n${message.email.body}`
      : message.text || '';

    if (!textToTranslate.trim()) {
      setTranslationError('翻訳するテキストがありません');
      return;
    }

    setTranslating(true);
    setTranslationError(null);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToTranslate }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '翻訳に失敗しました');
      }

      setTranslatedText(data.translatedText);
    } catch (err) {
      setTranslationError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setTranslating(false);
    }
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
            {message.email.to && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                To: {message.email.to}
              </span>
            )}
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

    // Slack Blocksが存在する場合は構造化された表示
    if (message.blocks && message.blocks.length > 0) {
      return (
        <div className="space-y-3">
          {message.blocks.map((block, index) => {
            if (block.type === 'header' && block.text) {
              return (
                <div key={index} className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {formatMessageText(block.text.text)}
                </div>
              );
            }
            if (block.type === 'section' && block.text) {
              return (
                <div key={index} className="text-gray-700 dark:text-gray-300">
                  {formatMessageText(block.text.text)}
                </div>
              );
            }
            if (block.type === 'context' && block.elements) {
              return (
                <div key={index} className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                  {block.elements.map((elem, elemIndex) => (
                    <div key={elemIndex}>
                      {elem.text ? formatMessageText(elem.text) : null}
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          })}
          {/* textフィールドも表示（blocksに含まれない情報がある場合のため） */}
          {message.text && !message.blocks.some(b => b.text?.text === message.text) && (
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              {formatMessageText(message.text)}
            </p>
          )}
        </div>
      );
    }

    return (
      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
        {message.text ? formatMessageText(message.text) : '(内容なし)'}
      </p>
    );
  };

  // 削除済みの場合はすべてのボタンを無効化
  const isDisabled = deleted || deleteDisabled;

  return (
    <div className={`rounded-lg shadow-sm border p-4 transition-all ${
      deleted
        ? 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 opacity-50'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <span
            className={`text-sm ${
              isWithin24Hours(message.ts)
                ? 'text-orange-500 font-bold'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {formatTimestamp(message.ts)}
          </span>
          {/* 外部プロジェクト連携（担当者マッチング結果も考慮） */}
          <ExternalProjectSelector
            messageTs={message.ts}
            currentExternalProjectId={message.external_project_id || null}
            suggestedExternalProjectId={contactMatch?.project.id || null}
            suggestedContactName={contactMatch?.contact.name || null}
            externalProjects={externalProjects}
            onExternalProjectChange={onExternalProjectChange}
          />
          {/* 担当者登録 */}
          <ContactRegisterButton
            senderName={chatworkSenderInfo?.name || senderInfoOverride?.displayName || senderInfoOverride?.realName || senderInfoOverride?.userName || message.email?.from || message.userName || ''}
            senderEmail={message.email?.from}
            senderSlackId={senderInfoOverride?.userId || message.user}
            chatworkRoomId={chatworkSenderInfo?.roomId}
            externalProjects={externalProjects}
            currentExternalProjectId={message.external_project_id}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setAiModalOpen(true)}
            className="px-3 py-1 text-sm rounded-md transition-colors text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            AI
          </button>
          <button
            onClick={handleTranslate}
            disabled={translating}
            className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 ${
              translatedText
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
            title={translating ? '翻訳中...' : (translatedText ? '翻訳を非表示' : '日本語に翻訳')}
          >
            {translating ? '翻訳中...' : '和訳'}
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={deleting || isDisabled}
            className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[72px] ${
              deleted
                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : confirming
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
          >
            {deleted ? '削除済み' : deleting ? '削除中...' : confirming ? '削除OK？' : '削除'}
          </button>
          {/* デバッグ用スクロールボタン */}
          {onDebugScrollNext && (
            <button
              onClick={onDebugScrollNext}
              className="px-3 py-1 text-sm rounded-md transition-colors bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800 border border-yellow-400 dark:border-yellow-600"
              title="デバッグ: このメッセージを起点に次へスクロール"
            >
              次へ→
            </button>
          )}
          {canReply && (
            <>
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
              <div className="relative">
                <button
                  onClick={handleReactionClick}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    emojiPickerOpen
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : reactionSuccess
                      ? 'bg-green-500 text-white'
                      : 'text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                  }`}
                  title="リアクションを追加"
                >
                  {reactionSuccess ? '✓' : '😀'}
                </button>
                <EmojiPicker
                  isOpen={emojiPickerOpen}
                  onClose={() => setEmojiPickerOpen(false)}
                  onSelect={handleReaction}
                  loading={reactionSending}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {/* リアクションエラー表示 */}
      {reactionError && (
        <div className="mt-2 text-sm text-red-500 dark:text-red-400">
          {reactionError}
        </div>
      )}
      {/* 翻訳エラー表示 */}
      {translationError && (
        <div className="mt-2 text-sm text-red-500 dark:text-red-400">
          {translationError}
        </div>
      )}
      {renderContent()}

      {/* 翻訳結果表示 */}
      {translatedText && (
        <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
              和訳
            </span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
            {formatMessageText(translatedText)}
          </p>
        </div>
      )}

      {/* 添付ファイル */}
      {message.files && message.files.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              添付ファイル ({message.files.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {message.files.map((file) => (
              <button
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                title={file.title || file.name}
              >
                {file.mimetype.startsWith('image/') ? (
                  <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : file.mimetype.startsWith('video/') ? (
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : file.mimetype === 'application/pdf' ? (
                  <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="max-w-[200px] truncate text-gray-700 dark:text-gray-300">
                  {file.title || file.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 返信フォーム */}
      {replying && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <textarea
            ref={textareaRef}
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

      {/* AIエージェントモーダル */}
      <AiAgentModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        defaultMessage={message.email ? `${message.email.subject}\n\n${message.email.body}` : message.text || ''}
      />

      {/* ファイルビューアモーダル */}
      <SlackFileViewerModal
        isOpen={selectedFile !== null}
        onClose={() => setSelectedFile(null)}
        file={selectedFile}
      />
    </div>
  );
}
