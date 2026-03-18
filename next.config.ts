import type { NextConfig } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const appHost = (() => { try { return new URL(appUrl).host } catch { return 'localhost:3000' } })()

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [appHost, 'localhost:3000', 'localhost:3002'].filter((v, i, a) => a.indexOf(v) === i),
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        // Required for WebContainers (cross-origin-isolated)
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/agent/:path*',
        destination: `${process.env.AGENT_SERVICE_URL || 'http://localhost:8000'}/:path*`,
      },
    ]
  },
};

export default nextConfig;
