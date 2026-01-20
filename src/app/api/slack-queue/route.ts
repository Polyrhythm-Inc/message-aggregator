import { NextRequest, NextResponse } from 'next/server';
import { getPendingItems, addToQueue, initializeQueueTable } from '../../../lib/db/queue';
import { QueueAddRequest } from '../../../types/queue';
import { logger } from '../../../lib/logger';

// API Key認証
const API_KEY = process.env.SLACK_QUEUE_API_KEY;

function validateApiKey(request: NextRequest): boolean {
  if (!API_KEY) {
    logger.warn('SLACK_QUEUE_API_KEY が設定されていません');
    return false;
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  return authHeader.slice(7) === API_KEY;
}

/**
 * GET /api/slack-queue
 * pending状態のキューアイテムを取得
 */
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // テーブル初期化（存在しない場合のみ）
    await initializeQueueTable();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const items = await getPendingItems(limit);

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    logger.error({ error }, 'キュー取得中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/slack-queue
 * 新しいキューアイテムを追加
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // テーブル初期化（存在しない場合のみ）
    await initializeQueueTable();

    const body = (await request.json()) as QueueAddRequest;

    if (!body.channel_id || !body.user_id || !body.text || !body.message_ts || !body.event_type) {
      return NextResponse.json(
        { success: false, error: 'channel_id, user_id, text, message_ts, event_type は必須です' },
        { status: 400 }
      );
    }

    if (!['new_goal', 'thread_reply'].includes(body.event_type)) {
      return NextResponse.json(
        { success: false, error: 'event_type は new_goal または thread_reply が必須です' },
        { status: 400 }
      );
    }

    const item = await addToQueue(body);

    return NextResponse.json({
      success: true,
      data: [item],
    });
  } catch (error) {
    logger.error({ error }, 'キュー追加中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
