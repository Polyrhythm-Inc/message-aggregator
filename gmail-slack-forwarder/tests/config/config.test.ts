import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../src/config/index.js';

describe('loadConfig', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `config-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.yaml');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should load valid config', () => {
    const configContent = `
poll_interval_seconds: 60
max_messages_per_poll: 10
gmail_query: "in:inbox"
credentials_path: "${testDir}/credentials.json"

slack:
  bot_token_env: "MY_SLACK_TOKEN"
  post_channel_id: "C12345"

accounts:
  - name: "test"
    display_name: "test@example.com"
    token_path: "${testDir}/token.json"

dedupe:
  sqlite_path: "${testDir}/state.db"
`;

    writeFileSync(configPath, configContent);

    const config = loadConfig(configPath);

    expect(config.pollIntervalSeconds).toBe(60);
    expect(config.maxMessagesPerPoll).toBe(10);
    expect(config.slack.botTokenEnv).toBe('MY_SLACK_TOKEN');
    expect(config.slack.postChannelId).toBe('C12345');
    expect(config.accounts).toHaveLength(1);
    expect(config.accounts[0].name).toBe('test');
  });

  it('should apply default values', () => {
    const configContent = `
slack:
  post_channel_id: "C12345"

accounts:
  - name: "test"
    display_name: "test@example.com"
    token_path: "/tmp/token.json"
`;

    writeFileSync(configPath, configContent);

    const config = loadConfig(configPath);

    expect(config.pollIntervalSeconds).toBe(30);
    expect(config.maxMessagesPerPoll).toBe(20);
    expect(config.gmailQuery).toBe('in:inbox -label:slack_done');
    expect(config.slack.botTokenEnv).toBe('SLACK_BOT_TOKEN');
    expect(config.format.includeAccountHeader).toBe(true);
    expect(config.format.bodyMaxChars).toBe(4000);
    expect(config.attachments.enabled).toBe(true);
  });

  it('should throw for missing config file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow('Config file not found');
  });

  it('should throw for invalid config', () => {
    const configContent = `
poll_interval_seconds: 5  # Below minimum of 10
slack:
  post_channel_id: "C12345"

accounts:
  - name: "test"
    display_name: "test@example.com"
    token_path: "/tmp/token.json"
`;

    writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Invalid config');
  });

  it('should throw for missing required fields', () => {
    const configContent = `
poll_interval_seconds: 30
# Missing slack and accounts
`;

    writeFileSync(configPath, configContent);

    expect(() => loadConfig(configPath)).toThrow('Invalid config');
  });

  it('should expand tilde in paths', () => {
    const configContent = `
credentials_path: "~/test/credentials.json"

slack:
  post_channel_id: "C12345"

accounts:
  - name: "test"
    display_name: "test@example.com"
    token_path: "~/test/token.json"

dedupe:
  sqlite_path: "~/test/state.db"
`;

    writeFileSync(configPath, configContent);

    const config = loadConfig(configPath);
    const homeDir = process.env.HOME || '/Users/yunoki';

    expect(config.credentialsPath).toContain(homeDir);
    expect(config.credentialsPath).not.toContain('~');
    expect(config.accounts[0].tokenPath).toContain(homeDir);
    expect(config.dedupe.sqlitePath).toContain(homeDir);
  });

  it('should convert snake_case to camelCase', () => {
    const configContent = `
poll_interval_seconds: 45
max_messages_per_poll: 15
gmail_query: "in:inbox"

slack:
  bot_token_env: "TOKEN"
  post_channel_id: "C12345"

accounts:
  - name: "test"
    display_name: "test@example.com"
    token_path: "/tmp/token.json"

format:
  include_account_header: true
  body_max_chars: 3000
  split_long_body_into_thread: false
  include_gmail_permalink: true

attachments:
  enabled: false
  upload_as_thread_reply: false
`;

    writeFileSync(configPath, configContent);

    const config = loadConfig(configPath);

    expect(config.pollIntervalSeconds).toBe(45);
    expect(config.maxMessagesPerPoll).toBe(15);
    expect(config.format.includeAccountHeader).toBe(true);
    expect(config.format.bodyMaxChars).toBe(3000);
    expect(config.format.splitLongBodyIntoThread).toBe(false);
    expect(config.format.includeGmailPermalink).toBe(true);
    expect(config.attachments.enabled).toBe(false);
    expect(config.attachments.uploadAsThreadReply).toBe(false);
  });
});
