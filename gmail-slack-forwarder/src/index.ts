import { loadConfig, getSlackBotToken } from './config/index.js';
import { GmailAuth } from './gmail/index.js';
import { SlackClient } from './slack/index.js';
import { DedupeStorage } from './storage/index.js';
import { Poller } from './poller/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('Gmail → Slack Forwarder starting...');

  // Load configuration
  const configPath = process.env.CONFIG_PATH || undefined;
  const config = loadConfig(configPath);

  logger.info(
    {
      accounts: config.accounts.map(a => a.name),
      pollInterval: config.pollIntervalSeconds,
      channel: config.slack.postChannelId,
    },
    'Configuration loaded'
  );

  // Initialize components
  const gmailAuth = new GmailAuth(config.credentialsPath);
  const slackBotToken = getSlackBotToken(config);
  const slackClient = new SlackClient(slackBotToken);
  const storage = new DedupeStorage(config.dedupe.sqlitePath);

  // Create and start poller
  const poller = new Poller(config, gmailAuth, slackClient, storage);

  // Handle graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    poller.stop();
    storage.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await poller.initialize();
    await poller.start();
  } catch (error) {
    logger.error({ error }, 'Failed to start poller');
    storage.close();
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ error }, 'Unhandled error');
  process.exit(1);
});
