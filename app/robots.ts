import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing is disallowed here any more, deliberately.
        //
        // /admin and /coming-soon/ were both listed previously. Both are now
        // removed from the application and return 404, and a Disallow rule
        // would stop crawlers from ever seeing that 404 and dropping the URLs
        // from the index. Listing /admin also advertised the path.
        //
        // robots.txt is not access control. The admin surface is gone from
        // this application; the database permissions are the real control and
        // are handled in supabase/migrations/.
        disallow: [],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
