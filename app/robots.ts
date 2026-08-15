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
        //
        // /coming-soon/ is deliberately NOT listed any more: those routes were
        // withdrawn and now return 404. Disallowing them would stop crawlers
        // from ever seeing that 404 and dropping them from the index.
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
