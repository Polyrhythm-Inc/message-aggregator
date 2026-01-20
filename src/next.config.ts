import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番と開発でビルドディレクトリを分離
  // これにより npm run dev が本番ビルドを上書きしない
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next",

  // ai-org-core APIへのプロキシ（Mixed Content / CORS回避）
  async rewrites() {
    const aiOrgApiUrl = process.env.AI_ORG_API_URL || "http://localhost:5201";
    return [
      {
        source: "/api/ai-org/:path*",
        destination: `${aiOrgApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
