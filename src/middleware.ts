// import { createAuthMiddleware } from '@polyrhythm-inc/nextjs-auth-client';
// import { NextRequest, NextResponse } from 'next/server';

// export default createAuthMiddleware({
//   apiUrl: process.env.POLYRHYTHM_API_URL || 'https://api.polyrhythm.co',
//   authUrl: process.env.POLYRHYTHM_AUTH_URL || 'https://auth.polyrhythm.co',
//   debug: process.env.NODE_ENV === 'development',
// });

// export const config = {
//   matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
// };

// Simplified middleware for Heroku deployment
import { NextRequest, NextResponse } from 'next/server';

// Heroku環境で許可するWebhookエンドポイント
const ALLOWED_WEBHOOK_PATHS = [
  '/api/slack/webhook',
  '/api/chatwork/webhook',
];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Heroku環境での制限（DISABLE_FRONTEND=true）
  if (process.env.DISABLE_FRONTEND === 'true') {
    // Webhookエンドポイントは許可
    if (ALLOWED_WEBHOOK_PATHS.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }

    // その他のAPIは拒否
    if (pathname.startsWith('/api/')) {
      return new NextResponse('API is disabled in this environment', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // フロントエンドへのアクセスは403で拒否
    return new NextResponse('Frontend is disabled in this environment', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  return NextResponse.next();
}

export const config = {
  // APIルートも含めてmiddlewareで処理（静的ファイルのみ除外）
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};