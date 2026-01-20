#!/usr/bin/env tsx

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { loadConfig } from '../src/config/index.js';
import { GmailAuth } from '../src/gmail/auth.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      account: { type: 'string', short: 'a' },
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
Gmail OAuth Setup Script

Usage:
  npm run setup -- --account <account-name>
  npm run setup -- -a <account-name>

Options:
  -a, --account <name>  Account name to set up (as defined in config.yaml)
  -c, --config <path>   Path to config file (default: ~/.gmail-slack-forwarder/config.yaml)
  -h, --help           Show this help message

Examples:
  npm run setup -- --account accountA
  npm run setup -- -a accountB -c ./config/config.yaml
`);
    process.exit(0);
  }

  if (!values.account) {
    console.error('Error: --account is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(values.config);

  // Find the account
  const account = config.accounts.find(a => a.name === values.account);
  if (!account) {
    console.error(`Error: Account "${values.account}" not found in config`);
    console.error('Available accounts:', config.accounts.map(a => a.name).join(', '));
    process.exit(1);
  }

  // Check if credentials file exists
  if (!existsSync(config.credentialsPath)) {
    console.error(`Error: Credentials file not found: ${config.credentialsPath}`);
    console.error(`
Please download your OAuth credentials from Google Cloud Console:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create or select an OAuth 2.0 Client ID (Desktop application)
3. Download the JSON file
4. Save it to: ${config.credentialsPath}
`);
    process.exit(1);
  }

  // Check if token already exists
  if (existsSync(account.tokenPath)) {
    console.log(`Token already exists for account "${account.name}": ${account.tokenPath}`);
    console.log('To re-authenticate, delete the existing token file first.');
    process.exit(0);
  }

  console.log(`Setting up OAuth for account: ${account.name} (${account.displayName})`);

  try {
    const auth = new GmailAuth(config.credentialsPath);
    await auth.authenticate(account.name, account.tokenPath);

    console.log('\nSetup complete!');
    console.log(`Token saved to: ${account.tokenPath}`);
  } catch (error) {
    console.error('OAuth setup failed:', error);
    process.exit(1);
  }
}

main();
