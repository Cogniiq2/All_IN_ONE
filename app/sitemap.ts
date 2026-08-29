import { MetadataRoute } from 'next';
import { apartments } from '@/lib/content/apartments';
import { articles } from '@/lib/articles';
import { SITE_URL } from '@/lib/content/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages = [
    { path: '', priority: 1.0, freq: 'weekly' as const },
    { path: '/apartments', priority: 0.95, freq: 'weekly' as const },
    // The long-term rental area. One indexable page: the units it lists have
    // no verified specifications yet, so per-unit rental pages would be thin.
    { path: '/mieten', priority: 0.9, freq: 'monthly' as const },
    { path: '/book-direct', priority: 0.85, freq: 'monthly' as const },
    { path: '/bayreuth-2026', priority: 0.8, freq: 'monthly' as const },
    { path: '/about', priority: 0.7, freq: 'monthly' as const },
    { path: '/contact', priority: 0.7, freq: 'monthly' as const },
    { path: '/faq', priority: 0.6, freq: 'monthly' as const },
    { path: '/journal', priority: 0.6, freq: 'monthly' as const },
  ];

  return [
    ...pages.map(({ path, priority, freq }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: freq,
      priority,
    })),
    // Units still in renovation are excluded: there is nothing to book yet.
    ...apartments
      .filter((apartment) => apartment.status === 'available')
      .map((apartment) => ({
        url: `${SITE_URL}/apartments/${apartment.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      })),
    ...articles.map((article) => ({
      url: `${SITE_URL}/journal/${article.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];
}
