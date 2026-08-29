import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import { faqsByCategory } from '@/lib/faq';
import { JsonLd, getBreadcrumbSchema, getFaqSchema } from '@/components/shared/json-ld';
import BayreuthClient from './bayreuth-2026-client';

/**
 * The Bayreuth location page.
 *
 * The route keeps its historic `/bayreuth-2026` path: it is indexed, linked
 * from the navigation and the footer, and renaming it would cost the accrued
 * value for a cosmetic gain. The metadata below is evergreen, so nothing on
 * the page ties itself to a single festival year.
 */
export const metadata: Metadata = {
  title: 'Bayreuth & die Festspiele — zentral übernachten',
  description:
    'Warum sich eine zentrale Unterkunft in Bayreuth lohnt: Innenstadt, Festspielhaus und Universität liegen weit auseinander. Familiengeführte Apartments in der Innenstadt, direkt anzufragen.',
  alternates: { canonical: `${SITE_URL}/bayreuth-2026` },
  openGraph: {
    title: 'Bayreuth & die Festspiele — zentral übernachten | BoLaGio',
    description:
      'Orientierung in einer Festspielstadt und familiengeführte Apartments in der Bayreuther Innenstadt.',
    url: `${SITE_URL}/bayreuth-2026`,
  },
};

export default function BayreuthPage() {
  // Only the questions this page actually renders are described as an FAQPage.
  const faqItems = faqsByCategory('bayreuth').map((f) => ({
    question: f.question.de,
    answer: f.answer.de,
  }));

  return (
    <>
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Bayreuth', url: `${SITE_URL}/bayreuth-2026` },
        ])}
      />
      {faqItems.length > 0 && <JsonLd data={getFaqSchema(faqItems)} />}
      <BayreuthClient />
    </>
  );
}
