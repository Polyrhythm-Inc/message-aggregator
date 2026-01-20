#!/usr/bin/env tsx

import { parseArgs } from 'node:util';
import { loadConfig, getSlackBotToken } from '../src/config/index.js';
import { GmailAuth, GmailClient } from '../src/gmail/index.js';
import { SlackClient } from '../src/slack/index.js';
import { DedupeStorage } from '../src/storage/index.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
Connection Test Script

Usage:
  npm run test:connection
  npm run test:connection -- --config <path>

Options:
  -c, --config <path>   Path to config file (default: ~/.gmail-slack-forwarder/config.yaml)
  -h, --help           Show this help message
`);
    process.exit(0);
  }

  console.log('Testing Gmail → Slack Forwarder connections...\n');

  // Load configuration
  let config;
  try {
    config = loadConfig(values.config);
    console.log('✓ Configuration loaded successfully');
    console.log(`  - Accounts: ${config.accounts.map(a => a.name).join(', ')}`);
    console.log(`  - Channel: ${config.slack.postChannelId}`);
    console.log(`  - Poll interval: ${config.pollIntervalSeconds}s`);
  } catch (error) {
    console.error('✗ Failed to load configuration:', error);
    process.exit(1);
  }

  // Test Slack connection
  try {
    const slackToken = getSlackBotToken(config);
    const slackClient = new SlackClient(slackToken);
    console.log('\n✓ Slack bot token found');

    // Note: We don't actually post a test message, just verify the token is set
    console.log('  (Note: Actual Slack API test skipped to avoid posting messages)');
  } catch (error) {
    console.error('\n✗ Slack configuration error:', error);
  }

  // Test Gmail connections
  const gmailAuth = new GmailAuth(config.credentialsPath);
  console.log('\n✓ Gmail credentials loaded');

  for (const account of config.accounts) {
    try {
      const client = new GmailClient(gmailAuth, account.tokenPath);
      await client.initialize();

      // List messages to verify connection
      const messages = await client.listMessages('in:inbox', 1);
      console.log(`\n✓ Gmail account "${account.name}" connected`);
      console.log(`  - Display name: ${account.displayName}`);
      console.log(`  - Inbox has messages: ${messages.length > 0 ? 'Yes' : 'Empty or no access'}`);
    } catch (error) {
      console.error(`\n✗ Gmail account "${account.name}" failed:`, error);
    }
  }

  // Test SQLite storage
  try {
    const storage = new DedupeStorage(config.dedupe.sqlitePath);
    const stats = storage.getStats();
    console.log('\n✓ SQLite storage initialized');
    console.log(`  - Path: ${config.dedupe.sqlitePath}`);
    console.log(`  - Total processed: ${stats.total}`);
    storage.close();
  } catch (error) {
    console.error('\n✗ SQLite storage error:', error);
  }

  console.log('\n=== Connection test complete ===');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
