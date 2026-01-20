import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { logger } from '@/lib/logger';
import { SlackReplyRequest, SlackReplyResponse } from '@/types/slack';

export async function POST(request: NextRequest) {
  try {
    const body: SlackReplyRequest = await request.json();
    const { channelId, threadTs, text } = body;

    // バリデーション
    if (!channelId) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'チャンネルIDが必要です' },
        { status: 400 }
      );
    }

    if (!threadTs) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'スレッドIDが必要です' },
        { status: 400 }
      );
    }

    if (!text || !text.trim()) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: '返信内容が必要です' },
        { status: 400 }
      );
    }

    // SLACK_USER_TOKENを使用して返信
    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'SLACK_USER_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(userToken);

    // スレッドに返信
    const result = await client.chat.postMessage({
      channel: channelId,
      text: text.trim(),
      thread_ts: threadTs,
    });

    if (!result.ok) {
      logger.error({ result }, 'Slack返信に失敗しました');
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: '返信の送信に失敗しました' },
        { status: 500 }
      );
    }

    logger.info(
      { channelId, threadTs, messageTs: result.ts },
      'Slackスレッドに返信しました'
    );

    return NextResponse.json<SlackReplyResponse>({
      success: true,
      messageTs: result.ts,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Slack返信中にエラーが発生しました'
    );

    // Slack APIのエラーメッセージを解析
    if (errorMessage.includes('channel_not_found')) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'チャンネルにアクセスできません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('not_in_channel')) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'チャンネルに参加していません' },
        { status: 403 }
      );
    }
    if (errorMessage.includes('thread_not_found')) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: '元のメッセージが見つかりません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('rate_limited')) {
      return NextResponse.json<SlackReplyResponse>(
        { success: false, error: 'しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    return NextResponse.json<SlackReplyResponse>(
      { success: false, error: '返信の送信に失敗しました' },
      { status: 500 }
    );
  }
}
