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

      logger.info('チーム情報を取得中...', { team_id: slackWebhook.team_id });
      
      // チーム情報の取得
      const teamInfo = await client.team.info({
        team: slackWebhook.team_id,
      });

      logger.info('ユーザー情報を取得中...', { user_id: slackWebhook.event.user });

      // ユーザー情報の取得
      const userInfo = await client.users.info({
        user: slackWebhook.event.user || '',
      });

      // "Hitoshi Yunoki" が含まれる場合は処理をスキップ
      const senderName = userInfo.user?.real_name || userInfo.user?.name || '不明なユーザー';
      logger.info('送信者名を確認', { senderName });
      
      if (senderName.includes('Hitoshi Yunoki')) {
        logger.info('Hitoshi Yunokiからのメッセージをスキップします');
        return;
      }

      const host = teamInfo.team?.domain;
      const messageText = SlackHelper.textInWebhook(slackWebhook);

      logger.info('メッセージを準備中', { host, messageText });

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

      logger.info('外部Slackに送信中', { webhookUrl, messageWithLink });

      // 外部のSlackワークスペースにメッセージを送信
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: messageWithLink }),
      });

      logger.info('メッセージを外部Slackに送信しました', { status: response.status });

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
      logger.error('外部Slackへのメッセージ転送中にエラーが発生しました', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        team_id: slackWebhook.team_id,
        user_id: slackWebhook.event.user,
      });
      throw error;
    }
  },
}; 