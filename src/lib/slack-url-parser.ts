/**
 * Slack URLからメッセージ情報を抽出するユーティリティ
 */

export type SlackUrlInfo = {
  workspace: string; // 例: "polyrhythm"
  channelId: string; // 例: "C09EPP61GBZ"
  messageTs: string; // 例: "1765757182.969699"
  threadTs?: string; // 例: "1765757136.470629"（オプション）
};

/**
 * メッセージ本文からSlack URLを抽出
 * Slack形式 <URL|表示テキスト> と通常URLの両方に対応
 */
export function extractSlackUrl(text: string): string | null {
  // Slack形式 <https://...> からURLを抽出
  const slackLinkMatch = text.match(
    /<(https:\/\/[^.]+\.slack\.com\/archives\/[^|>]+)(?:\|[^>]+)?>/
  );
  if (slackLinkMatch) {
    return slackLinkMatch[1];
  }

  // 通常のURL形式
  const urlMatch = text.match(
    /(https:\/\/[^.\s]+\.slack\.com\/archives\/[^\s]+)/
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

/**
 * Slack URLをパースしてSlackUrlInfoを返す
 *
 * URL形式:
 * https://{workspace}.slack.com/archives/{channelId}/p{timestamp}?thread_ts={thread_ts}&cid={channelId}
 *
 * タイムスタンプの変換:
 * - URLのp1765757182969699 → 1765757182.969699
 * - 下6桁を小数点以下として扱う
 */
export function parseSlackUrl(url: string): SlackUrlInfo | null {
  const pattern =
    /^https:\/\/([^.]+)\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d+)(?:\?(?:[^&]*&)*thread_ts=([0-9.]+))?/;
  const match = url.match(pattern);

  if (!match) {
    return null;
  }

  const [, workspace, channelId, rawTimestamp, threadTs] = match;

  // タイムスタンプを変換: p1765757182969699 → 1765757182.969699
  // 下6桁を小数点以下として扱う
  const messageTs = convertTimestamp(rawTimestamp);

  return {
    workspace,
    channelId,
    messageTs,
    threadTs: threadTs || undefined,
  };
}

/**
 * URLのタイムスタンプをSlack API形式に変換
 * 1765757182969699 → 1765757182.969699
 */
function convertTimestamp(rawTimestamp: string): string {
  // タイムスタンプが13桁以上の場合、下6桁を小数点以下に
  if (rawTimestamp.length > 6) {
    const seconds = rawTimestamp.slice(0, -6);
    const microseconds = rawTimestamp.slice(-6);
    return `${seconds}.${microseconds}`;
  }
  return rawTimestamp;
}

/**
 * メッセージ本文から直接SlackUrlInfoを抽出
 */
export function extractSlackUrlInfo(text: string): SlackUrlInfo | null {
  const url = extractSlackUrl(text);
  if (!url) {
    return null;
  }
  return parseSlackUrl(url);
}

/**
 * Slack URLからメッセージID（p + タイムスタンプ形式）を抽出
 * 例: https://polyrhythm.slack.com/archives/C09H0CHTCT0/p1768488343076159 → p1768488343076159
 * 例: https://polyrhythm.slack.com/archives/C09H0CHTCT0/p1768488343076159?thread_ts=... → p1768488343076159
 */
export function extractSlackMessageId(url: string): string | null {
  const pattern = /\/p(\d+)(?:\?|$)/;
  const match = url.match(pattern);
  if (!match) {
    return null;
  }
  return `p${match[1]}`;
}

/**
 * メッセージ本文からSlackメッセージIDを抽出
 * URLが複数ある場合は最初に見つかったものを返す
 */
export function extractSlackMessageIdFromText(text: string): string | null {
  const url = extractSlackUrl(text);
  if (!url) {
    return null;
  }
  return extractSlackMessageId(url);
}

/**
 * メッセージ本文に特定のSlackメッセージIDを含むURLがあるかどうかを判定
 * URLのクエリパラメータ等を無視してメッセージIDのみで比較
 */
export function hasSlackMessageId(text: string, messageId: string): boolean {
  // すべてのSlack URLを抽出してチェック
  // Slack形式 <https://...> からURLを抽出
  const slackLinkPattern = /<(https:\/\/[^.]+\.slack\.com\/archives\/[^|>]+)(?:\|[^>]+)?>/g;
  let match;
  while ((match = slackLinkPattern.exec(text)) !== null) {
    const url = match[1];
    const extractedId = extractSlackMessageId(url);
    if (extractedId === messageId) {
      return true;
    }
  }

  // 通常のURL形式もチェック
  const urlPattern = /(https:\/\/[^.\s]+\.slack\.com\/archives\/[^\s]+)/g;
  while ((match = urlPattern.exec(text)) !== null) {
    const url = match[0];
    const extractedId = extractSlackMessageId(url);
    if (extractedId === messageId) {
      return true;
    }
  }

  return false;
}
