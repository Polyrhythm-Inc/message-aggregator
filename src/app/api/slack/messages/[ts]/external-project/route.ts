import { NextRequest, NextResponse } from 'next/server';
import { assignExternalProjectToMessage, getMessageExternalProjectAssignment } from '@/lib/db/projects';
import { logger } from '@/lib/logger';

type RouteContext = {
  params: Promise<{ ts: string }>;
};

/**
 * 外部プロジェクト割り当てリクエスト
 */
type AssignExternalProjectRequest = {
  external_project_id: string | null;
};

/**
 * GET /api/slack/messages/[ts]/external-project - メッセージの外部プロジェクト割り当て情報を取得
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { ts } = await context.params;

    const externalProjectId = await getMessageExternalProjectAssignment(ts);

    return NextResponse.json({
      message_ts: ts,
      external_project_id: externalProjectId,
    });
  } catch (error) {
    logger.error({ error }, '外部プロジェクト割り当て情報の取得に失敗しました');
    return NextResponse.json(
      { error: '外部プロジェクト割り当て情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/slack/messages/[ts]/external-project - メッセージに外部プロジェクトを割り当て
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { ts } = await context.params;
    const body: AssignExternalProjectRequest = await request.json();

    // external_project_id は null も許容（割り当て解除）
    const externalProjectId = body.external_project_id;

    // UUIDのバリデーション（nullでない場合）
    if (externalProjectId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalProjectId)) {
      return NextResponse.json(
        { error: '無効なプロジェクトIDです' },
        { status: 400 }
      );
    }

    const updated = await assignExternalProjectToMessage(ts, externalProjectId);

    if (!updated) {
      logger.warn({ ts, externalProjectId }, 'メッセージが見つからないか、更新されませんでした');
    }

    return NextResponse.json({
      success: true,
      message_ts: ts,
      external_project_id: externalProjectId,
    });
  } catch (error) {
    logger.error({ error }, '外部プロジェクト割り当てに失敗しました');
    return NextResponse.json(
      { error: '外部プロジェクト割り当てに失敗しました' },
      { status: 500 }
    );
  }
}
