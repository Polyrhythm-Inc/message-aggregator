import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProcessedMail } from './types.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS processed_mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail_account TEXT NOT NULL,
    gmail_message_id TEXT NOT NULL,
    slack_ts TEXT,
    processed_at TEXT NOT NULL,
    UNIQUE(gmail_account, gmail_message_id)
)
`;

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_processed_mails_account_message
ON processed_mails(gmail_account, gmail_message_id)
`;

export class DedupeStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_INDEX_SQL);
  }

  isProcessed(accountName: string, messageId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM processed_mails
      WHERE gmail_account = ? AND gmail_message_id = ?
      LIMIT 1
    `);

    const result = stmt.get(accountName, messageId);
    return result !== undefined;
  }

  markProcessed(accountName: string, messageId: string, slackTs: string | null): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO processed_mails (gmail_account, gmail_message_id, slack_ts, processed_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(accountName, messageId, slackTs, new Date().toISOString());
  }

  getProcessedMail(accountName: string, messageId: string): ProcessedMail | null {
    const stmt = this.db.prepare(`
      SELECT id, gmail_account as gmailAccount, gmail_message_id as gmailMessageId,
             slack_ts as slackTs, processed_at as processedAt
      FROM processed_mails
      WHERE gmail_account = ? AND gmail_message_id = ?
    `);

    const result = stmt.get(accountName, messageId) as ProcessedMail | undefined;
    return result ?? null;
  }

  getStats(): { total: number; byAccount: Record<string, number> } {
    const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM processed_mails`);
    const totalResult = totalStmt.get() as { count: number };

    const byAccountStmt = this.db.prepare(`
      SELECT gmail_account as account, COUNT(*) as count
      FROM processed_mails
      GROUP BY gmail_account
    `);
    const byAccountResult = byAccountStmt.all() as Array<{ account: string; count: number }>;

    const byAccount: Record<string, number> = {};
    for (const row of byAccountResult) {
      byAccount[row.account] = row.count;
    }

    return {
      total: totalResult.count,
      byAccount,
    };
  }

  /**
   * Delete records older than the specified number of days
   * @param retentionDays Number of days to retain records
   * @returns Number of deleted records
   */
  deleteOldRecords(retentionDays: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    const stmt = this.db.prepare(`
      DELETE FROM processed_mails
      WHERE processed_at < ?
    `);

    const result = stmt.run(cutoffIso);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
