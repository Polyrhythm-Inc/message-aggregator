import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Slackの添付ファイルをプロキシして取得するAPI
 * Slackのurl_privateはBot Tokenで認証が必要なため、このAPIを経由して取得する
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');

    if (!fileUrl) {
      return NextResponse.json(
        { error: 'urlパラメータが必要です' },
        { status: 400 }
      );
    }

    // Slackのurl_privateかどうかを検証
    if (!fileUrl.startsWith('https://files.slack.com/')) {
      return NextResponse.json(
        { error: '無効なファイルURLです' },
        { status: 400 }
      );
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: 'SLACK_BOT_TOKENが設定されていません' },
        { status: 500 }
      );
    }

    // Slackからファイルを取得
    const response = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    });

    if (!response.ok) {
      logger.error({
        status: response.status,
        statusText: response.statusText,
        fileUrl,
      }, 'Slackファイル取得に失敗しました');
      return NextResponse.json(
        { error: 'ファイルの取得に失敗しました' },
        { status: response.status }
      );
    }

    // ファイルの内容とContent-Typeを取得
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    // ファイルをそのまま返す
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    logger.error({
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Slackファイル取得中にエラーが発生しました');
    return NextResponse.json(
      { error: 'ファイルの取得に失敗しました' },
      { status: 500 }
    );
  }
}
