import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { logger } from '@/lib/logger';

// リアクション追加リクエストの型
type SlackReactionRequest = {
  channelId: string;
  messageTs: string;
  name: string; // 絵文字名（':'なし。例: 'thumbsup', 'heart'）
};

// リアクションレスポンスの型
type SlackReactionResponse = {
  success: boolean;
  error?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: SlackReactionRequest = await request.json();
    const { channelId, messageTs, name } = body;

    // バリデーション
    if (!channelId) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'チャンネルIDが必要です' },
        { status: 400 }
      );
    }

    if (!messageTs) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'メッセージIDが必要です' },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: '絵文字名が必要です' },
        { status: 400 }
      );
    }

    // SLACK_USER_TOKENを使用してリアクション追加
    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'SLACK_USER_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(userToken);

    // リアクション追加
    const result = await client.reactions.add({
      channel: channelId,
      timestamp: messageTs,
      name: name.trim().replace(/^:|:$/g, ''), // コロンを除去
    });

    if (!result.ok) {
      logger.error({ result }, 'Slackリアクション追加に失敗しました');
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'リアクションの追加に失敗しました' },
        { status: 500 }
      );
    }

    logger.info(
      { channelId, messageTs, name },
      'Slackメッセージにリアクションを追加しました'
    );

    return NextResponse.json<SlackReactionResponse>({
      success: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Slackリアクション追加中にエラーが発生しました'
    );

    // Slack APIのエラーメッセージを解析
    if (errorMessage.includes('channel_not_found')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'チャンネルにアクセスできません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('not_in_channel')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'チャンネルに参加していません' },
        { status: 403 }
      );
    }
    if (errorMessage.includes('message_not_found')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'メッセージが見つかりません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('invalid_name')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: '無効な絵文字名です' },
        { status: 400 }
      );
    }
    if (errorMessage.includes('already_reacted')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: '既にリアクション済みです' },
        { status: 409 }
      );
    }
    if (errorMessage.includes('rate_limited')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    return NextResponse.json<SlackReactionResponse>(
      { success: false, error: 'リアクションの追加に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body: SlackReactionRequest = await request.json();
    const { channelId, messageTs, name } = body;

    // バリデーション
    if (!channelId) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'チャンネルIDが必要です' },
        { status: 400 }
      );
    }

    if (!messageTs) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'メッセージIDが必要です' },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: '絵文字名が必要です' },
        { status: 400 }
      );
    }

    // SLACK_USER_TOKENを使用してリアクション削除
    const userToken = process.env.SLACK_USER_TOKEN;
    if (!userToken) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'SLACK_USER_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    const client = new WebClient(userToken);

    // リアクション削除
    const result = await client.reactions.remove({
      channel: channelId,
      timestamp: messageTs,
      name: name.trim().replace(/^:|:$/g, ''), // コロンを除去
    });

    if (!result.ok) {
      logger.error({ result }, 'Slackリアクション削除に失敗しました');
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'リアクションの削除に失敗しました' },
        { status: 500 }
      );
    }

    logger.info(
      { channelId, messageTs, name },
      'Slackメッセージからリアクションを削除しました'
    );

    return NextResponse.json<SlackReactionResponse>({
      success: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Slackリアクション削除中にエラーが発生しました'
    );

    // Slack APIのエラーメッセージを解析
    if (errorMessage.includes('no_reaction')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'リアクションが見つかりません' },
        { status: 404 }
      );
    }
    if (errorMessage.includes('rate_limited')) {
      return NextResponse.json<SlackReactionResponse>(
        { success: false, error: 'しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    return NextResponse.json<SlackReactionResponse>(
      { success: false, error: 'リアクションの削除に失敗しました' },
      { status: 500 }
    );
  }
}
