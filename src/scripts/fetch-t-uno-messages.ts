/**
 * t.unoさんからのSlackメッセージを取得するスクリプト
 * チャンネル: #8weeks_アプリ版_開発 (C09U6PCDZV1)
 */

import { WebClient } from '@slack/web-api';

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C09U6PCDZV1'; // #8weeks_アプリ版_開発
// User Tokenを使用（Botよりも広い権限を持つ場合がある）
const SLACK_BOT_TOKEN = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) {
  console.error('Required environment variable: SLACK_USER_TOKEN or SLACK_BOT_TOKEN');
  process.exit(1);
}

// t.unoさんのユーザーIDを特定するためのキーワード
const T_UNO_KEYWORDS = ['t.uno', 'tuno', 'ウノ', '宇野'];

interface MessageWithReplies {
  ts: string;
  text: string;
  user: string;
  userName?: string;
  threadTs?: string;
  replyCount?: number;
  replies?: Array<{
    ts: string;
    text: string;
    user: string;
    userName?: string;
  }>;
  files?: Array<{
    id: string;
    name: string;
    url_private: string;
    mimetype: string;
  }>;
}

async function main() {
  const client = new WebClient(SLACK_BOT_TOKEN);

  // 過去1週間のタイムスタンプを計算
  const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

  console.log('Fetching messages from channel:', CHANNEL_ID);
  console.log('From:', new Date(oneWeekAgo * 1000).toISOString());
  console.log('---');

  try {
    // チャンネルのメッセージを取得
    const result = await client.conversations.history({
      channel: CHANNEL_ID,
      oldest: String(oneWeekAgo),
      limit: 200,
    });

    if (!result.ok || !result.messages) {
      console.error('Failed to fetch messages:', result);
      return;
    }

    console.log(`Fetched ${result.messages.length} messages`);

    // ユーザー情報をキャッシュ
    const userCache = new Map<string, string>();

    async function getUserName(userId: string): Promise<string> {
      if (userCache.has(userId)) {
        return userCache.get(userId)!;
      }
      try {
        const userInfo = await client.users.info({ user: userId });
        const name = userInfo.user?.real_name || userInfo.user?.name || userId;
        userCache.set(userId, name);
        return name;
      } catch {
        userCache.set(userId, userId);
        return userId;
      }
    }

    // t.unoさんのユーザーIDを特定
    let tUnoUserId: string | null = null;

    for (const msg of result.messages) {
      if (msg.user) {
        const userName = await getUserName(msg.user);
        if (T_UNO_KEYWORDS.some(k => userName.toLowerCase().includes(k.toLowerCase()))) {
          tUnoUserId = msg.user;
          console.log(`Found t.uno user: ${userName} (${msg.user})`);
          break;
        }
      }
    }

    // 各メッセージを処理
    const allMessages: MessageWithReplies[] = [];

    for (const msg of result.messages) {
      const userName = msg.user ? await getUserName(msg.user) : 'Unknown';

      const message: MessageWithReplies = {
        ts: msg.ts || '',
        text: msg.text || '',
        user: msg.user || '',
        userName,
        threadTs: msg.thread_ts,
        replyCount: msg.reply_count,
      };

      // ファイル情報を取得
      if (msg.files && Array.isArray(msg.files)) {
        message.files = msg.files.map((f: { id?: string; name?: string; url_private?: string; mimetype?: string }) => ({
          id: f.id || '',
          name: f.name || '',
          url_private: f.url_private || '',
          mimetype: f.mimetype || '',
        }));
      }

      // スレッドがある場合は返信を取得
      if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
        try {
          const replies = await client.conversations.replies({
            channel: CHANNEL_ID,
            ts: msg.thread_ts,
            limit: 100,
          });

          if (replies.ok && replies.messages) {
            message.replies = [];
            for (const reply of replies.messages) {
              if (reply.ts !== msg.thread_ts) { // 親メッセージを除外
                const replyUserName = reply.user ? await getUserName(reply.user) : 'Unknown';
                message.replies.push({
                  ts: reply.ts || '',
                  text: reply.text || '',
                  user: reply.user || '',
                  userName: replyUserName,
                });
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch replies:', err);
        }
      }

      allMessages.push(message);
    }

    // t.unoさんが関連するメッセージをフィルタリング
    const tUnoMessages = allMessages.filter(msg => {
      // t.unoさんが投稿したメッセージ
      if (tUnoUserId && msg.user === tUnoUserId) return true;

      // t.unoさんのキーワードが含まれるメッセージ
      if (T_UNO_KEYWORDS.some(k => msg.userName?.toLowerCase().includes(k.toLowerCase()))) return true;

      // t.unoさんが返信しているスレッド
      if (msg.replies?.some(r => tUnoUserId && r.user === tUnoUserId)) return true;
      if (msg.replies?.some(r => T_UNO_KEYWORDS.some(k => r.userName?.toLowerCase().includes(k.toLowerCase())))) return true;

      return false;
    });

    console.log('---');
    console.log(`t.unoさん関連メッセージ: ${tUnoMessages.length}件`);
    console.log('---');

    // 結果を出力
    for (const msg of tUnoMessages.reverse()) {
      const date = new Date(parseFloat(msg.ts) * 1000);
      console.log(`\n=== ${date.toISOString()} ===`);
      console.log(`From: ${msg.userName} (${msg.user})`);
      console.log(`Text: ${msg.text?.substring(0, 200)}...`);
      if (msg.files && msg.files.length > 0) {
        console.log(`Files: ${msg.files.map(f => f.name).join(', ')}`);
      }
      if (msg.replies && msg.replies.length > 0) {
        console.log(`Replies (${msg.replies.length}):`);
        for (const reply of msg.replies) {
          const replyDate = new Date(parseFloat(reply.ts) * 1000);
          console.log(`  - ${replyDate.toISOString()} ${reply.userName}: ${reply.text?.substring(0, 100)}...`);
        }
      }
    }

    // JSON形式で保存
    console.log('\n\n=== JSON OUTPUT ===\n');
    console.log(JSON.stringify({
      fetchedAt: new Date().toISOString(),
      channelId: CHANNEL_ID,
      period: {
        from: new Date(oneWeekAgo * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      tUnoUserId,
      messageCount: tUnoMessages.length,
      messages: tUnoMessages.map(msg => ({
        ...msg,
        timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      })),
    }, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
