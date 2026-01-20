import { Pool } from 'pg';
import { logger } from '../logger';

// PostgreSQL接続プール
const dbUrl = process.env.DATABASE_URL || '';
const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isLocalDb ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

/**
 * message_external_projectsテーブルの初期化（メッセージと外部プロジェクトの関連付け専用）
 */
export async function initializeMessageExternalProjectsTable(): Promise<void> {
  try {
    const checkTableSQL = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'message_external_projects'
      );
    `;
    const tableExists = (await pool.query(checkTableSQL)).rows[0].exists;

    if (!tableExists) {
      const createTableSQL = `
        CREATE TABLE message_external_projects (
          message_ts VARCHAR(50) PRIMARY KEY,
          external_project_id VARCHAR(36) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_message_external_projects_external ON message_external_projects(external_project_id);
      `;
      await pool.query(createTableSQL);
      logger.info('message_external_projects テーブルを新規作成しました');
    }
  } catch (error) {
    const err = error as Error;
    logger.error({
      errorMessage: err.message,
      errorStack: err.stack,
      errorName: err.name
    }, 'message_external_projects テーブルの初期化に失敗しました');
    throw error;
  }
}

/**
 * メッセージに外部プロジェクトID（ai-org-projects）を割り当て
 */
export async function assignExternalProjectToMessage(
  messageTs: string,
  externalProjectId: string | null
): Promise<boolean> {
  try {
    await initializeMessageExternalProjectsTable();

    if (externalProjectId === null) {
      // 外部プロジェクト割り当て解除
      await pool.query(
        `DELETE FROM message_external_projects WHERE message_ts = $1`,
        [messageTs]
      );
      logger.info({ messageTs }, 'メッセージの外部プロジェクト割り当てを解除しました');
      return true;
    }

    // UPSERT: 存在すれば更新、なければ挿入
    await pool.query(
      `INSERT INTO message_external_projects (message_ts, external_project_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (message_ts) DO UPDATE SET external_project_id = $2, updated_at = NOW()`,
      [messageTs, externalProjectId]
    );
    logger.info({ messageTs, externalProjectId }, 'メッセージに外部プロジェクトを割り当てました');
    return true;
  } catch (error) {
    logger.error({ error, messageTs, externalProjectId }, '外部プロジェクト割り当てに失敗しました');
    throw error;
  }
}

/**
 * 単一メッセージの外部プロジェクト割当情報を取得
 */
export async function getMessageExternalProjectAssignment(messageTs: string): Promise<string | null> {
  try {
    await initializeMessageExternalProjectsTable();

    const result = await pool.query(
      `SELECT external_project_id FROM message_external_projects WHERE message_ts = $1`,
      [messageTs]
    );

    if (result.rows.length > 0) {
      return result.rows[0].external_project_id;
    }

    return null;
  } catch (error) {
    logger.error({ error, messageTs }, '外部プロジェクト割当情報の取得に失敗しました');
    throw error;
  }
}

/**
 * メッセージの外部プロジェクト割当情報を取得（一括）
 * @returns Map<message_ts, external_project_id>
 */
export async function getMessageExternalProjectAssignments(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  try {
    await initializeMessageExternalProjectsTable();

    const result = await pool.query(`
      SELECT message_ts, external_project_id FROM message_external_projects
    `);
    for (const row of result.rows) {
      map.set(row.message_ts, row.external_project_id);
    }

    return map;
  } catch (error) {
    logger.error({ error }, '外部プロジェクト割当情報の一括取得に失敗しました');
    throw error;
  }
}
