import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const backendChatUrl = process.env.BACKEND_CHAT_URL;

    if (!backendChatUrl) {
      return [];
    }

    return [
      {
        source: '/api/chat',
        destination: backendChatUrl,
      },
    ];
  },
};

export default nextConfig;
