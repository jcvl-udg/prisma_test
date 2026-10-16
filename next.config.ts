import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['next-auth'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
  },
};

export default nextConfig;
