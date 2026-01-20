/**
 * レガシーテーブル削除スクリプト
 *
 * 以下のテーブルを削除します：
 * - projects: 内部プロジェクト管理テーブル（廃止）
 * - message_projects: メッセージと内部プロジェクトの関連テーブル（廃止）
 *
 * 注意: message_external_projectsテーブルは維持されます
 *
 * 使用方法:
 *   npx tsx scripts/drop-legacy-tables.ts
 */

import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL || '';

if (!dbUrl) {
  console.error('ERROR: DATABASE_URL環境変数が設定されていません');
  process.exit(1);
}

const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

async function dropLegacyTables() {
  console.log('レガシーテーブル削除スクリプトを開始します...\n');

  try {
    // 1. 現在のテーブル状況を確認
    console.log('=== 現在のテーブル状況 ===');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('projects', 'message_projects', 'message_external_projects')
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log('対象テーブルは存在しません。');
    } else {
      for (const row of tables.rows) {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${row.table_name}`);
        console.log(`- ${row.table_name}: ${countResult.rows[0].count} 件`);
      }
    }
    console.log('');

    // 2. message_projectsからmessage_external_projectsへデータ移行
    const messageProjectsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'message_projects'
      )
    `);

    if (messageProjectsExists.rows[0].exists) {
      // message_external_projectsテーブルを作成（存在しない場合）
      await pool.query(`
        CREATE TABLE IF NOT EXISTS message_external_projects (
          message_ts VARCHAR(50) PRIMARY KEY,
          external_project_id VARCHAR(36) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // 外部プロジェクトIDを持つデータを移行
      const migrationResult = await pool.query(`
        INSERT INTO message_external_projects (message_ts, external_project_id, created_at, updated_at)
        SELECT message_ts, external_project_id, created_at, updated_at
        FROM message_projects
        WHERE external_project_id IS NOT NULL
        ON CONFLICT (message_ts) DO NOTHING
      `);
      console.log(`=== データ移行 ===`);
      console.log(`message_projects → message_external_projects: ${migrationResult.rowCount} 件移行`);
      console.log('');
    }

    // 3. レガシーテーブルを削除
    console.log('=== テーブル削除 ===');

    // message_projectsを先に削除（外部キー制約がある可能性があるため）
    const dropMessageProjects = await pool.query(`
      DROP TABLE IF EXISTS message_projects CASCADE
    `);
    console.log('message_projects テーブルを削除しました');

    // projectsテーブルを削除
    const dropProjects = await pool.query(`
      DROP TABLE IF EXISTS projects CASCADE
    `);
    console.log('projects テーブルを削除しました');
    console.log('');

    // 4. 削除後の状況確認
    console.log('=== 削除後のテーブル状況 ===');
    const remainingTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%project%'
      ORDER BY table_name
    `);

    if (remainingTables.rows.length === 0) {
      console.log('プロジェクト関連テーブルはありません。');
    } else {
      for (const row of remainingTables.rows) {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${row.table_name}`);
        console.log(`- ${row.table_name}: ${countResult.rows[0].count} 件`);
      }
    }

    console.log('\nレガシーテーブル削除が完了しました。');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

dropLegacyTables();
