import { WebClient } from '@slack/web-api';
import { SlackWebhook } from '../types/slack';
import { SlackHelper } from './slack-helper';
import { addToQueue, initializeQueueTable } from './db/queue';
import { logger } from './logger';

// ai-org専用のボットユーザーID（環境変数で設定）
const AI_ORG_BOT_USER_ID = process.env.AI_ORG_BOT_USER_ID;

/**
 * ai-org向けのSlackメンションを処理してQueueに追加する
 */
export async function handleAiOrgMention(slackWebhook: SlackWebhook): Promise<boolean> {
  if (!AI_ORG_BOT_USER_ID) {
    // AI_ORG_BOT_USER_IDが設定されていない場合はスキップ
    return false;
  }

  const event = slackWebhook.event;
  const isAppMention = event.type === 'app_mention';
  const isMessage = event.type === 'message';

  if (!isAppMention && !isMessage) {
    return false;
  }

  // ボットメッセージはスキップ
  if (event.subtype === 'bot_message') {
    return false;
  }

  // メッセージイベントの場合、対象外のサブタイプをスキップ
  if (isMessage) {
    const ignoredSubtypes = new Set(['message_changed', 'message_deleted', 'thread_broadcast']);
    if (event.subtype && ignoredSubtypes.has(event.subtype)) {
      return false;
    }
  }

  // ai-orgボットへのメンションかチェック
  const rawText = event.text || SlackHelper.textInWebhook(slackWebhook);
  if (!rawText.includes(`<@${AI_ORG_BOT_USER_ID}>`)) {
    return false;
  }

  logger.info(
    { channel: event.channel, user: event.user },
    'ai-orgボットへのメンションを検出しました'
  );

  try {
    // Queueテーブル初期化
    await initializeQueueTable();

    // メンションを除去したテキストを取得
    const cleanedText = cleanMentionText(rawText, AI_ORG_BOT_USER_ID);
    if (!cleanedText) {
      logger.warn({ rawText }, 'ai-orgメンション本文が空です');
      return false;
    }

    // イベントタイプを判定（スレッド返信か新規ゴールか）
    const isThreadReply = !!event.thread_ts && event.thread_ts !== event.ts;
    const eventType = isThreadReply ? 'thread_reply' : 'new_goal';

    // Queueに追加
    const queueItem = await addToQueue({
      channel_id: event.channel,
      thread_ts: event.thread_ts || null,
      message_ts: event.ts,
      user_id: event.user || 'unknown',
      text: cleanedText,
      event_type: eventType,
    });

    logger.info(
      { queueId: queueItem.id, channel: event.channel },
      'ai-org Queueにメッセージを追加しました'
    );

    // 処理中リアクションを追加
    await addProcessingReaction(slackWebhook, event);

    return true;
  } catch (error) {
    logger.error(
      { error, channel: event.channel },
      'ai-org Queueへの追加に失敗しました'
    );
    return false;
  }
}

/**
 * メンションテキストからボットメンションを除去
 */
function cleanMentionText(text: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');
  return text.replace(mentionPattern, '').replace(/\s+/g, ' ').trim();
}

/**
 * 処理中を示すリアクションを追加
 */
async function addProcessingReaction(
  slackWebhook: SlackWebhook,
  event: SlackWebhook['event']
): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken || !event.ts) {
    return;
  }

  const teamId =
    slackWebhook.event.team ||
    slackWebhook.team_id ||
    slackWebhook.context_team_id ||
    undefined;

  const client = new WebClient(botToken, teamId ? { teamId } : undefined);

  try {
    await client.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: 'hourglass_flowing_sand',
    });
    logger.debug({ channel: event.channel, ts: event.ts }, 'ai-org処理中リアクションを追加しました');
  } catch (error) {
    logger.warn({ error }, 'ai-org処理中リアクション追加に失敗しました');
  }
}
