import { Pool } from 'pg';
import { SlackQueueItem, QueueAddRequest, QueueUpdateRequest } from '../../types/queue';
import { logger } from '../logger';

// Heroku Postgres接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * Queueテーブルの初期化（テーブルが存在しない場合に作成、既存テーブルの場合はマイグレーション）
 */
export async function initializeQueueTable(): Promise<void> {
  try {
    // まず既存テーブルの存在確認
    const checkTableSQL = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'slack_queue'
      );
    `;
    const tableExists = (await pool.query(checkTableSQL)).rows[0].exists;

    if (tableExists) {
      // 既存テーブルをマイグレーション
      await migrateExistingTable();
    } else {
      // 新規テーブル作成
      const createTableSQL = `
        CREATE TABLE slack_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_id VARCHAR(50) NOT NULL,
          thread_ts VARCHAR(50),
          message_ts VARCHAR(50) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          text TEXT NOT NULL,
          event_type VARCHAR(20) NOT NULL DEFAULT 'new_goal',
          status VARCHAR(20) DEFAULT 'pending',
          session_id VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_queue_status ON slack_queue(status);
        CREATE INDEX IF NOT EXISTS idx_queue_created ON slack_queue(created_at);
        CREATE INDEX IF NOT EXISTS idx_queue_session ON slack_queue(session_id);
      `;
      await pool.query(createTableSQL);
      logger.info('slack_queue テーブルを新規作成しました');
    }
  } catch (error) {
    logger.error({ error }, 'slack_queue テーブルの初期化に失敗しました');
    throw error;
  }
}

/**
 * 既存テーブルのマイグレーション（旧スキーマ→新スキーマ）
 */
async function migrateExistingTable(): Promise<void> {
  // カラム存在チェック用のヘルパー関数
  const columnExists = async (columnName: string): Promise<boolean> => {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'slack_queue' AND column_name = $1
      );
    `, [columnName]);
    return result.rows[0].exists;
  };

  // 必要なカラムを追加（既存でなければ）
  const migrations: Array<{ column: string; sql: string }> = [
    {
      column: 'message_ts',
      sql: `ALTER TABLE slack_queue ADD COLUMN message_ts VARCHAR(50);
            UPDATE slack_queue SET message_ts = COALESCE(thread_ts, id::text) WHERE message_ts IS NULL;
            ALTER TABLE slack_queue ALTER COLUMN message_ts SET NOT NULL;`,
    },
    {
      column: 'text',
      sql: `ALTER TABLE slack_queue ADD COLUMN text TEXT;
            UPDATE slack_queue SET text = COALESCE(message_text, '') WHERE text IS NULL;
            ALTER TABLE slack_queue ALTER COLUMN text SET NOT NULL;`,
    },
    {
      column: 'event_type',
      sql: `ALTER TABLE slack_queue ADD COLUMN event_type VARCHAR(20) NOT NULL DEFAULT 'new_goal';`,
    },
    {
      column: 'session_id',
      sql: `ALTER TABLE slack_queue ADD COLUMN session_id VARCHAR(100);`,
    },
    {
      column: 'updated_at',
      sql: `ALTER TABLE slack_queue ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`,
    },
  ];

  for (const migration of migrations) {
    const exists = await columnExists(migration.column);
    if (!exists) {
      try {
        await pool.query(migration.sql);
        logger.info({ column: migration.column }, 'カラムを追加しました');
      } catch (error) {
        logger.warn({ error, column: migration.column }, 'カラム追加をスキップしました');
      }
    }
  }

  // インデックス作成（存在しなければ）
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_queue_session ON slack_queue(session_id);`);

  logger.info('slack_queue テーブルのマイグレーションが完了しました');
}

/**
 * 新しいキューアイテムを追加
 */
export async function addToQueue(item: QueueAddRequest): Promise<SlackQueueItem> {
  const insertSQL = `
    INSERT INTO slack_queue (channel_id, thread_ts, message_ts, user_id, text, event_type, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
  `;

  const values = [
    item.channel_id,
    item.thread_ts || null,
    item.message_ts,
    item.user_id,
    item.text,
    item.event_type,
  ];

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
        session_id = COALESCE($3, session_id),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const values = [id, update.status, update.session_id || null];

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
    message_ts: row.message_ts as string,
    user_id: row.user_id as string,
    text: row.text as string,
    event_type: row.event_type as SlackQueueItem['event_type'],
    status: row.status as SlackQueueItem['status'],
    session_id: row.session_id as string | null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}
