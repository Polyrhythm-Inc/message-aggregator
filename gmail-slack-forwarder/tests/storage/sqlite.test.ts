import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DedupeStorage } from '../../src/storage/sqlite.js';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('DedupeStorage', () => {
  let storage: DedupeStorage;
  let dbPath: string;

  beforeEach(() => {
    const testDir = join(tmpdir(), 'gmail-slack-forwarder-test');
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, `test-${Date.now()}.db`);
    storage = new DedupeStorage(dbPath);
  });

  afterEach(() => {
    storage.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe('isProcessed', () => {
    it('should return false for unprocessed message', () => {
      const result = storage.isProcessed('account1', 'msg123');

      expect(result).toBe(false);
    });

    it('should return true for processed message', () => {
      storage.markProcessed('account1', 'msg123', 'slack-ts-123');

      const result = storage.isProcessed('account1', 'msg123');

      expect(result).toBe(true);
    });

    it('should distinguish between accounts', () => {
      storage.markProcessed('account1', 'msg123', 'slack-ts-123');

      expect(storage.isProcessed('account1', 'msg123')).toBe(true);
      expect(storage.isProcessed('account2', 'msg123')).toBe(false);
    });

    it('should distinguish between message IDs', () => {
      storage.markProcessed('account1', 'msg123', 'slack-ts-123');

      expect(storage.isProcessed('account1', 'msg123')).toBe(true);
      expect(storage.isProcessed('account1', 'msg456')).toBe(false);
    });
  });

  describe('markProcessed', () => {
    it('should handle null slackTs', () => {
      storage.markProcessed('account1', 'msg123', null);

      const result = storage.getProcessedMail('account1', 'msg123');

      expect(result).not.toBeNull();
      expect(result?.slackTs).toBeNull();
    });

    it('should not duplicate entries', () => {
      storage.markProcessed('account1', 'msg123', 'slack-ts-1');
      storage.markProcessed('account1', 'msg123', 'slack-ts-2');

      const stats = storage.getStats();

      expect(stats.total).toBe(1);
    });
  });

  describe('getProcessedMail', () => {
    it('should return null for non-existent entry', () => {
      const result = storage.getProcessedMail('account1', 'msg123');

      expect(result).toBeNull();
    });

    it('should return full entry for processed message', () => {
      storage.markProcessed('account1', 'msg123', 'slack-ts-123');

      const result = storage.getProcessedMail('account1', 'msg123');

      expect(result).not.toBeNull();
      expect(result?.gmailAccount).toBe('account1');
      expect(result?.gmailMessageId).toBe('msg123');
      expect(result?.slackTs).toBe('slack-ts-123');
      expect(result?.processedAt).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return zero counts for empty database', () => {
      const stats = storage.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byAccount).toEqual({});
    });

    it('should return correct counts', () => {
      storage.markProcessed('account1', 'msg1', 'ts1');
      storage.markProcessed('account1', 'msg2', 'ts2');
      storage.markProcessed('account2', 'msg3', 'ts3');

      const stats = storage.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byAccount).toEqual({
        account1: 2,
        account2: 1,
      });
    });
  });

  describe('deleteOldRecords', () => {
    it('should delete records older than retention days', () => {
      // Add some records
      storage.markProcessed('account1', 'msg1', 'ts1');
      storage.markProcessed('account1', 'msg2', 'ts2');

      // All records are "new" (just created), so deleting with 7 days retention should delete nothing
      const deleted = storage.deleteOldRecords(7);

      expect(deleted).toBe(0);
      expect(storage.getStats().total).toBe(2);
    });

    it('should return 0 when no old records exist', () => {
      storage.markProcessed('account1', 'msg1', 'ts1');

      const deleted = storage.deleteOldRecords(1);

      expect(deleted).toBe(0);
    });

    it('should keep recent records', () => {
      storage.markProcessed('account1', 'msg1', 'ts1');
      storage.markProcessed('account2', 'msg2', 'ts2');

      // Retention of 365 days should keep all recent records
      const deleted = storage.deleteOldRecords(365);

      expect(deleted).toBe(0);
      expect(storage.getStats().total).toBe(2);
    });
  });
});
