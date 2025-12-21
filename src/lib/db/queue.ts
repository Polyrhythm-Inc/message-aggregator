import { Pool } from 'pg';
import { SlackQueueItem, QueueAddRequest, QueueUpdateRequest } from '../../types/queue';
import { logger } from '../logger';

// Heroku Postgres接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * Queueテーブルの初期化（テーブルが存在しない場合に作成）
 */
export async function initializeQueueTable(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS slack_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id VARCHAR(50) NOT NULL,
      thread_ts VARCHAR(50),
      user_id VARCHAR(50) NOT NULL,
      message_text TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_queue_status ON slack_queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_created ON slack_queue(created_at);
  `;

  try {
    await pool.query(createTableSQL);
    logger.info('slack_queue テーブルを初期化しました');
  } catch (error) {
    logger.error({ error }, 'slack_queue テーブルの初期化に失敗しました');
    throw error;
  }
}

/**
 * 新しいキューアイテムを追加
 */
export async function addToQueue(item: QueueAddRequest): Promise<SlackQueueItem> {
  const insertSQL = `
    INSERT INTO slack_queue (channel_id, thread_ts, user_id, message_text, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING *
  `;

  const values = [item.channel_id, item.thread_ts || null, item.user_id, item.message_text];

  try {
    const result = await pool.query(insertSQL, values);
    const row = result.rows[0];
    logger.info({ id: row.id }, 'キューにアイテムを追加しました');
    return mapRowToQueueItem(row);
  } catch (error) {
    logger.error({ error, item }, 'キューへの追加に失敗しました');
    throw error;
  }
}

/**
 * pending状態のキューアイテムを取得（FIFO順）
 */
export async function getPendingItems(limit: number = 10): Promise<SlackQueueItem[]> {
  const selectSQL = `
    SELECT * FROM slack_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT $1
  `;

  try {
    const result = await pool.query(selectSQL, [limit]);
    return result.rows.map(mapRowToQueueItem);
  } catch (error) {
    logger.error({ error }, 'pending アイテムの取得に失敗しました');
    throw error;
  }
}

/**
 * キューアイテムのステータスを更新
 */
export async function updateQueueItem(
  id: string,
  update: QueueUpdateRequest
): Promise<SlackQueueItem | null> {
  const updateSQL = `
    UPDATE slack_queue
    SET status = $2,
        processed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE processed_at END,
        error_message = $3
    WHERE id = $1
    RETURNING *
  `;

  const values = [id, update.status, update.error_message || null];

  try {
    const result = await pool.query(updateSQL, values);
    if (result.rows.length === 0) {
      logger.warn({ id }, 'キューアイテムが見つかりません');
      return null;
    }
    logger.info({ id, status: update.status }, 'キューアイテムを更新しました');
    return mapRowToQueueItem(result.rows[0]);
  } catch (error) {
    logger.error({ error, id, update }, 'キューアイテムの更新に失敗しました');
    throw error;
  }
}

/**
 * キューアイテムを削除
 */
export async function deleteQueueItem(id: string): Promise<boolean> {
  const deleteSQL = `DELETE FROM slack_queue WHERE id = $1`;

  try {
    const result = await pool.query(deleteSQL, [id]);
    const deleted = result.rowCount !== null && result.rowCount > 0;
    if (deleted) {
      logger.info({ id }, 'キューアイテムを削除しました');
    } else {
      logger.warn({ id }, '削除対象のキューアイテムが見つかりません');
    }
    return deleted;
  } catch (error) {
    logger.error({ error, id }, 'キューアイテムの削除に失敗しました');
    throw error;
  }
}

/**
 * IDでキューアイテムを取得
 */
export async function getQueueItemById(id: string): Promise<SlackQueueItem | null> {
  const selectSQL = `SELECT * FROM slack_queue WHERE id = $1`;

  try {
    const result = await pool.query(selectSQL, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToQueueItem(result.rows[0]);
  } catch (error) {
    logger.error({ error, id }, 'キューアイテムの取得に失敗しました');
    throw error;
  }
}

/**
 * DBの行をSlackQueueItem型にマッピング
 */
function mapRowToQueueItem(row: Record<string, unknown>): SlackQueueItem {
  return {
    id: row.id as string,
    channel_id: row.channel_id as string,
    thread_ts: row.thread_ts as string | null,
    user_id: row.user_id as string,
    message_text: row.message_text as string,
    status: row.status as SlackQueueItem['status'],
    created_at: (row.created_at as Date).toISOString(),
    processed_at: row.processed_at ? (row.processed_at as Date).toISOString() : null,
    error_message: row.error_message as string | null,
  };
}
