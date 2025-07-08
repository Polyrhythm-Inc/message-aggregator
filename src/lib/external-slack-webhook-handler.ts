import { WebClient } from '@slack/web-api';
import { SlackWebhook } from '../types/slack';
import { SlackHelper } from './slack-helper';
import { logger } from './logger';

export const ExternalSlackWebhookHandler = {
  async handleWebhook(slackWebhook: SlackWebhook): Promise<void> {
    // 環境変数から外部のSlackワークスペースのWebhook URLを取得
    const webhookUrl = process.env.EXTERNAL_SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      logger.error('EXTERNAL_SLACK_WEBHOOK_URL環境変数が設定されていません');
      return;
    }

    try {
      // Slack Web APIクライアントの初期化
      const client = new WebClient(process.env.SLACK_BOT_TOKEN);

      // チーム情報の取得
      const teamInfo = await client.team.info({
        team: slackWebhook.team_id,
      });

      // ユーザー情報の取得
      const userInfo = await client.users.info({
        user: slackWebhook.event.user || '',
      });

      // "Hitoshi Yunoki" が含まれる場合は処理をスキップ
      const senderName = userInfo.user?.real_name || userInfo.user?.name || '不明なユーザー';
      if (senderName.includes('Hitoshi Yunoki')) {
        logger.info('Hitoshi Yunokiからのメッセージをスキップします');
        return;
      }

      const host = teamInfo.team?.domain;
      const messageText = SlackHelper.textInWebhook(slackWebhook);

      // 送信者名を含めたメッセージを作成
      const messageWithSender = `${senderName}さんからのメッセージ:\n${messageText}`;

      const messageWithLink =
        messageWithSender +
        '\n' +
        SlackHelper.buildUrl(
          slackWebhook.event.channel,
          slackWebhook.event.ts,
          slackWebhook.event.thread_ts,
          host,
        );

      // 外部のSlackワークスペースにメッセージを送信
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: messageWithLink }),
      });

      logger.info('メッセージを外部Slackに送信しました', { text: messageWithLink });
      logger.info('レスポンスステータス:', response.status);

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
      logger.error('外部Slackへのメッセージ転送中にエラーが発生しました', error);
      throw error;
    }
  },
}; 