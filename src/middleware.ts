import { createAuthMiddleware } from '@polyrhythm-inc/nextjs-auth-client';

const authMiddleware = createAuthMiddleware({
  protectedPaths: [
    '/dashboard/:path*'
  ],
  excludePaths: []
});

export default authMiddleware;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};