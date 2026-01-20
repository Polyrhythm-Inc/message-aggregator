import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { ChatworkWebhookInput } from '../../../../types/chatwork';
import { ChatworkWebhookHandler } from '../../../../lib/chatwork-webhook-handler';
import { logger } from '../../../../lib/logger';

/**
 * Chatwork Webhook署名を検証する
 * @param body リクエストボディの文字列
 * @param signature 提供された署名
 * @param token Webhook設定で取得したトークン
 * @returns 署名が有効かどうか
 */
function verifyWebhookSignature(body: string, signature: string, token: string): boolean {
  try {
    // 1. トークンをBase64デコードして秘密鍵とする
    const secretKey = Buffer.from(token, 'base64');
    
    // 2. リクエストボディと秘密鍵を使ってHMAC-SHA256でダイジェスト値を取得
    const hmac = createHmac('sha256', secretKey);
    hmac.update(body, 'utf8');
    const digest = hmac.digest();
    
    // 3. ダイジェスト値をBase64エンコード
    const expectedSignature = digest.toString('base64');
    
    // 4. 署名を比較
    return expectedSignature === signature;
  } catch (error) {
    logger.error('署名検証中にエラーが発生しました', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを文字列として取得（署名検証用）
    const bodyText = await request.text();
    
    // リクエストボディをJSONとしてパース
    let chatworkWebhook: ChatworkWebhookInput;
    try {
      chatworkWebhook = JSON.parse(bodyText) as ChatworkWebhookInput;
    } catch (parseError) {
      logger.error('リクエストボディのJSONパースに失敗しました', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // chatwork_webhook_signatureをヘッダーまたはクエリストリングから取得
    const url = new URL(request.url);
    const chatworkWebhookSignature = 
      request.headers.get('x-chatworkwebhooksignature') || 
      url.searchParams.get('chatwork_webhook_signature');

    logger.info('Chatworkイベントを受信しました', { 
      signature_present: !!chatworkWebhookSignature,
      room_id: chatworkWebhook.webhook_event?.room_id,
      message_id: chatworkWebhook.webhook_event?.message_id
    });

    // 署名が存在しない場合
    if (!chatworkWebhookSignature) {
      logger.error('Chatwork Webhook署名が提供されていません');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    // トークンの取得と検証
    const webhookTokens = process.env.CHATWORK_WEBHOOK_TOKEN?.split(',') || [];
    if (webhookTokens.length === 0) {
      logger.error('CHATWORK_WEBHOOK_TOKENが設定されていません');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 設定されたトークンのいずれかで署名検証を行う
    let isValidSignature = false;
    for (const token of webhookTokens) {
      if (verifyWebhookSignature(bodyText, chatworkWebhookSignature, token.trim())) {
        isValidSignature = true;
        break;
      }
    }

    if (!isValidSignature) {
      logger.error('Chatwork Webhook署名が無効です', {
        provided_signature: chatworkWebhookSignature
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
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