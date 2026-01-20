import { NextRequest, NextResponse } from 'next/server';
import { addContactToProject, AiOrgProjectsApiError } from '@/lib/ai-org-projects-client';
import { logger } from '@/lib/logger';

/**
 * POST /api/external-projects/[id]/contacts - プロジェクトに担当者を追加
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();

    const { name, email, slackId, role } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: '担当者名は必須です' },
        { status: 400 }
      );
    }

    const contact = await addContactToProject(projectId, {
      name: name.trim(),
      email: email?.trim() || undefined,
      slackId: slackId?.trim() || undefined,
      role: role || 'client',
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error instanceof AiOrgProjectsApiError) {
      logger.error(
        { statusCode: error.statusCode, message: error.message },
        'ai-org-projects API error'
      );

      if (error.statusCode === 0) {
        return NextResponse.json(
          { error: 'ai-org-projects サービスに接続できません' },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logger.error({ error }, '担当者の追加に失敗しました');
    return NextResponse.json(
      { error: '担当者の追加に失敗しました' },
      { status: 500 }
    );
  }
}
