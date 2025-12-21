import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { logger } from '@/lib/logger';
import { SlackMessage, MessagesResponse } from '@/types/slack';
import {
  getCachedUserName,
  setCachedUserNames,
  extractMentionedUserIds,
  resolveMentions,
} from '@/lib/user-cache';
import {
  getChatworkCachedUserName,
  setChatworkCachedUserNames,
} from '@/lib/chatwork-user-cache';
import { ChatworkService } from '@/lib/chatwork-service';

const TASK_CHANNEL_ID = 'C045XMMGDHC';

// Chatworkメッセージからルーム ID とアカウント ID を抽出
function extractChatworkInfo(text: string): { roomId: number; accountId: number } | null {
  // パターン: **Chatwork Message**\nFrom: Account 2191513\nRoom: 313028602
  const roomMatch = text.match(/Room:\s*(\d+)/);
  const accountMatch = text.match(/From:\s*Account\s+(\d+)/);

  if (roomMatch && accountMatch) {
    return {
      roomId: parseInt(roomMatch[1], 10),
      accountId: parseInt(accountMatch[1], 10),
    };
  }
  return null;
}

// Chatworkメッセージ内のAccount IDを名前に置換
function resolveChatworkAccountName(
  text: string,
  chatworkUserMap: Map<number, string>
): string {
  return text.replace(/From:\s*Account\s+(\d+)/g, (match, accountId) => {
    const name = chatworkUserMap.get(parseInt(accountId, 10));
    return name ? `From: ${name}` : match;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '20', 10),
      100
    );

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: 'SLACK_BOT_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(botToken);

    const result = await client.conversations.history({
      channel: TASK_CHANNEL_ID,
      limit,
    });

    if (!result.ok || !result.messages) {
      logger.error({ result }, 'Slackメッセージ取得に失敗しました');
      return NextResponse.json(
        { error: 'メッセージの取得に失敗しました' },
        { status: 500 }
      );
    }

    // ユーザーIDのリストを抽出（送信者 + 本文内メンション）
    const senderUserIds = result.messages
      .filter((msg) => msg.user)
      .map((msg) => msg.user as string);

    const mentionedUserIds = result.messages
      .filter((msg) => msg.text)
      .flatMap((msg) => extractMentionedUserIds(msg.text || ''));

    const allUserIds = [...new Set([...senderUserIds, ...mentionedUserIds])];

    // ユーザー名を取得（キャッシュ優先）
    const userMap = new Map<string, string>();
    const uncachedUserIds: string[] = [];

    for (const userId of allUserIds) {
      const cachedName = getCachedUserName(userId);
      if (cachedName) {
        userMap.set(userId, cachedName);
      } else {
        uncachedUserIds.push(userId);
      }
    }

    // キャッシュにないユーザーのみAPIで取得
    if (uncachedUserIds.length > 0) {
      const newUsers = new Map<string, string>();
      await Promise.all(
        uncachedUserIds.map(async (userId) => {
          try {
            const userInfo = await client.users.info({ user: userId });
            if (userInfo.user) {
              const userName = userInfo.user.real_name || userInfo.user.name || userId;
              userMap.set(userId, userName);
              newUsers.set(userId, userName);
            }
          } catch {
            userMap.set(userId, userId);
          }
        })
      );

      // 新しく取得したユーザー情報をキャッシュに保存
      if (newUsers.size > 0) {
        setCachedUserNames(newUsers);
      }
    }

    // Chatworkメッセージのユーザー名を解決
    const chatworkUserMap = new Map<number, string>();
    const chatworkApiToken = process.env.CHATWORK_API_TOKEN;

    if (chatworkApiToken) {
      // Chatworkメッセージを検出してルームIDとアカウントIDを抽出
      const chatworkInfos = result.messages
        .map((msg) => extractChatworkInfo(msg.text || ''))
        .filter((info): info is { roomId: number; accountId: number } => info !== null);

      // キャッシュにないアカウントIDを特定
      const uncachedChatworkAccounts: { roomId: number; accountId: number }[] = [];
      for (const info of chatworkInfos) {
        const cachedName = getChatworkCachedUserName(info.accountId);
        if (cachedName) {
          chatworkUserMap.set(info.accountId, cachedName);
        } else {
          uncachedChatworkAccounts.push(info);
        }
      }

      // キャッシュにないアカウントはルームメンバーAPIで取得
      if (uncachedChatworkAccounts.length > 0) {
        const chatworkService = new ChatworkService(chatworkApiToken);
        const roomIds = [...new Set(uncachedChatworkAccounts.map((a) => a.roomId))];

        for (const roomId of roomIds) {
          try {
            const members = await chatworkService.getRoomMembers(roomId);
            const memberMap = new Map<number, string>();
            for (const member of members) {
              memberMap.set(member.account_id, member.name);
              chatworkUserMap.set(member.account_id, member.name);
            }
            setChatworkCachedUserNames(memberMap);
          } catch (error) {
            logger.warn('Chatworkルームメンバー取得に失敗しました', {
              roomId,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      }
    }

    // メッセージを整形
    const messages: SlackMessage[] = result.messages.map((msg) => {
      // filesにメールがあるかチェック
      const files = msg.files as Array<{
        filetype?: string;
        subject?: string;
        plain_text?: string;
        from?: Array<{ address?: string; name?: string }>;
        to?: Array<{ address?: string; name?: string }>;
      }> | undefined;

      const emailFile = files?.find((f) => f.filetype === 'email');
      const formatEmailAddress = (entry?: { address?: string; name?: string }) => {
        if (!entry) return undefined;
        const { name, address } = entry;
        if (name && address) return `${name} <${address}>`;
        return name || address;
      };
      const email = emailFile
        ? {
            subject: emailFile.subject || '(件名なし)',
            body: emailFile.plain_text || '',
            from: formatEmailAddress(emailFile.from?.[0]) || '不明',
            to: formatEmailAddress(emailFile.to?.[0]),
          }
        : undefined;

      // メッセージ本文内のメンションをユーザー名に置換
      let resolvedText = resolveMentions(msg.text || '', userMap);

      // Chatworkメッセージ内のAccount IDを名前に置換
      resolvedText = resolveChatworkAccountName(resolvedText, chatworkUserMap);

      return {
        ts: msg.ts || '',
        text: resolvedText,
        user: msg.user,
        userName: msg.user ? userMap.get(msg.user) : undefined,
        subtype: msg.subtype,
        bot_id: msg.bot_id,
        email,
      };
    });

    const response: MessagesResponse = {
      messages,
      hasMore: result.has_more || false,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Slackメッセージ取得中にエラーが発生しました'
    );
    return NextResponse.json(
      { error: 'メッセージの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ts } = body;

    if (!ts) {
      return NextResponse.json(
        { error: 'タイムスタンプ(ts)が必要です' },
        { status: 400 }
      );
    }

    // 削除にはUser Token（管理者権限）を使用
    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      return NextResponse.json(
        { error: 'SLACK_USER_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(userToken);

    await client.chat.delete({
      channel: TASK_CHANNEL_ID,
      ts,
    });

    logger.info({ ts, channel: TASK_CHANNEL_ID }, 'Slackメッセージを削除しました');

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Slackメッセージ削除中にエラーが発生しました'
    );

    // Slack APIのエラーメッセージを解析
    if (errorMessage.includes('cant_delete_message')) {
      return NextResponse.json(
        { error: 'このメッセージは削除できません（権限がありません）' },
        { status: 403 }
      );
    }
    if (errorMessage.includes('message_not_found')) {
      return NextResponse.json(
        { error: 'メッセージが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'メッセージの削除に失敗しました' },
      { status: 500 }
    );
  }
}
