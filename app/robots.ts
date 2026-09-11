import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Required by `output: 'export'`: a metadata route is dynamic unless pinned.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
