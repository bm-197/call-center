import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // cacheComponents disabled: most dashboard pages are per-user dynamic data,
  // so PPR adds Suspense boilerplate without benefit. Re-enable for specific
  // public/marketing routes when added, using `'use cache'` directives.
  cacheComponents: false,
  reactCompiler: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@call-center/shared'],
};

export default nextConfig;
