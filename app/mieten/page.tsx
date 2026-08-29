import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import { MietenClient } from './mieten-client';

/**
 * Route naming.
 *
 * The German market is the primary one and this section has to be unambiguous
 * in German: `/mieten` reads as a conventional tenancy and nothing else.
 * "Long stay" was rejected deliberately — it reads as extended *hotel*
 * accommodation, which is the opposite of what this page offers, and the
 * existing /long-stay redirect (to the business-travel article) is left alone
 * for exactly that reason: those visitors want accommodation, not a tenancy.
 *
 * No offer, price or availability markup is emitted. Nothing here has a
 * verified rent, and structured data claiming otherwise would be a fabricated
 * fact in machine-readable form.
 */
export const metadata: Metadata = {
  title: 'Mieten in Bayreuth — Wohnraum und Gewerbeflächen',
  // States what is actually on the market (the commercial unit) and what is
  // not (the flats, which are accommodation). No availability, rent or contract
  // is promised — those are not verified and are not the site's to promise.
  description:
    'Gewerbefläche im Erdgeschoss in der Bayreuther Innenstadt zur Miete über einen Gewerbemietvertrag. Wohnraum vermieten wir im Einzelfall auf Anfrage — unsere Apartments sind Unterkünfte auf Zeit. Beratung und Besichtigung auf Anfrage.',
  alternates: { canonical: `${SITE_URL}/mieten` },
  openGraph: {
    title: 'Mieten in Bayreuth — Wohnraum und Gewerbeflächen | BoLaGio',
    description:
      'Gewerbefläche zur Miete in der Bayreuther Innenstadt, Wohnraum im Einzelfall auf Anfrage. Persönliche Beratung, Besichtigung auf Anfrage.',
    url: `${SITE_URL}/mieten`,
  },
};

export default function MietenPage() {
  return (
    <>
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Mieten', url: `${SITE_URL}/mieten` },
        ])}
      />
      <MietenClient />
    </>
  );
}
