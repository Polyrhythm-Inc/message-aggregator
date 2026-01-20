#!/usr/bin/env npx tsx
/**
 * Cleanup orphan thread messages in Slack channel.
 * Deletes thread replies where the parent message has been deleted.
 */

import { WebClient } from '@slack/web-api';

const CHANNEL_ID = 'C045XMMGDHC';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
// Check how many hours back to look (default 3, can be overridden via CLI arg)
const hoursBack = parseInt(process.argv[2] || '3', 10);
const OLDEST_TIME = Math.floor(Date.now() / 1000) - (hoursBack * 60 * 60);

if (!SLACK_BOT_TOKEN) {
  console.error('SLACK_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const client = new WebClient(SLACK_BOT_TOKEN);

async function getChannelHistory(): Promise<any[]> {
  const messages: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: String(OLDEST_TIME),
      limit: 200,
      cursor,
    });

    if (response.messages) {
      messages.push(...response.messages);
    }

    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  return messages;
}

async function getThreadReplies(threadTs: string): Promise<any[]> {
  try {
    const response = await client.conversations.replies({
      channel: CHANNEL_ID,
      ts: threadTs,
      limit: 200,
    });

    return response.messages || [];
  } catch (error: any) {
    // If thread_not_found, the parent was deleted
    if (error.data?.error === 'thread_not_found') {
      return [];
    }
    throw error;
  }
}

async function deleteMessage(ts: string): Promise<boolean> {
  try {
    await client.chat.delete({
      channel: CHANNEL_ID,
      ts,
    });
    return true;
  } catch (error: any) {
    console.error(`Failed to delete message ${ts}:`, error.data?.error || error.message);
    return false;
  }
}

async function findOrphanThreadMessages(): Promise<{ ts: string; text: string }[]> {
  const orphans: { ts: string; text: string }[] = [];

  // Get all messages in the channel from the last 3 hours
  const messages = await getChannelHistory();
  console.log(`Found ${messages.length} messages in channel from last 3 hours`);

  // Get all parent timestamps (messages that are not thread replies)
  const parentTimestamps = new Set<string>();
  for (const msg of messages) {
    if (!msg.thread_ts || msg.ts === msg.thread_ts) {
      parentTimestamps.add(msg.ts);
    }
  }
  console.log(`Found ${parentTimestamps.size} parent messages`);

  // Find thread replies whose parent is not in the channel
  for (const msg of messages) {
    // Skip if this is a parent message
    if (!msg.thread_ts || msg.ts === msg.thread_ts) {
      continue;
    }

    // Check if the parent exists
    if (!parentTimestamps.has(msg.thread_ts)) {
      // Verify the parent is truly deleted by trying to fetch it
      try {
        const replies = await getThreadReplies(msg.thread_ts);
        // If we get replies and the first one (parent) doesn't match thread_ts, it's orphaned
        const parentExists = replies.some(r => r.ts === msg.thread_ts);
        if (!parentExists) {
          orphans.push({
            ts: msg.ts,
            text: (msg.text || '').substring(0, 50),
          });
        }
      } catch {
        // If we can't fetch, consider it orphaned
        orphans.push({
          ts: msg.ts,
          text: (msg.text || '').substring(0, 50),
        });
      }
    }
  }

  return orphans;
}

async function main() {
  console.log('Starting orphan thread cleanup...');
  console.log(`Channel: ${CHANNEL_ID}`);
  console.log(`Looking for messages from last ${hoursBack} hours (since ${new Date(OLDEST_TIME * 1000).toISOString()})`);
  console.log('');

  const orphans = await findOrphanThreadMessages();

  if (orphans.length === 0) {
    console.log('No orphan thread messages found.');
    return;
  }

  console.log(`Found ${orphans.length} orphan thread messages:`);
  for (const orphan of orphans) {
    console.log(`  - ${orphan.ts}: ${orphan.text}...`);
  }
  console.log('');

  console.log('Deleting orphan messages...');
  let deleted = 0;
  let failed = 0;

  for (const orphan of orphans) {
    const success = await deleteMessage(orphan.ts);
    if (success) {
      deleted++;
      console.log(`  ✓ Deleted ${orphan.ts}`);
    } else {
      failed++;
    }
    // Rate limiting - wait 1 second between deletes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');
  console.log(`Cleanup complete: ${deleted} deleted, ${failed} failed`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
