import type { Config } from '../config/schema.js';
import { GmailAuth } from '../gmail/index.js';
import { SlackClient, SlackFormatter } from '../slack/index.js';
import { DedupeStorage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { MessageProcessor } from './processor.js';

// Cleanup interval: run cleanup once per hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export class Poller {
  private processor: MessageProcessor;
  private isRunning = false;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastCleanupTime = 0;

  constructor(
    private config: Config,
    private gmailAuth: GmailAuth,
    private slackClient: SlackClient,
    private storage: DedupeStorage
  ) {
    const formatter = new SlackFormatter(config.format);

    this.processor = new MessageProcessor(config, {
      gmailAuth,
      slackClient,
      storage,
      formatter,
    });
  }

  async initialize(): Promise<void> {
    await this.processor.initialize();
    logger.info('Poller initialized');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Poller is already running');
      return;
    }

    this.isRunning = true;
    logger.info(
      { interval: this.config.pollIntervalSeconds, retentionDays: this.config.dedupe.retentionDays },
      'Starting poller'
    );

    // Run cleanup on start
    this.runCleanup();

    // Schedule periodic cleanup
    this.cleanupIntervalId = setInterval(() => {
      this.runCleanup();
    }, CLEANUP_INTERVAL_MS);

    // Run immediately on start
    await this.poll();

    // Schedule next poll
    this.scheduleNextPoll();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    logger.info('Poller stopped');
  }

  private runCleanup(): void {
    try {
      const retentionDays = this.config.dedupe.retentionDays;
      const deleted = this.storage.deleteOldRecords(retentionDays);

      if (deleted > 0) {
        logger.info(
          { deleted, retentionDays },
          'Cleaned up old records'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error during cleanup');
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimeoutId = setTimeout(async () => {
      if (this.isRunning) {
        await this.poll();
        this.scheduleNextPoll();
      }
    }, this.config.pollIntervalSeconds * 1000);
  }

  async poll(): Promise<void> {
    const startTime = Date.now();
    logger.debug('Starting poll cycle');

    try {
      const results = await this.processor.processAllAccounts();

      const totalProcessed = results.reduce((sum, r) => sum + r.messagesProcessed, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.messagesSkipped, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

      const duration = Date.now() - startTime;

      if (totalProcessed > 0 || totalErrors > 0) {
        logger.info(
          {
            processed: totalProcessed,
            skipped: totalSkipped,
            errors: totalErrors,
            durationMs: duration,
          },
          'Poll cycle completed'
        );
      } else {
        logger.debug(
          { skipped: totalSkipped, durationMs: duration },
          'Poll cycle completed (no new messages)'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error in poll cycle');
    }
  }
}

export { MessageProcessor } from './processor.js';
