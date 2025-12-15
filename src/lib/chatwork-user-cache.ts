import fs from 'fs';
import path from 'path';
import { logger } from './logger';

interface ChatworkUserCache {
  [accountId: string]: string;
}

const CACHE_FILE_PATH = path.join(process.cwd(), 'data', 'chatwork-user-cache.json');

/**
 * キャッシュファイルからユーザー情報を読み込む
 */
function loadCache(): ChatworkUserCache {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const data = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn({ error }, 'Chatworkユーザーキャッシュの読み込みに失敗しました');
  }
  return {};
}

/**
 * キャッシュファイルにユーザー情報を保存する
 */
function saveCache(cache: ChatworkUserCache): void {
  try {
    const dir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    logger.warn({ error }, 'Chatworkユーザーキャッシュの保存に失敗しました');
  }
}

// メモリ上のキャッシュ（ファイルI/O削減用）
let memoryCache: ChatworkUserCache | null = null;

/**
 * キャッシュからユーザー名を取得
 */
export function getChatworkCachedUserName(accountId: number): string | undefined {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }
  return memoryCache[String(accountId)];
}

/**
 * ユーザー名をキャッシュに保存
 */
export function setChatworkCachedUserName(accountId: number, userName: string): void {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }

  const key = String(accountId);

  // 既に同じ値がキャッシュされている場合は保存しない
  if (memoryCache[key] === userName) {
    return;
  }

  memoryCache[key] = userName;
  saveCache(memoryCache);
  logger.info({ accountId, userName }, 'Chatworkユーザー情報をキャッシュしました');
}

/**
 * 複数のユーザー名をキャッシュに一括保存
 */
export function setChatworkCachedUserNames(users: Map<number, string>): void {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }

  let hasChanges = false;
  for (const [accountId, userName] of users) {
    const key = String(accountId);
    if (memoryCache[key] !== userName) {
      memoryCache[key] = userName;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    saveCache(memoryCache);
    logger.info({ count: users.size }, 'Chatworkユーザー情報を一括キャッシュしました');
  }
}

/**
 * キャッシュされている全ユーザーを取得
 */
export function getAllChatworkCachedUsers(): ChatworkUserCache {
  if (memoryCache === null) {
    memoryCache = loadCache();
  }
  return { ...memoryCache };
}
