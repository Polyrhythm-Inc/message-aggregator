import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { logger } from '@/lib/logger';
import { parseSlackUrl } from '@/lib/slack-url-parser';

export type SenderInfoResponse = {
  success: boolean;
  error?: string;
  sender?: {
    userId: string;
    userName: string;
    displayName?: string;
    realName?: string;
  };
};

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: 'urlパラメータが必要です' },
        { status: 400 }
      );
    }

    // URLをパース
    const urlInfo = parseSlackUrl(url);
    if (!urlInfo) {
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: '無効なSlack URLです' },
        { status: 400 }
      );
    }

    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: 'SLACK_USER_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(userToken);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let message: any;

    // スレッド返信の場合は conversations.replies を使用
    if (urlInfo.threadTs) {
      const repliesResult = await client.conversations.replies({
        channel: urlInfo.channelId,
        ts: urlInfo.threadTs,
        latest: urlInfo.messageTs,
        oldest: urlInfo.messageTs,
        inclusive: true,
        limit: 1,
      });

      if (!repliesResult.ok || !repliesResult.messages || repliesResult.messages.length === 0) {
        logger.warn({ urlInfo }, 'スレッド返信メッセージが見つかりませんでした');
        return NextResponse.json<SenderInfoResponse>(
          { success: false, error: 'メッセージが見つかりません' },
          { status: 404 }
        );
      }

      // 特定のタイムスタンプのメッセージを探す
      message = repliesResult.messages.find((m) => m.ts === urlInfo.messageTs);
      if (!message) {
        // 見つからない場合は最後のメッセージを使用（oldest/latestで1件に絞っているはず）
        message = repliesResult.messages[repliesResult.messages.length - 1];
      }
    } else {
      // 通常メッセージの場合は conversations.history を使用
      const historyResult = await client.conversations.history({
        channel: urlInfo.channelId,
        latest: urlInfo.messageTs,
        oldest: urlInfo.messageTs,
        inclusive: true,
        limit: 1,
      });

      if (!historyResult.ok || !historyResult.messages || historyResult.messages.length === 0) {
        logger.warn({ urlInfo }, 'メッセージが見つかりませんでした');
        return NextResponse.json<SenderInfoResponse>(
          { success: false, error: 'メッセージが見つかりません' },
          { status: 404 }
        );
      }

      message = historyResult.messages[0];
    }
    const userId = message.user;

    if (!userId) {
      // ボットメッセージの場合
      logger.info({ urlInfo, botId: message.bot_id }, '元メッセージもボットメッセージです');
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: '送信者情報がありません（ボットメッセージ）' },
        { status: 404 }
      );
    }

    // ユーザー情報を取得
    const userResult = await client.users.info({ user: userId });

    if (!userResult.ok || !userResult.user) {
      logger.warn({ userId }, 'ユーザー情報の取得に失敗しました');
      return NextResponse.json<SenderInfoResponse>({
        success: true,
        sender: {
          userId,
          userName: userId,
        },
      });
    }

    const user = userResult.user;

    logger.info(
      { userId, userName: user.name, channelId: urlInfo.channelId },
      '送信者情報を取得しました'
    );

    return NextResponse.json<SenderInfoResponse>({
      success: true,
      sender: {
        userId,
        userName: user.name || userId,
        displayName: user.profile?.display_name || undefined,
        realName: user.profile?.real_name || undefined,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      '送信者情報取得中にエラーが発生しました'
    );

    if (errorMessage.includes('channel_not_found')) {
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: 'チャンネルにアクセスできません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('rate_limited')) {
      return NextResponse.json<SenderInfoResponse>(
        { success: false, error: 'レート制限中です。しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    return NextResponse.json<SenderInfoResponse>(
      { success: false, error: '送信者情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
