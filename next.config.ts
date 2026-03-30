// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ✅ Bukan lagi di dalam "experimental"
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;