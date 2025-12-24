import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番と開発でビルドディレクトリを分離
  // これにより npm run dev が本番ビルドを上書きしない
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next",
};

export default nextConfig;
