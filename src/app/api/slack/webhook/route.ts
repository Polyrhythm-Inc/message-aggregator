import { NextRequest, NextResponse } from 'next/server';
import { SlackWebhook } from '../../../../types/slack';
import { ExternalSlackWebhookHandler } from '../../../../lib/external-slack-webhook-handler';
import { logger } from '../../../../lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slackWebhook = body as SlackWebhook;

    logger.info('Slackイベントを受信しました', { type: slackWebhook.type });

    // URL検証の場合はチャレンジを返す
    if (slackWebhook.type === 'url_verification') {
      logger.info('URL検証のチャレンジを受信しました');
      return NextResponse.json({ challenge: slackWebhook.challenge });
    }

    // イベントの場合は外部Slackハンドラーで処理
    if (slackWebhook.type === 'event_callback') {
      await ExternalSlackWebhookHandler.handleWebhook(slackWebhook);
      logger.info('Slackイベントを正常に処理しました');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Slackイベント処理中にエラーが発生しました', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// GET リクエストの場合は簡単な確認メッセージを返す
export async function GET() {
  return NextResponse.json({ message: 'Slack Webhook API is running' });
} 