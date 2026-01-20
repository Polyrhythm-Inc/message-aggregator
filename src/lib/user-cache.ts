import fs from 'fs';
import path from 'path';
import { logger } from './logger';

interface UserCache {
  [userId: string]: string;
}

const CACHE_FILE_PATH = path.join(process.cwd(), 'data', 'user-cache.json');

/**
 * キャッシュファイルからユーザー情報を読み込む
 */
function loadCache(): UserCache {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const data = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn({ error }, 'ユーザーキャッシュの読み込みに失敗しました');
  }
  return {};
}

/**
 * キャッシュファイルにユーザー情報を保存する
 */
function saveCache(cache: UserCache): void {
  try {
    const dir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    logger.warn({ error }, 'ユーザーキャッシュの保存に失敗しました');
  }
}

// メモリ上のキャッシュ（ファイルI/O削減用）
let memoryCache: UserCache | null = null;

/**
 * キャッシュからユーザー名を取得
 */
export function getCachedUserName(userId: string): string | undefined {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }
  return memoryCache[userId];
}

/**
 * ユーザー名をキャッシュに保存
 */
export function setCachedUserName(userId: string, userName: string): void {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }

  // 既に同じ値がキャッシュされている場合は保存しない
  if (memoryCache[userId] === userName) {
    return;
  }

  memoryCache[userId] = userName;
  saveCache(memoryCache);
  logger.info({ userId, userName }, 'ユーザー情報をキャッシュしました');
}

/**
 * 複数のユーザー名をキャッシュに一括保存
 */
export function setCachedUserNames(users: Map<string, string>): void {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }

  let hasChanges = false;
  for (const [userId, userName] of users) {
    if (memoryCache[userId] !== userName) {
      memoryCache[userId] = userName;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    saveCache(memoryCache);
    logger.info({ count: users.size }, 'ユーザー情報を一括キャッシュしました');
  }
}

/**
 * キャッシュされている全ユーザーを取得
 */
export function getAllCachedUsers(): UserCache {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }
  return { ...memoryCache };
}

/**
 * メッセージ本文内の <@UXXXX> メンションをユーザー名に置換
 */
export function resolveMentions(text: string, userMap: Map<string, string>): string {
  return text.replace(/<@(U[A-Z0-9]+)>/g, (match, userId) => {
    const userName = userMap.get(userId);
    return userName ? `@${userName}` : match;
  });
}

/**
 * メッセージ本文からメンションされているユーザーIDを抽出
 */
export function extractMentionedUserIds(text: string): string[] {
  const matches = text.matchAll(/<@(U[A-Z0-9]+)>/g);
  return [...new Set([...matches].map((m) => m[1]))];
}
