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
      
      let host = 'workspace';
      try {
        // チーム情報の取得
        const teamInfo = await client.team.info({
          team: slackWebhook.team_id,
        });
        host = teamInfo.team?.domain || 'workspace';
        logger.info('チーム情報を取得しました', { domain: host });
      } catch (teamError) {
        logger.warn('チーム情報の取得に失敗しました、デフォルト値を使用します', { 
          error: teamError instanceof Error ? teamError.message : teamError 
        });
      }

      // 編集メッセージの場合とそうでない場合の処理を分岐
      let actualUser: string | undefined;
      let actualText: string | undefined;
      let actualTs: string;
      
      if (slackWebhook.event.subtype === 'message_changed' && slackWebhook.event.message) {
        // 編集メッセージの場合
        const message = slackWebhook.event.message;
        actualUser = message.user;
        actualText = message.text;
        actualTs = message.ts;
        logger.info('編集メッセージを検出しました', { 
          user: actualUser, 
          text: actualText,
          ts: actualTs 
        });
      } else {
        // 通常のメッセージの場合
        actualUser = slackWebhook.event.user;
        actualText = slackWebhook.event.text;
        actualTs = slackWebhook.event.ts;
        logger.info('通常のメッセージを検出しました', { 
          user: actualUser, 
          text: actualText,
          ts: actualTs 
        });
      }

      // メンバーIDがU031ZRTQYの場合は転送しない
      if (actualUser === 'U031ZRTQY') {
        logger.info('指定されたメンバーIDのメッセージをスキップします', { user: actualUser });
        return;
      }

      logger.info('ユーザー情報を取得中...', { user_id: actualUser });

      let senderName = '不明なユーザー';
      if (actualUser) {
        try {
          // ユーザー情報の取得
          const userInfo = await client.users.info({
            user: actualUser,
          });
          senderName = userInfo.user?.real_name || userInfo.user?.name || '不明なユーザー';
          logger.info('ユーザー情報を取得しました', { senderName });
        } catch (userError) {
          logger.warn('ユーザー情報の取得に失敗しました、デフォルト値を使用します', { 
            error: userError instanceof Error ? userError.message : userError,
            user_id: actualUser
          });
          senderName = `ユーザー(${actualUser})`;
        }
      }

      logger.info('送信者名を確認', { senderName });
      
      // "Hitoshi Yunoki" が含まれる場合は処理をスキップ
      if (senderName.includes('Hitoshi Yunoki')) {
        logger.info('Hitoshi Yunokiからのメッセージをスキップします');
        return;
      }

      // メッセージテキストの取得（編集メッセージの場合は実際のテキストを使用）
      let messageText = actualText || '';
      if (!messageText) {
        // テキストが取得できない場合は、SlackHelperを使用してフォールバック
        messageText = SlackHelper.textInWebhook(slackWebhook);
      }

      logger.info('メッセージを準備中', { host, messageText });

      // 編集メッセージの場合は「編集済み」を追加
      const messagePrefix = slackWebhook.event.subtype === 'message_changed' ? '【編集済み】' : '';
      
      // 送信者名を含めたメッセージを作成
      const messageWithSender = `${messagePrefix}${senderName}さんからのメッセージ:\n${messageText}`;

      const messageWithLink =
        messageWithSender +
        '\n' +
        SlackHelper.buildUrl(
          slackWebhook.event.channel,
          actualTs,
          slackWebhook.event.thread_ts,
          host,
        );

      logger.info('外部Slackに送信中', { messageWithLink });

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