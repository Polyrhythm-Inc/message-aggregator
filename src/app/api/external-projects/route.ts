import { NextRequest, NextResponse } from 'next/server';
import { fetchExternalProjects, AiOrgProjectsApiError } from '@/lib/ai-org-projects-client';
import { logger } from '@/lib/logger';

/**
 * GET /api/external-projects - 外部プロジェクト一覧を取得（ai-org-projectsからプロキシ）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const search = searchParams.get('search');

    const result = await fetchExternalProjects({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      search: search || undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiOrgProjectsApiError) {
      logger.error(
        { statusCode: error.statusCode, message: error.message },
        'ai-org-projects API error'
      );

      // 接続できない場合は空の結果を返す
      if (error.statusCode === 0) {
        return NextResponse.json({
          projects: [],
          total: 0,
          error: 'ai-org-projects サービスに接続できません',
        });
      }

      return NextResponse.json(
        { error: error.message, projects: [], total: 0 },
        { status: error.statusCode }
      );
    }

    logger.error({ error }, '外部プロジェクト一覧の取得に失敗しました');
    return NextResponse.json(
      { error: '外部プロジェクト一覧の取得に失敗しました', projects: [], total: 0 },
      { status: 500 }
    );
  }
}
