import { MetadataRoute } from 'next';
import { residences } from '@/lib/residences';
import { articles } from '@/lib/articles';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://allinone-residences.de';

  const highPriorityPages = [
    { path: '', priority: 1.0, freq: 'daily' as const },
    { path: '/residences', priority: 0.95, freq: 'weekly' as const },
    { path: '/bayreuth-2026', priority: 0.95, freq: 'weekly' as const },
    { path: '/book-direct', priority: 0.9, freq: 'monthly' as const },
    { path: '/business-stays', priority: 0.9, freq: 'monthly' as const },
    { path: '/long-stay', priority: 0.9, freq: 'monthly' as const },
    { path: '/collections/sternplatz', priority: 0.85, freq: 'monthly' as const },
    { path: '/collections/altstadt', priority: 0.85, freq: 'monthly' as const },
  ];

  const standardPages = [
    '/about',
    '/contact',
    '/reviews',
    '/faq',
    '/journal',
  ];

  const legalPages = [
    '/impressum',
    '/datenschutz',
    '/agb',
  ];

  const residencePages = residences.map((r) => ({
    url: `${baseUrl}/residences/${r.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.92,
  }));

  const journalPages = articles.map((a) => ({
    url: `${baseUrl}/journal/${a.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }));

  return [
    ...highPriorityPages.map(({ path, priority, freq }) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: freq,
      priority,
    })),
    ...standardPages.map((page) => ({
      url: `${baseUrl}${page}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
    ...legalPages.map((page) => ({
      url: `${baseUrl}${page}`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
    ...residencePages,
    ...journalPages,
  ];
}
