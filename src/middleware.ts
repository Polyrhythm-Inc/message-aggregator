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

export function middleware(request: NextRequest) {
  // Allow all requests for now
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};