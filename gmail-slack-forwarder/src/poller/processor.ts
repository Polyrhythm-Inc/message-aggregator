import type { Config, Account } from '../config/schema.js';
import { GmailClient, GmailAuth, parseGmailMessage } from '../gmail/index.js';
import { SlackClient, SlackFormatter } from '../slack/index.js';
import { DedupeStorage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { isRetryableError } from '../utils/errors.js';

const SLACK_DONE_LABEL = 'slack_done';

export interface ProcessorDependencies {
  gmailAuth: GmailAuth;
  slackClient: SlackClient;
  storage: DedupeStorage;
  formatter: SlackFormatter;
}

export interface ProcessResult {
  accountName: string;
  messagesProcessed: number;
  messagesSkipped: number;
  errors: number;
}

export class MessageProcessor {
  private gmailClients: Map<string, GmailClient> = new Map();

  constructor(
    private config: Config,
    private deps: ProcessorDependencies
  ) {}

  async initialize(): Promise<void> {
    for (const account of this.config.accounts) {
      try {
        const client = new GmailClient(this.deps.gmailAuth, account.tokenPath);
        await client.initialize();
        this.gmailClients.set(account.name, client);
        logger.info({ account: account.name }, 'Gmail client initialized');
      } catch (error) {
        logger.warn(
          { account: account.name, error },
          'Failed to initialize Gmail client (token may be missing), skipping account'
        );
      }
    }

    if (this.gmailClients.size === 0) {
      throw new Error('No Gmail accounts could be initialized. Please run OAuth setup for at least one account.');
    }
  }

  async processAllAccounts(): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];

    for (const account of this.config.accounts) {
      const result = await this.processAccount(account);
      results.push(result);
    }

    return results;
  }

  async processAccount(account: Account): Promise<ProcessResult> {
    const result: ProcessResult = {
      accountName: account.name,
      messagesProcessed: 0,
      messagesSkipped: 0,
      errors: 0,
    };

    const gmailClient = this.gmailClients.get(account.name);
    if (!gmailClient) {
      logger.error({ account: account.name }, 'Gmail client not found');
      result.errors++;
      return result;
    }

    try {
      const messages = await gmailClient.listMessages(
        this.config.gmailQuery,
        this.config.maxMessagesPerPoll
      );

      logger.info(
        { account: account.name, count: messages.length },
        'Found messages to process'
      );

      for (const msgItem of messages) {
        const processedOne = await this.processMessage(
          account,
          gmailClient,
          msgItem.id
        );

        if (processedOne === 'processed') {
          result.messagesProcessed++;
        } else if (processedOne === 'skipped') {
          result.messagesSkipped++;
        } else {
          result.errors++;
        }
      }
    } catch (error) {
      logger.error(
        { error, account: account.name },
        'Error processing account'
      );
      result.errors++;
    }

    return result;
  }

  private async processMessage(
    account: Account,
    gmailClient: GmailClient,
    messageId: string
  ): Promise<'processed' | 'skipped' | 'error'> {
    // Check if already processed (second-level dedup)
    if (this.deps.storage.isProcessed(account.name, messageId)) {
      logger.debug(
        { account: account.name, messageId },
        'Message already processed (SQLite check)'
      );
      // Try to add the label if it wasn't added before
      try {
        await gmailClient.addLabel(messageId, SLACK_DONE_LABEL);
      } catch {
        // Ignore label errors for already processed messages
      }
      return 'skipped';
    }

    try {
      // Fetch full message
      const fullMessage = await gmailClient.getMessage(messageId);
      const parsedEmail = parseGmailMessage(fullMessage);

      logger.info(
        {
          account: account.name,
          messageId,
          subject: parsedEmail.subject,
          from: parsedEmail.from,
        },
        'Processing email'
      );

      // Format and post to Slack
      const formatted = this.deps.formatter.formatEmail(
        parsedEmail,
        account.displayName
      );

      const postResult = await this.deps.slackClient.postMessage(
        this.config.slack.postChannelId,
        formatted.blocks,
        formatted.text
      );

      if (!postResult.ok || !postResult.ts) {
        logger.error(
          { account: account.name, messageId, error: postResult.error },
          'Failed to post to Slack'
        );
        return 'error';
      }

      const slackTs = postResult.ts;

      // Handle long body - attach as .eml file instead of splitting into threads
      if (parsedEmail.body.length > this.config.format.bodyMaxChars) {
        try {
          // Get raw email content for .eml file
          const rawEmail = await gmailClient.getRawMessage(messageId);
          const safeSubject = parsedEmail.subject
            .replace(/[/\\?%*:|"<>]/g, '-')
            .substring(0, 50);
          const emlFilename = `${safeSubject}.eml`;

          await this.deps.slackClient.uploadFile({
            channelId: this.config.slack.postChannelId,
            threadTs: slackTs,
            filename: emlFilename,
            content: rawEmail,
            mimeType: 'message/rfc822',
          });

          logger.info(
            { account: account.name, filename: emlFilename },
            'Uploaded email as .eml attachment (body was too long)'
          );
        } catch (error) {
          logger.warn(
            { error, account: account.name, messageId },
            'Failed to upload .eml attachment'
          );
        }
      }

      // Handle attachments
      if (
        this.config.attachments.enabled &&
        parsedEmail.attachments.length > 0
      ) {
        for (const attachment of parsedEmail.attachments) {
          try {
            const content = await gmailClient.getAttachment(
              messageId,
              attachment.attachmentId
            );

            await this.deps.slackClient.uploadFile({
              channelId: this.config.slack.postChannelId,
              threadTs: slackTs,
              filename: attachment.filename,
              content,
              mimeType: attachment.mimeType,
            });

            logger.info(
              { account: account.name, filename: attachment.filename },
              'Uploaded attachment'
            );
          } catch (error) {
            logger.warn(
              { error, account: account.name, filename: attachment.filename },
              'Failed to upload attachment'
            );
            // Continue with other attachments
          }
        }
      }

      // Mark as processed in SQLite
      this.deps.storage.markProcessed(account.name, messageId, slackTs);

      // Add label to Gmail
      await gmailClient.addLabel(messageId, SLACK_DONE_LABEL);

      logger.info(
        { account: account.name, messageId, subject: parsedEmail.subject },
        'Email forwarded successfully'
      );

      return 'processed';
    } catch (error) {
      if (isRetryableError(error)) {
        logger.warn(
          { error, account: account.name, messageId },
          'Retryable error, will retry next poll'
        );
      } else {
        logger.error(
          { error, account: account.name, messageId },
          'Error processing message'
        );
      }
      return 'error';
    }
  }
}
