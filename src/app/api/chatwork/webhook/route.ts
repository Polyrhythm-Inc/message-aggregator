import { NextRequest, NextResponse } from 'next/server';
import { ChatworkWebhookInput } from '../../../../types/chatwork';
import { ChatworkWebhookHandler } from '../../../../lib/chatwork-webhook-handler';
import { logger } from '../../../../lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const chatworkWebhook = body as ChatworkWebhookInput;

    logger.info('Chatworkイベントを受信しました', { 
      signature: chatworkWebhook.chatwork_webhook_signature,
      room_id: chatworkWebhook.webhook_event?.room_id,
      message_id: chatworkWebhook.webhook_event?.message_id
    });

    // APIキーの検証
    const webhookApiKeys = process.env.CHATWORK_WEBHOOK_API_KEY?.split(',') || [];
    if (!webhookApiKeys.includes(chatworkWebhook.chatwork_webhook_signature)) {
      logger.error('Chatwork Webhook API Keyが無効です', {
        provided_signature: chatworkWebhook.chatwork_webhook_signature
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Webhookイベントの処理
    await ChatworkWebhookHandler.handleWebhook(chatworkWebhook);
    logger.info('Chatworkイベントを正常に処理しました');

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Chatworkイベント処理中にエラーが発生しました', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// GET リクエストの場合は簡単な確認メッセージを返す
export async function GET() {
  return NextResponse.json({ message: 'Chatwork Webhook API is running' });
} 