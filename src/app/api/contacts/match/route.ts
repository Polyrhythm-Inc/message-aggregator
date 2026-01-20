import { NextRequest, NextResponse } from 'next/server';
import { matchContactToProject } from '@/lib/ai-org-projects-client';
import { logger } from '@/lib/logger';

/**
 * POST /api/contacts/match
 * 送信者情報から担当者をマッチングしてプロジェクトを取得
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, slackId, name } = body;

    if (!email && !slackId && !name) {
      return NextResponse.json(
        { error: 'At least one of email, slackId, or name is required' },
        { status: 400 }
      );
    }

    const result = await matchContactToProject({ email, slackId, name });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const err = error as Error;
    logger.error({ error: err.message }, 'Failed to match contact to project');
    return NextResponse.json(
      { error: 'Failed to match contact to project', details: err.message },
      { status: 500 }
    );
  }
}
