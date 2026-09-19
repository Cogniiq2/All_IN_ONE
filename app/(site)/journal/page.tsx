import type { Metadata } from 'next';
import { articles } from '@/lib/articles';
import { SITE_URL, brand } from '@/lib/content/brand';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import { JournalClient } from './journal-client';

export const metadata: Metadata = {
  title: 'Journal — Notizen aus Bayreuth',
  description:
    'Notizen aus Bayreuth — über die Stadt, die Festspiele, Geschäftsreisen und das Wohnen auf Zeit. Geschrieben von der Familie hinter BoLaGio.',
  alternates: { canonical: `${SITE_URL}/journal` },
  openGraph: {
    title: 'Journal — Notizen aus Bayreuth | BoLaGio',
    description:
      'Über die Stadt, die Festspiele und das Wohnen auf Zeit, geschrieben von der Familie hinter BoLaGio.',
    url: `${SITE_URL}/journal`,
  },
};

/**
 * The Journal overview.
 *
 * Described as a `Blog` whose posts are listed in `blogPost`, which is what the
 * page literally is. No rating, no offer and no author persona is asserted —
 * the pieces are written by the business, so the business is the author.
 */
const blogSchema = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': `${SITE_URL}/journal`,
  name: `Journal — ${brand.name}`,
  description:
    'Notizen aus Bayreuth über die Stadt, die Festspiele und das Wohnen auf Zeit.',
  url: `${SITE_URL}/journal`,
  inLanguage: 'de-DE',
  publisher: { '@type': 'Organization', name: brand.name, url: SITE_URL },
  blogPost: articles.map((article) => ({
    '@type': 'BlogPosting',
    headline: article.title.de,
    description: article.excerpt.de,
    url: `${SITE_URL}/journal/${article.slug}`,
    datePublished: article.publishedDate,
    author: { '@type': 'Organization', name: brand.name, url: SITE_URL },
  })),
};

export default function JournalPage() {
  return (
    <>
      <JsonLd data={blogSchema} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Journal', url: `${SITE_URL}/journal` },
        ])}
      />
      <JournalClient />
    </>
  );
}
