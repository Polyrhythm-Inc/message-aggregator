'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SlackMessage } from '@/types/slack';
import { extractSlackUrl } from '@/lib/slack-url-parser';

export type SenderInfo = {
  userId: string;
  userName: string;
  displayName?: string;
  realName?: string;
};

// メッセージtsをキーとした送信者情報のマップ
export type SenderInfoMap = Map<string, SenderInfo>;

// API Base URL（環境変数で指定された場合は外部URLを使用、未指定時は相対パス）
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// リクエスト間の待機時間（レート制限対策）
const REQUEST_DELAY_MS = 500;

// 2025/11/30以降のメッセージのみ対象（それ以前は古いメッセージなのでスキップ）
// 2025-11-30 00:00:00 JST = 2025-11-29 15:00:00 UTC
const CUTOFF_DATE_TIMESTAMP = new Date('2025-11-30T00:00:00+09:00').getTime() / 1000;

/**
 * メッセージが2025/11/30以降かどうかを判定
 */
function isAfterCutoffDate(ts: string): boolean {
  const seconds = parseFloat(ts);
  return seconds >= CUTOFF_DATE_TIMESTAMP;
}

/**
 * URLのHTMLエンティティをデコード（&amp; → &）
 */
function decodeHtmlEntities(url: string): string {
  return url.replace(/&amp;/g, '&');
}

/**
 * 転送メッセージから元の送信者情報を取得するフック
 *
 * - 送信者情報がないメッセージ（ボット転送）を検出
 * - メッセージ本文からSlack URLを抽出
 * - シリアルにAPIをコールして送信者情報を取得
 */
export function useSenderInfo(messages: SlackMessage[]) {
  const [senderInfoMap, setSenderInfoMap] = useState<SenderInfoMap>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // 処理済みのURLを追跡（重複リクエスト防止）
  const fetchedUrlsRef = useRef<Set<string>>(new Set());
  // 処理中フラグ
  const isFetchingRef = useRef(false);
  // マウント状態を追跡
  const isMountedRef = useRef(true);

  // 送信者情報が必要なメッセージを抽出
  const getMessagesNeedingSenderInfo = useCallback((messages: SlackMessage[]) => {
    return messages.filter((message) => {
      // 2025/11/30以前のメッセージはスキップ
      if (!isAfterCutoffDate(message.ts)) {
        return false;
      }
      // 既に送信者情報がある場合はスキップ
      if (message.user || message.userName || message.email) {
        return false;
      }
      // メッセージ本文からSlack URLを抽出（HTMLエンティティをデコード）
      const rawUrl = extractSlackUrl(message.text || '');
      if (!rawUrl) {
        return false;
      }
      const url = decodeHtmlEntities(rawUrl);
      // 既に取得済みのURLはスキップ
      if (fetchedUrlsRef.current.has(url)) {
        return false;
      }
      return true;
    });
  }, []);

  // 送信者情報を取得
  const fetchSenderInfo = useCallback(async (url: string): Promise<SenderInfo | null> => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/slack/sender-info?url=${encodeURIComponent(url)}`
      );

      if (!res.ok) {
        if (res.status === 429) {
          // レート制限: しばらく待ってリトライ可能
          console.warn('Rate limited, will retry later');
          return null;
        }
        return null;
      }

      const data = await res.json();
      if (data.success && data.sender) {
        return data.sender;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch sender info:', error);
      return null;
    }
  }, []);

  // メイン処理: メッセージ一覧が変更されたら送信者情報を取得
  useEffect(() => {
    isMountedRef.current = true;

    const fetchAllSenderInfo = async () => {
      // 既に処理中の場合はスキップ
      if (isFetchingRef.current) {
        return;
      }

      const needsInfo = getMessagesNeedingSenderInfo(messages);
      if (needsInfo.length === 0) {
        return;
      }

      isFetchingRef.current = true;
      setLoading(true);
      setProgress({ current: 0, total: needsInfo.length });

      const newSenderInfoMap = new Map(senderInfoMap);

      for (let i = 0; i < needsInfo.length; i++) {
        if (!isMountedRef.current) {
          break;
        }

        const message = needsInfo[i];
        const rawUrl = extractSlackUrl(message.text || '');
        if (!rawUrl) continue;
        // HTMLエンティティをデコード（&amp; → &）
        const url = decodeHtmlEntities(rawUrl);

        // 取得済みとしてマーク
        fetchedUrlsRef.current.add(url);

        const senderInfo = await fetchSenderInfo(url);
        if (senderInfo && isMountedRef.current) {
          newSenderInfoMap.set(message.ts, senderInfo);
          setSenderInfoMap(new Map(newSenderInfoMap));
        }

        // 進捗を更新
        if (isMountedRef.current) {
          setProgress({ current: i + 1, total: needsInfo.length });
        }

        // レート制限対策: リクエスト間に待機
        if (i < needsInfo.length - 1 && isMountedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
        }
      }

      if (isMountedRef.current) {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchAllSenderInfo();

    return () => {
      isMountedRef.current = false;
    };
  }, [messages, getMessagesNeedingSenderInfo, fetchSenderInfo, senderInfoMap]);

  // 特定のメッセージの送信者情報を取得
  const getSenderInfo = useCallback(
    (messageTs: string): SenderInfo | undefined => {
      return senderInfoMap.get(messageTs);
    },
    [senderInfoMap]
  );

  return {
    senderInfoMap,
    getSenderInfo,
    loading,
    progress,
  };
}
