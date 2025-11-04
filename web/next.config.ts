import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,

  // API 프록시 설정 (백엔드 API 연동)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.BACKEND_URL || 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
