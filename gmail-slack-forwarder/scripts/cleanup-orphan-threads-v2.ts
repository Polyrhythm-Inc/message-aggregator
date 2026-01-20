#!/usr/bin/env npx tsx
/**
 * Cleanup orphan thread messages in Slack channel.
 * Deletes thread replies where the parent message has been deleted.
 *
 * This version uses a different approach:
 * 1. Get all messages including thread replies
 * 2. Check if any reply's thread_ts doesn't match any parent in the channel
 */

import { WebClient } from '@slack/web-api';

const CHANNEL_ID = 'C045XMMGDHC';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const hoursBack = parseInt(process.argv[2] || '3', 10);
const OLDEST_TIME = Math.floor(Date.now() / 1000) - (hoursBack * 60 * 60);

if (!SLACK_BOT_TOKEN) {
  console.error('SLACK_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const client = new WebClient(SLACK_BOT_TOKEN);

interface SlackMessage {
  ts: string;
  thread_ts?: string;
  text?: string;
  subtype?: string;
  reply_count?: number;
}

async function getAllMessages(): Promise<SlackMessage[]> {
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  // First, get channel history
  do {
    const response = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: String(OLDEST_TIME),
      limit: 200,
      cursor,
    });

    const messages = (response.messages || []) as SlackMessage[];
    allMessages.push(...messages);
    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  console.log(`Found ${allMessages.length} messages in channel history`);

  // For each message with replies, get all thread replies
  const threadsToFetch = allMessages.filter(m => m.reply_count && m.reply_count > 0);
  console.log(`Found ${threadsToFetch.length} threads with replies`);

  for (const thread of threadsToFetch) {
    try {
      const response = await client.conversations.replies({
        channel: CHANNEL_ID,
        ts: thread.ts,
        limit: 200,
      });

      const replies = (response.messages || []) as SlackMessage[];
      // Skip the first message (it's the parent)
      for (const reply of replies.slice(1)) {
        if (!allMessages.some(m => m.ts === reply.ts)) {
          allMessages.push(reply);
        }
      }
    } catch (error: any) {
      console.log(`  Could not fetch thread ${thread.ts}: ${error.data?.error || error.message}`);
    }
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`Total messages after fetching threads: ${allMessages.length}`);
  return allMessages;
}

async function checkIfParentExists(threadTs: string): Promise<boolean> {
  try {
    const response = await client.conversations.replies({
      channel: CHANNEL_ID,
      ts: threadTs,
      limit: 1,
    });

    const messages = response.messages || [];
    // Check if the first message's ts matches the thread_ts (meaning parent exists)
    return messages.length > 0 && messages[0].ts === threadTs;
  } catch (error: any) {
    if (error.data?.error === 'thread_not_found') {
      return false;
    }
    // For other errors, assume parent exists to be safe
    console.log(`  Warning: Could not verify thread ${threadTs}: ${error.data?.error || error.message}`);
    return true;
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
    console.error(`  Failed to delete ${ts}: ${error.data?.error || error.message}`);
    return false;
  }
}

async function main() {
  console.log('Starting orphan thread cleanup v2...');
  console.log(`Channel: ${CHANNEL_ID}`);
  console.log(`Looking for messages from last ${hoursBack} hours (since ${new Date(OLDEST_TIME * 1000).toISOString()})`);
  console.log('');

  const allMessages = await getAllMessages();

  // Find thread replies
  const threadReplies = allMessages.filter(m => m.thread_ts && m.ts !== m.thread_ts);
  console.log(`Found ${threadReplies.length} thread replies`);

  // Get unique thread_ts values
  const uniqueThreads = [...new Set(threadReplies.map(m => m.thread_ts!))];
  console.log(`Checking ${uniqueThreads.length} unique threads for orphans...`);
  console.log('');

  const orphans: SlackMessage[] = [];

  for (const threadTs of uniqueThreads) {
    const parentExists = await checkIfParentExists(threadTs);

    if (!parentExists) {
      const orphanReplies = threadReplies.filter(m => m.thread_ts === threadTs);
      console.log(`  Thread ${threadTs}: Parent DELETED - ${orphanReplies.length} orphan replies found`);
      orphans.push(...orphanReplies);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('');

  if (orphans.length === 0) {
    console.log('No orphan thread messages found.');
    return;
  }

  console.log(`Found ${orphans.length} orphan messages to delete:`);
  for (const orphan of orphans) {
    console.log(`  - ${orphan.ts}: ${(orphan.text || '').substring(0, 50)}...`);
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
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');
  console.log(`Cleanup complete: ${deleted} deleted, ${failed} failed`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
