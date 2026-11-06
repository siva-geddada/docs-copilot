import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite loads WebAssembly and data files at runtime, so it must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
};

export default nextConfig;
