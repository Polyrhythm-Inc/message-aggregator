'use client';

import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { SlackMessage } from '@/types/slack';
import { ExternalProject, ContactMatchResult } from '@/lib/ai-org-projects-client';
import MessageItem from './MessageItem';
import MessageGroupItem from './MessageGroupItem';
import { useSenderInfo } from '@/hooks/useSenderInfo';

// タイトルを正規化する関数（グルーピング用）
// 「【編集済み】」プレフィックスを除去して比較キーを生成
function normalizeTitle(title: string): string {
  return title.replace(/^【編集済み】/, '');
}

// Chatworkメッセージから送信者名を抽出する関数
function extractChatworkSender(text: string): string | null {
  if (!text.startsWith('**Chatwork Message**')) {
    return null;
  }
  const lines = text.split('\n');
  const fromLine = lines.find(line => line.startsWith('From: '));
  if (fromLine) {
    return fromLine.replace('From: ', '').trim();
  }
  return null;
}

// メッセージからタイトルを抽出するヘルパー関数
function extractMessageTitle(message: SlackMessage): string {
  // 1. メールの場合は件名
  if (message.email?.subject) {
    return message.email.subject;
  }

  // 2. Slackのヘッダーブロック
  if (message.blocks) {
    const headerBlock = message.blocks.find((b) => b.type === 'header');
    if (headerBlock?.text?.text) {
      return headerBlock.text.text;
    }
  }

  // 3. textの先頭行（最初の改行まで、または最初の80文字）
  if (message.text) {
    const lines = message.text.split('\n');
    let firstLine = lines[0];

    // Chatworkメッセージの場合、「**Chatwork Message**」ではなく「From: 〇〇」でグルーピング
    if (firstLine === '**Chatwork Message**' && lines.length > 1) {
      const fromLine = lines.find(line => line.startsWith('From: '));
      if (fromLine) {
        firstLine = fromLine;
      }
    }

    if (firstLine.length > 80) {
      return firstLine.substring(0, 80) + '...';
    }
    return firstLine;
  }

  return '(タイトルなし)';
}

// グループ化されたメッセージの型
type MessageGroup = {
  title: string;
  messages: SlackMessage[];
  isGroup: boolean; // 2件以上ある場合true
  hasEditedMessage: boolean; // 【編集済み】を含むメッセージがあるかどうか
};

// メッセージをタイトルでグループ化する関数
function groupMessagesByTitle(messages: SlackMessage[]): MessageGroup[] {
  // 正規化されたタイトルをキーとしてメッセージを集約
  const normalizedTitleMap = new Map<string, SlackMessage[]>();
  // 正規化されたタイトルから表示用タイトル（最初に出現したもの）へのマッピング
  const displayTitleMap = new Map<string, string>();
  // 【編集済み】を含むタイトルがあるかどうかのフラグ
  const hasEditedMap = new Map<string, boolean>();

  // タイトルごとにメッセージを集約（正規化したタイトルで比較）
  for (const message of messages) {
    const title = extractMessageTitle(message);
    const normalizedKey = normalizeTitle(title);
    const existing = normalizedTitleMap.get(normalizedKey) || [];
    existing.push(message);
    normalizedTitleMap.set(normalizedKey, existing);

    // 表示用タイトルは最初に出現したものを使用
    if (!displayTitleMap.has(normalizedKey)) {
      displayTitleMap.set(normalizedKey, title);
    }

    // 【編集済み】を含むタイトルがあるかチェック
    if (title.startsWith('【編集済み】')) {
      hasEditedMap.set(normalizedKey, true);
    }
  }

  // グループを作成（元の順序を維持：各グループの最初のメッセージの位置で並べる）
  const groups: MessageGroup[] = [];
  const processedNormalizedTitles = new Set<string>();

  for (const message of messages) {
    const title = extractMessageTitle(message);
    const normalizedKey = normalizeTitle(title);
    if (processedNormalizedTitles.has(normalizedKey)) continue;
    processedNormalizedTitles.add(normalizedKey);

    const groupMessages = normalizedTitleMap.get(normalizedKey)!;
    const displayTitle = displayTitleMap.get(normalizedKey)!;
    groups.push({
      title: displayTitle,
      messages: groupMessages,
      isGroup: groupMessages.length >= 2,
      hasEditedMessage: hasEditedMap.get(normalizedKey) || false,
    });
  }

  return groups;
}

export type MessageListRef = {
  reload: () => void;
};

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5分
const COUNTDOWN_SECONDS = 10; // カウントダウン秒数
const NEW_MESSAGE_DELETE_DISABLE_MS = 2000; // 新規メッセージの削除ボタンを無効化する時間

// API Base URL（環境変数で指定された場合は外部URLを使用、未指定時は相対パス）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

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

// 2025/11/30以降のメッセージかどうかを判定
// 2025-11-30 00:00:00 JST = 2025-11-29 15:00:00 UTC
const CUTOFF_DATE_TIMESTAMP = new Date('2025-11-30T00:00:00+09:00').getTime() / 1000;

function isAfterCutoffDate(ts: string): boolean {
  const seconds = parseFloat(ts);
  return seconds >= CUTOFF_DATE_TIMESTAMP;
}

type Props = {
  deleteMode: boolean;
  debugMode?: boolean;
};

const MessageList = forwardRef<MessageListRef, Props>(function MessageList({ deleteMode, debugMode = false }, ref) {
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [externalProjects, setExternalProjects] = useState<ExternalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // 新規メッセージの出現時刻を追跡（ts -> 出現時刻のミリ秒）
  const [newMessageAppearedAt, setNewMessageAppearedAt] = useState<Map<string, number>>(new Map());
  // 削除済みメッセージのtsを追跡
  const [deletedMessageTs, setDeletedMessageTs] = useState<Set<string>>(new Set());
  // 担当者マッチング結果のキャッシュ（SlackID/email -> ContactMatchResult）
  const [contactMatchCache, setContactMatchCache] = useState<Map<string, ContactMatchResult | null>>(new Map());

  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number | null>(null);
  // 現在表示中のメッセージtsを追跡（再読み込み時の新規メッセージ判定用）
  const currentMessageTsSetRef = useRef<Set<string>>(new Set());
  // 新規メッセージの無効化解除タイマーを追跡（クリーンアップ用）
  const newMessageDisableTimersRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // 転送メッセージから送信者情報を取得するフック
  const { senderInfoMap } = useSenderInfo(messages);

  // 送信者情報から担当者マッチングを実行するエフェクト
  useEffect(() => {
    const runContactMatching = async () => {
      const newMatches = new Map<string, ContactMatchResult | null>(contactMatchCache);
      let hasNewMatches = false;

      // 1. senderInfoMapからのマッチング（Slack転送メッセージ）
      for (const [ts, senderInfo] of senderInfoMap) {
        const cacheKey = senderInfo.userId || ts;
        if (newMatches.has(cacheKey)) continue;

        try {
          const response = await fetch(`${API_BASE_URL}/api/contacts/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slackId: senderInfo.userId,
              name: senderInfo.displayName || senderInfo.realName || senderInfo.userName,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            newMatches.set(cacheKey, data.data as ContactMatchResult | null);
          } else {
            newMatches.set(cacheKey, null);
          }
          hasNewMatches = true;
        } catch {
          newMatches.set(cacheKey, null);
        }
      }

      // 2. Chatworkメッセージからの送信者名マッチング
      for (const message of messages) {
        const chatworkSender = extractChatworkSender(message.text || '');
        if (!chatworkSender) continue;

        const cacheKey = `chatwork:${chatworkSender}`;
        if (newMatches.has(cacheKey)) continue;

        try {
          const response = await fetch(`${API_BASE_URL}/api/contacts/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: chatworkSender }),
          });
          if (response.ok) {
            const data = await response.json();
            newMatches.set(cacheKey, data.data as ContactMatchResult | null);
          } else {
            newMatches.set(cacheKey, null);
          }
          hasNewMatches = true;
        } catch {
          newMatches.set(cacheKey, null);
        }
      }

      if (hasNewMatches) {
        setContactMatchCache(newMatches);
      }
    };

    if (senderInfoMap.size > 0 || messages.length > 0) {
      runContactMatching();
    }
  }, [senderInfoMap, contactMatchCache, messages]);

  // メッセージtsから担当者マッチング結果を取得するヘルパー
  const getContactMatch = useCallback((ts: string): ContactMatchResult | null => {
    // 1. senderInfoMapからの取得（Slack転送メッセージ）
    const senderInfo = senderInfoMap.get(ts);
    if (senderInfo) {
      const cacheKey = senderInfo.userId || ts;
      return contactMatchCache.get(cacheKey) || null;
    }

    // 2. Chatworkメッセージからの取得
    const message = messages.find(m => m.ts === ts);
    if (message) {
      const chatworkSender = extractChatworkSender(message.text || '');
      if (chatworkSender) {
        const cacheKey = `chatwork:${chatworkSender}`;
        return contactMatchCache.get(cacheKey) || null;
      }
    }

    return null;
  }, [senderInfoMap, contactMatchCache, messages]);

  // 新規メッセージを検出し、削除ボタンを一時的に無効化する共通関数
  const processNewMessagesAndDisableDelete = useCallback((
    newMessages: SlackMessage[],
    existingTsSet: Set<string>
  ) => {
    const now = Date.now();

    // 新規メッセージ（以前は存在しなかったもの）を検出
    const newMessageTsArray: string[] = [];
    for (const msg of newMessages) {
      if (!existingTsSet.has(msg.ts)) {
        newMessageTsArray.push(msg.ts);
      }
    }

    // 新規メッセージがある場合、出現時刻を記録
    if (newMessageTsArray.length > 0) {
      setNewMessageAppearedAt((prev) => {
        const updated = new Map(prev);
        for (const msgTs of newMessageTsArray) {
          updated.set(msgTs, now);
        }
        return updated;
      });

      // 2秒後に新規メッセージの出現時刻を削除
      const timerId = setTimeout(() => {
        setNewMessageAppearedAt((prev) => {
          const updated = new Map(prev);
          for (const msgTs of newMessageTsArray) {
            updated.delete(msgTs);
          }
          return updated;
        });
        newMessageDisableTimersRef.current.delete(timerId);
      }, NEW_MESSAGE_DELETE_DISABLE_MS);

      // タイマーを追跡（クリーンアップ用）
      newMessageDisableTimersRef.current.add(timerId);
    }

    // メッセージ一覧を更新
    setMessages(newMessages);
    // 現在のメッセージtsセットを更新
    currentMessageTsSetRef.current = new Set(newMessages.map((m) => m.ts));
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [messagesRes, externalProjectsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/slack/messages`),
        fetch(`${API_BASE_URL}/api/external-projects`),
      ]);
      if (!messagesRes.ok) {
        const data = await messagesRes.json();
        throw new Error(data.error || '取得に失敗しました');
      }
      const messagesData = await messagesRes.json();
      setMessages(messagesData.messages);
      // 初期ロード時に現在のメッセージtsを記録
      currentMessageTsSetRef.current = new Set(messagesData.messages.map((m: SlackMessage) => m.ts));

      if (externalProjectsRes.ok) {
        const externalProjectsData = await externalProjectsRes.json();
        setExternalProjects(externalProjectsData.projects || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // reload関数（削除済みメッセージをクリアして再読み込み）
  const reload = useCallback(() => {
    setDeletedMessageTs(new Set());
    fetchMessages();
  }, [fetchMessages]);

  // 親コンポーネントからreloadを呼び出せるようにする
  useImperativeHandle(ref, () => ({
    reload,
  }), [reload]);

  // 2025/11/30以降のメッセージのみをフィルタ
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => isAfterCutoffDate(m.ts));
  }, [messages]);

  // メッセージをタイトルでグループ化
  const messageGroups = useMemo(() => {
    return groupMessagesByTitle(filteredMessages);
  }, [filteredMessages]);

  // 画面表示順序でメッセージをフラット化（グループ内の順序を保持）
  const displayOrderMessages = useMemo(() => {
    const result: SlackMessage[] = [];
    for (const group of messageGroups) {
      for (const message of group.messages) {
        result.push(message);
      }
    }
    return result;
  }, [messageGroups]);

  // 24時間の境界インデックスを計算（フィルタ後のメッセージに対して）
  const dividerIndex = useMemo(() => {
    for (let i = 0; i < filteredMessages.length; i++) {
      if (!isWithin24Hours(filteredMessages[i].ts)) {
        return i;
      }
    }
    return -1; // 全て24時間以内、または全て24時間以降
  }, [filteredMessages]);

  // スムーズスクロール共通関数
  const scrollToMessage = useCallback((targetTs: string) => {
    requestAnimationFrame(() => {
      const targetElement = document.querySelector(`[data-message-ts="${targetTs}"]`);
      if (targetElement) {
        // カスタムスムーズスクロール（デフォルトの3倍速）
        const targetRect = targetElement.getBoundingClientRect();
        const scrollMargin = 48; // scroll-mt-12 = 3rem = 48px
        const targetY = window.scrollY + targetRect.top - scrollMargin;
        const startY = window.scrollY;
        const distance = targetY - startY;
        const duration = 100; // デフォルト約300msの1/3 = 100ms
        const startTime = performance.now();

        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutCubic for smooth deceleration
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          window.scrollTo(0, startY + distance * easeProgress);

          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          }
        };

        requestAnimationFrame(animateScroll);
      }
    });
  }, []);

  // 画面表示順序に基づいて次のスクロールターゲットを見つける共通関数
  // tsArrayに含まれるメッセージを除外して、次のメッセージを探す
  const findNextScrollTarget = useCallback((tsArray: string[], displayMessages: SlackMessage[], deletedTs: Set<string>): string | null => {
    const tsSet = new Set(tsArray);
    const combinedDeletedTs = new Set([...deletedTs, ...tsArray]);

    // 削除対象の最初のメッセージのインデックスを見つける（画面表示順序で）
    let deletingIndex = -1;
    for (let i = 0; i < displayMessages.length; i++) {
      if (tsSet.has(displayMessages[i].ts)) {
        deletingIndex = i;
        break;
      }
    }

    // 削除対象が見つからない場合
    if (deletingIndex === -1) {
      return null;
    }

    // 削除対象より後のアクティブなメッセージを探す（画面表示順序で）
    for (let i = deletingIndex + 1; i < displayMessages.length; i++) {
      if (!combinedDeletedTs.has(displayMessages[i].ts)) {
        return displayMessages[i].ts;
      }
    }

    // 後に見つからない場合、削除対象より前のアクティブなメッセージを探す
    for (let i = deletingIndex - 1; i >= 0; i--) {
      if (!combinedDeletedTs.has(displayMessages[i].ts)) {
        return displayMessages[i].ts;
      }
    }

    return null;
  }, []);

  const handleDelete = useCallback(async (ts: string) => {
    // 削除前に次のスクロールターゲットを計算（画面表示順序で）
    const scrollTargetTs = findNextScrollTarget([ts], displayOrderMessages, deletedMessageTs);

    // 削除ボタン押下時に即座に削除済みとしてマーク（グレーアウト表示）
    setDeletedMessageTs((prev) => new Set(prev).add(ts));

    // 削除後にスクロール
    if (scrollTargetTs) {
      scrollToMessage(scrollTargetTs);
    }

    // API呼び出しはスクロール後に実行（ユーザー体験のため先にスクロール）
    const res = await fetch(`${API_BASE_URL}/api/slack/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ts }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '削除に失敗しました');
    }
  }, [findNextScrollTarget, displayOrderMessages, deletedMessageTs, scrollToMessage]);

  // 一括削除ハンドラ（1つのAPIコールで実行）
  const handleBulkDelete = useCallback(async (tsArray: string[]) => {
    // 削除前に次のスクロールターゲットを計算（画面表示順序で）
    const scrollTargetTs = findNextScrollTarget(tsArray, displayOrderMessages, deletedMessageTs);

    // すべてのメッセージを即座に削除済みとしてマーク
    setDeletedMessageTs((prev) => {
      const updated = new Set(prev);
      for (const ts of tsArray) {
        updated.add(ts);
      }
      return updated;
    });

    // 削除後にスクロール
    if (scrollTargetTs) {
      scrollToMessage(scrollTargetTs);
    }

    // 1つのAPIコールで一括削除
    try {
      const res = await fetch(`${API_BASE_URL}/api/slack/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tsArray }),
      });
      if (!res.ok) {
        console.error('Failed to bulk delete messages');
      }
    } catch (err) {
      console.error('Error bulk deleting messages:', err);
    }
  }, [findNextScrollTarget, displayOrderMessages, deletedMessageTs, scrollToMessage]);

  // デバッグ用: 特定メッセージを起点に次のメッセージにスクロール
  const createDebugScrollNext = useCallback((fromTs: string) => {
    return () => {
      const nextTs = findNextScrollTarget([fromTs], displayOrderMessages, deletedMessageTs);
      if (nextTs) {
        scrollToMessage(nextTs);
        console.log('[DEBUG] 次のメッセージにスクロール:', fromTs, '->', nextTs);
      } else {
        console.log('[DEBUG] 次のメッセージがありません (from:', fromTs, ')');
      }
    };
  }, [findNextScrollTarget, displayOrderMessages, deletedMessageTs, scrollToMessage]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 画面表示直後の自動トリガーは無効化（E2Eテストとの互換性のため）
  // ユーザーが明示的にAutoAssignButtonをクリックした場合のみ実行

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
            // 再読み込み実行（新規メッセージを追跡）
            const existingTsSet = new Set(currentMessageTsSetRef.current);
            fetch(`${API_BASE_URL}/api/slack/messages`)
              .then((res) => res.json())
              .then((data) => {
                if (data.messages) {
                  processNewMessagesAndDisableDelete(data.messages as SlackMessage[], existingTsSet);
                }
              })
              .catch(() => {});
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

    // クリーンアップ用にrefの現在値をローカル変数にコピー
    const timersToCleanup = newMessageDisableTimersRef.current;

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
      // 新規メッセージの無効化解除タイマーをすべてクリア
      timersToCleanup.forEach((timerId) => {
        clearTimeout(timerId);
      });
      timersToCleanup.clear();
    };
  }, [processNewMessagesAndDisableDelete]);

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

  if (filteredMessages.length === 0) {
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
        {messageGroups.map((group, groupIndex) => {
          // グループの最初のメッセージの日付を使用
          const firstMessage = group.messages[0];
          const currentDate = getDateString(firstMessage.ts);

          // 前のグループの最初のメッセージの日付
          const prevGroup = groupIndex > 0 ? messageGroups[groupIndex - 1] : null;
          const prevDate = prevGroup ? getDateString(prevGroup.messages[0].ts) : null;
          const showDateDivider = prevDate !== null && prevDate !== currentDate;

          // 24時間境界の判定（グループ内の最初のメッセージで判定）
          const firstMessageIndex = filteredMessages.findIndex((m) => m.ts === firstMessage.ts);
          const showTimeDivider = firstMessageIndex === dividerIndex && dividerIndex >= 0;

          if (group.isGroup) {
            // 2件以上の同一タイトル：グループ表示
            return (
              <div key={group.title + '-' + firstMessage.ts} data-message-ts={firstMessage.ts} className="scroll-mt-12">
                {/* 24時間以上前の区切り */}
                {showTimeDivider && (
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
                <MessageGroupItem
                  title={group.title}
                  messages={group.messages}
                  externalProjects={externalProjects}
                  onDelete={handleDelete}
                  onBulkDelete={handleBulkDelete}
                  onExternalProjectChange={(ts, externalProjectId) => {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.ts === ts ? { ...m, external_project_id: externalProjectId } : m
                      )
                    );
                  }}
                  deleteMode={deleteMode}
                  deleteDisabledTs={new Set(newMessageAppearedAt.keys())}
                  deletedTs={deletedMessageTs}
                  senderInfoMap={senderInfoMap}
                  getContactMatch={getContactMatch}
                  createDebugScrollNext={debugMode ? createDebugScrollNext : undefined}
                  showDiff={group.hasEditedMessage}
                />
              </div>
            );
          } else {
            // 1件のみ：通常表示
            const message = firstMessage;
            return (
              <div key={message.ts} data-message-ts={message.ts} className="scroll-mt-12">
                {/* 24時間以上前の区切り */}
                {showTimeDivider && (
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
                  externalProjects={externalProjects}
                  onDelete={() => handleDelete(message.ts)}
                  onExternalProjectChange={(externalProjectId) => {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.ts === message.ts ? { ...m, external_project_id: externalProjectId } : m
                      )
                    );
                  }}
                  deleteMode={deleteMode}
                  deleteDisabled={newMessageAppearedAt.has(message.ts)}
                  deleted={deletedMessageTs.has(message.ts)}
                  senderInfoOverride={senderInfoMap.get(message.ts)}
                  contactMatch={getContactMatch(message.ts)}
                  onDebugScrollNext={debugMode ? createDebugScrollNext(message.ts) : undefined}
                />
              </div>
            );
          }
        })}
      </div>
    </>
  );
});

export default MessageList;
