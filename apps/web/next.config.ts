import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@fernleaf/contracts'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl.replace(/\/$/, '')}/api/v1/:path*` }];
  },
};

export default nextConfig;
