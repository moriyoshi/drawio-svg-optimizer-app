import type { NextConfig } from 'next';

// Fully client-side tool: the optimizer runs in the visitor's browser and no SVG
// is ever uploaded, so there is nothing for a server to do. A static export is
// therefore the whole deployment — `next build` emits `out/`, which wrangler.jsonc
// serves as the asset directory of a Cloudflare Worker (not Pages; see
// .github/workflows/deploy.yml for why).
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
