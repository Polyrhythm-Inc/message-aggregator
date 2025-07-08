import { ChatworkWebhookInput } from '../types/chatwork';
import { ChatworkService } from './chatwork-service';
import { logger } from './logger';

// 無視する送信者のアカウントIDリスト
const IGNORED_ACCOUNT_IDS = [
  1095722, // Yoshiko（元の実装から）
];

export const ChatworkWebhookHandler = {
  async handleWebhook(webhook: ChatworkWebhookInput): Promise<void> {
    // 外部のSlackワークスペースのWebhook URLを取得
    const webhookUrl = process.env.EXTERNAL_SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      logger.error('EXTERNAL_SLACK_WEBHOOK_URL環境変数が設定されていません');
      return;
    }

    try {
      const messageBody = webhook.webhook_event?.body;
      const roomId = webhook.webhook_event?.room_id;
      const messageId = webhook.webhook_event?.message_id;
      const fromAccountId = webhook.webhook_event?.from_account_id;

      logger.info('ChatworkのWebhookイベントを処理中', { 
        roomId, 
        messageId, 
        fromAccountId 
      });

      // 無視するアカウントからのメッセージかどうか確認
      if (!fromAccountId || IGNORED_ACCOUNT_IDS.includes(fromAccountId)) {
        logger.info('無視対象のアカウントからのメッセージをスキップします', { fromAccountId });
        return;
      }

      // Chatwork APIトークンが設定されているか確認
      const chatworkApiToken = process.env.CHATWORK_API_TOKEN;
      if (!chatworkApiToken) {
        logger.error('CHATWORK_API_TOKEN環境変数が設定されていません');
        return;
      }

      // Chatworkの送信者情報を取得
      const chatworkService = new ChatworkService(chatworkApiToken);
      let senderName = `Account ${fromAccountId}`;
      
      try {
        const accountInfo = await chatworkService.getAccountInfo(fromAccountId);
        senderName = accountInfo.name;
      } catch (error) {
        logger.warn('アカウント情報の取得に失敗しました、デフォルト値を使用します', { 
          fromAccountId,
          error: error instanceof Error ? error.message : error 
        });
      }

      // Chatworkメッセージへのリンクを生成
      const chatworkMessageLink = `https://www.chatwork.com/#!rid${roomId}-${messageId}`;

      // Slackに投稿するメッセージを作成
      const slackMessage = `**Chatwork Message**\nFrom: ${senderName}\nRoom: ${roomId}\nMessage ID: [${messageId}](${chatworkMessageLink})\n\n${messageBody}`;

      logger.info('外部Slackに送信中', { 
        slackMessage: slackMessage.substring(0, 100) + '...' 
      });

      // 外部のSlackワークスペースにメッセージを送信
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: slackMessage }),
      });

      logger.info('Chatworkメッセージを外部Slackに送信しました', { 
        status: response.status,
        messageId 
      });

      if (!response.ok) {
        const responseText = await response.text();
        logger.error('外部Slackへの転送に失敗しました', {
          status: response.status,
          statusText: response.statusText,
          responseText,
        });
        throw new Error(`外部Slackへの転送に失敗しました: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Chatworkイベント処理中にエラーが発生しました', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        webhook_event: webhook.webhook_event,
      });
      throw error;
    }
  },
}; 