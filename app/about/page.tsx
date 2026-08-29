import type { Metadata } from 'next';
import { SITE_URL, brand } from '@/lib/content/brand';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import AboutClient from './about-client';

export const metadata: Metadata = {
  title: 'Über uns — die Familie hinter BoLaGio',
  description:
    'BoLaGio ist ein Familienunternehmen in Bayreuth. Wir vermieten unsere eigenen Apartments in der Innenstadt und kümmern uns persönlich darum — ohne Verwaltung dazwischen.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: 'Über uns — die Familie hinter BoLaGio',
    description:
      'Ein Familienunternehmen in Bayreuth, das seine eigenen Apartments vermietet und persönlich betreut.',
    url: `${SITE_URL}/about`,
  },
};

/**
 * AboutPage schema.
 *
 * Points at the same business entity the root layout already declares, so the
 * two describe one organisation rather than two. No founder, employee, award or
 * founding date is asserted — none of those is confirmed (see the
 * NEEDS CONFIRMATION slots in about-client.tsx).
 */
const aboutSchema = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': `${SITE_URL}/about`,
  url: `${SITE_URL}/about`,
  inLanguage: 'de-DE',
  mainEntity: {
    '@type': 'LodgingBusiness',
    name: brand.name,
    url: SITE_URL,
    description:
      'Familiengeführte Apartments in der Bayreuther Innenstadt, in Familienbesitz und persönlich betreut.',
    areaServed: { '@type': 'City', name: brand.city },
  },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={aboutSchema} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Über uns', url: `${SITE_URL}/about` },
        ])}
      />
      <AboutClient />
    </>
  );
}
