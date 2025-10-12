import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { SlackWebhook } from '../../../../types/slack';
import { SlackHelper } from '../../../../lib/slack-helper';
import { logger } from '../../../../lib/logger';
import {
  buildTaskDescription,
  createTaskOnTaskServer,
  ensureTaskServerApiKey,
  generateTaskTitle,
} from '../../../../lib/task-server';

const ALERT_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

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
      processSlackEvent(slackWebhook).catch((error) => {
        logger.error('Slackイベントの非同期処理でエラーが発生しました', {
          error: error instanceof Error ? error.message : error,
        });
      });
      logger.info('Slackイベントの非同期処理を開始しました');
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

async function processSlackEvent(slackWebhook: SlackWebhook): Promise<void> {
  console.log('processSlackEvent', slackWebhook);
  const event = slackWebhook.event;

  if (event.type !== 'app_mention') {
    logger.debug('対象外のイベントタイプのためスキップしました', { eventType: event.type });
    return;
  }

  if (event.subtype === 'bot_message') {
    logger.debug('ボットメッセージのためスキップしました', { user: event.user });
    return;
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    throw new Error('SLACK_BOT_TOKENが設定されていません');
  }

  const client = new WebClient(botToken);
  const botUserId =
    slackWebhook.authorizations?.find((auth) => auth.is_bot)?.user_id ||
    process.env.SLACK_BOT_USER_ID;

  const originalText = event.text || SlackHelper.textInWebhook(slackWebhook);
  const cleanedText = cleanMentionText(originalText, botUserId);

  if (!cleanedText) {
    logger.warn('メンション本文が取得できませんでした', { originalText });
    return;
  }

  const [userName, channelName, permalink] = await Promise.all([
    fetchUserName(client, event.user),
    fetchChannelName(client, event.channel),
    fetchPermalink(client, event.channel, event.ts),
  ]);

  const title = await generateTaskTitle(cleanedText);
  console.log('title', title);
  const description = await buildTaskDescription({
    message: cleanedText,
    permalink,
    userName,
    userId: event.user,
    channelName,
  });
  console.log('description', description);

  const apiKey = ensureTaskServerApiKey();
  const createPayload = {
    title,
    description,
    status: 'TODO' as const,
    tags: ['Slack', '自動作成'],
    estimatedMinutes: 60,
  };

  const result = await createTaskOnTaskServer(createPayload, apiKey);
  console.log('result', result);

  if (!result.success) {
    await handleTaskCreationFailure({
      slackClient: client,
      event,
      error: result.error ?? 'タスク作成に失敗しました',
      cleanedText,
      permalink,
    });
    return;
  }

  await notifyTaskCreationSuccess({
    slackClient: client,
    event,
    title,
    taskUrl: result.taskUrl,
  });
}

function cleanMentionText(text: string, botUserId?: string): string {
  let cleaned = text;
  if (botUserId) {
    const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');
    cleaned = cleaned.replace(mentionPattern, '');
  }
  // Slackのメンションで先頭にスペースが多く付くことがあるため整形
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

async function fetchUserName(client: WebClient, userId?: string): Promise<string | undefined> {
  if (!userId) {
    return undefined;
  }

  try {
    const result = await client.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || undefined;
  } catch (error) {
    logger.warn('Slackユーザー情報取得に失敗しました', {
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return undefined;
  }
}

async function fetchChannelName(client: WebClient, channelId: string): Promise<string | undefined> {
  try {
    const result = await client.conversations.info({ channel: channelId });
    const channel = result.channel;
    if (channel && 'name' in channel) {
      return channel.name as string;
    }
    return undefined;
  } catch (error) {
    logger.warn('Slackチャンネル情報取得に失敗しました', {
      channelId,
      error: error instanceof Error ? error.message : error,
    });
    return undefined;
  }
}

async function fetchPermalink(client: WebClient, channel: string, ts: string): Promise<string | undefined> {
  try {
    const result = await client.chat.getPermalink({
      channel,
      message_ts: ts,
    });
    return result.permalink ?? undefined;
  } catch (error) {
    logger.warn('Slackメッセージのパーマリンク取得に失敗しました', {
      channel,
      ts,
      error: error instanceof Error ? error.message : error,
    });
    return undefined;
  }
}

async function notifyTaskCreationSuccess({
  slackClient,
  event,
  title,
  taskUrl,
}: {
  slackClient: WebClient;
  event: SlackWebhook['event'];
  title: string;
  taskUrl?: string;
}): Promise<void> {
  const threadTs = event.thread_ts ?? event.ts;
  const text = taskUrl ? `タスクを作成しました: ${title}\n${taskUrl}` : `タスクを作成しました: ${title}`;

  try {
    await slackClient.chat.postMessage({
      channel: event.channel,
      text,
      thread_ts: threadTs,
    });
    logger.info('Slackにタスク作成完了メッセージを投稿しました', { channel: event.channel, threadTs });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Slackへのタスク作成完了メッセージ送信に失敗しました', {
      channel: event.channel,
      threadTs,
      error: errorMessage,
    });
    await sendErrorAlert({
      message: 'タスク作成後のSlack返信に失敗しました',
      error: errorMessage,
      event,
      cleanedText: title,
    });
  }
}

async function handleTaskCreationFailure({
  slackClient,
  event,
  error,
  cleanedText,
  permalink,
}: {
  slackClient: WebClient;
  event: SlackWebhook['event'];
  error: string;
  cleanedText: string;
  permalink?: string;
}): Promise<void> {
  logger.error('タスク作成に失敗しました', { error });

  await sendErrorAlert({
    message: 'Slackメンションからのタスク作成に失敗しました',
    error,
    event,
    cleanedText,
    permalink,
  });

  const threadTs = event.thread_ts ?? event.ts;
  try {
    await slackClient.chat.postMessage({
      channel: event.channel,
      text: 'タスクの作成に失敗しました。管理者に通知済みです。',
      thread_ts: threadTs,
    });
  } catch (postError) {
    logger.error('タスク作成失敗通知の送信に失敗しました', {
      channel: event.channel,
      threadTs,
      error: postError instanceof Error ? postError.message : postError,
    });
  }
}

async function sendErrorAlert({
  message,
  error,
  event,
  cleanedText,
  permalink,
}: {
  message: string;
  error: string;
  event: SlackWebhook['event'];
  cleanedText: string;
  permalink?: string;
}): Promise<void> {
  if (!ALERT_WEBHOOK_URL) {
    logger.error('SLACK_WEBHOOK_URLが設定されていないため、エラーアラートを送信できません');
    return;
  }

  const alertPayload = {
    text: `${message}\n- エラー: ${error}\n- ユーザー: ${event.user ?? '不明'}\n- チャンネル: ${event.channel}\n- メッセージ: ${cleanedText}${permalink ? `\n- URL: ${permalink}` : ''}`,
  };

  try {
    const response = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload),
    });

    if (!response.ok) {
      logger.error('エラーアラート送信に失敗しました', {
        status: response.status,
        statusText: response.statusText,
      });
    } else {
      logger.info('エラーアラートを送信しました');
    }
  } catch (sendError) {
    logger.error('エラーアラート送信処理で例外が発生しました', {
      error: sendError instanceof Error ? sendError.message : sendError,
    });
  }
}
