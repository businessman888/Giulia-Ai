import type { NextConfig } from 'next';

const nextConfig: NextConfig = { outputFileTracingRoot: process.cwd(), serverExternalPackages: ['ffprobe-static', 'sharp'] };
export default nextConfig;
