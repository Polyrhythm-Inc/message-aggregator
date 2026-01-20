import { NextRequest, NextResponse } from 'next/server';
import { getQueueItemById, updateQueueItem, deleteQueueItem } from '../../../../lib/db/queue';
import { QueueUpdateRequest } from '../../../../types/queue';
import { logger } from '../../../../lib/logger';

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

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/slack-queue/[id]
 * 指定IDのキューアイテムを取得
 */
export async function GET(request: NextRequest, context: RouteContext) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const item = await getQueueItemById(id);

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Queue item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: [item],
    });
  } catch (error) {
    logger.error({ error }, 'キューアイテム取得中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/slack-queue/[id]
 * キューアイテムのステータスを更新
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as QueueUpdateRequest;

    if (!body.status || !['processing', 'completed', 'failed'].includes(body.status)) {
      return NextResponse.json(
        { success: false, error: 'status は processing, completed, failed のいずれかが必須です' },
        { status: 400 }
      );
    }

    const item = await updateQueueItem(id, body);

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Queue item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: [item],
    });
  } catch (error) {
    logger.error({ error }, 'キューアイテム更新中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/slack-queue/[id]
 * キューアイテムを削除
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const deleted = await deleteQueueItem(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Queue item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error({ error }, 'キューアイテム削除中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
