import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /admin is the separate internal application. It should not be
        // crawled — and, separately from this frontend pass, it should not be
        // publicly reachable at all.
        disallow: ['/coming-soon/', '/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
