import { WebClient } from '@slack/web-api';
import { SlackWebhook, SlackReactionEvent, isReactionEvent } from '../types/slack';
import { SlackHelper } from './slack-helper';
import { logger } from './logger';

export const ExternalSlackWebhookHandler = {
  /**
   * リアクション追加イベントを処理して外部Slackに通知を送信
   */
  async handleReactionAdded(slackWebhook: SlackWebhook): Promise<void> {
    const webhookUrl = process.env.EXTERNAL_SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.error('EXTERNAL_SLACK_WEBHOOK_URL環境変数が設定されていません');
      return;
    }

    // リアクションイベントでない場合は処理しない
    if (!isReactionEvent(slackWebhook.event)) {
      logger.warn('handleReactionAddedにリアクションイベント以外が渡されました');
      return;
    }

    const event = slackWebhook.event as SlackReactionEvent;

    try {
      const client = new WebClient(process.env.SLACK_BOT_TOKEN);

      // チーム情報を取得
      let host = 'workspace';
      try {
        const teamInfo = await client.team.info({
          team: slackWebhook.team_id,
        });
        host = teamInfo.team?.domain || 'workspace';
        logger.info('チーム情報を取得しました', { domain: host });
      } catch (teamError) {
        logger.warn('チーム情報の取得に失敗しました、デフォルト値を使用します', {
          error: teamError instanceof Error ? teamError.message : teamError,
        });
      }

      // リアクションを付けたユーザーの情報を取得
      let reactorName = '不明なユーザー';
      try {
        const userInfo = await client.users.info({
          user: event.user,
        });
        reactorName = userInfo.user?.real_name || userInfo.user?.name || '不明なユーザー';
        logger.info('リアクションしたユーザー情報を取得しました', { reactorName });
      } catch (userError) {
        logger.warn('ユーザー情報の取得に失敗しました', {
          error: userError instanceof Error ? userError.message : userError,
          user_id: event.user,
        });
        reactorName = `ユーザー(${event.user})`;
      }

      // メンバーIDがU031ZRTQYの場合は転送しない
      if (event.user === 'U031ZRTQY') {
        logger.info('指定されたメンバーIDのリアクションをスキップします', { user: event.user });
        return;
      }

      // "Hitoshi Yunoki" が含まれる場合は処理をスキップ
      if (reactorName.includes('Hitoshi Yunoki')) {
        logger.info('Hitoshi Yunokiからのリアクションをスキップします');
        return;
      }

      // メッセージへのリンクを作成
      const messageLink = SlackHelper.buildUrl(
        event.item.channel,
        event.item.ts,
        undefined,
        host
      );

      // 絵文字を含むリアクション通知メッセージを作成
      const reactionMessage = `${reactorName}さんがメッセージに :${event.reaction}: リアクションしました\n${messageLink}`;

      logger.info('リアクション通知を外部Slackに送信中', { reactionMessage });

      // 外部のSlackワークスペースにメッセージを送信
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: reactionMessage }),
      });

      logger.info('リアクション通知を外部Slackに送信しました', { status: response.status });

      if (!response.ok) {
        const responseText = await response.text();
        logger.error('リアクション通知の外部Slackへの転送に失敗しました', {
          status: response.status,
          statusText: response.statusText,
          responseText,
        });
        throw new Error(`リアクション通知の外部Slackへの転送に失敗しました: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('リアクション通知の外部Slackへの転送中にエラーが発生しました', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        team_id: slackWebhook.team_id,
        user_id: event.user,
        reaction: event.reaction,
      });
      throw error;
    }
  },

  async handleWebhook(slackWebhook: SlackWebhook): Promise<void> {
    // 環境変数から外部のSlackワークスペースのWebhook URLを取得
    const webhookUrl = process.env.EXTERNAL_SLACK_WEBHOOK_URL;
    // Bot Tokenを取得（ファイル転送用）
    const botToken = process.env.SLACK_BOT_TOKEN;

    if (!webhookUrl) {
      logger.error('EXTERNAL_SLACK_WEBHOOK_URL環境変数が設定されていません');
      return;
    }

    // リアクションイベントは処理対象外（handleReactionAddedで処理）
    if (isReactionEvent(slackWebhook.event)) {
      logger.warn('handleWebhookにリアクションイベントが渡されました。handleReactionAddedを使用してください');
      return;
    }

    const event = slackWebhook.event;

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

      if (event.subtype === 'message_changed' && event.message) {
        // 編集メッセージの場合
        const message = event.message;
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
        actualUser = event.user;
        actualText = event.text;
        actualTs = event.ts;
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
        // return;
      }

      // メッセージテキストの取得（編集メッセージの場合は実際のテキストを使用）
      let messageText = actualText || '';
      if (!messageText) {
        // テキストが取得できない場合は、SlackHelperを使用してフォールバック
        messageText = SlackHelper.textInWebhook(slackWebhook);
      }

      logger.info('メッセージを準備中', { host, messageText });

      // 編集メッセージの場合は「編集済み」を追加
      const messagePrefix = event.subtype === 'message_changed' ? '【編集済み】' : '';

      // 送信者名を含めたメッセージを作成
      const messageWithSender = `${messagePrefix}${senderName}さんからのメッセージ:\n${messageText}`;

      const messageWithLink =
        messageWithSender +
        '\n' +
        SlackHelper.buildUrl(
          event.channel,
          actualTs,
          event.thread_ts,
          host,
        );

      // 添付ファイルの処理
      const files = event.files || [];
      const fileUrls: string[] = [];

      if (files.length > 0 && botToken) {
        logger.info('添付ファイルを処理中', { fileCount: files.length });

        for (const file of files) {
          try {
            // ファイルの公開URLを作成
            const publicUrlResult = await client.files.sharedPublicURL({
              file: file.id,
            });

            if (publicUrlResult.ok && publicUrlResult.file) {
              // 公開URLを生成（permalink_public）
              const publicFile = publicUrlResult.file as {
                permalink_public?: string;
                name?: string;
                title?: string;
              };
              if (publicFile.permalink_public) {
                const fileName = file.name || file.title || 'ファイル';
                fileUrls.push(`📎 ${fileName}: ${publicFile.permalink_public}`);
                logger.info('ファイルを公開しました', {
                  fileId: file.id,
                  fileName,
                  url: publicFile.permalink_public,
                });
              }
            }
          } catch (fileError) {
            // 既に公開されている場合や権限エラーの場合はpermalinkを使用
            logger.warn('ファイル公開に失敗、permalinkを使用します', {
              fileId: file.id,
              error: fileError instanceof Error ? fileError.message : fileError,
            });
            const fileName = file.name || file.title || 'ファイル';
            fileUrls.push(`📎 ${fileName}: ${file.permalink}`);
          }
        }
      }

      // メッセージ本文にファイルリンクを追加
      let finalMessage = messageWithLink;
      if (fileUrls.length > 0) {
        finalMessage += '\n\n' + fileUrls.join('\n');
      }

      logger.info('外部Slackに送信中', { finalMessage });

      // 外部のSlackワークスペースにメッセージを送信
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: finalMessage }),
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
        user_id: event.user,
      });
      throw error;
    }
  },
}; 