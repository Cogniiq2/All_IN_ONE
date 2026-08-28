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
  description:
    'Ausgewählte Objekte von BoLaGio in der Bayreuther Innenstadt zur regulären Vermietung über einen Mietvertrag: Wohnraum und eine Gewerbefläche im Erdgeschoss. Beratung und Besichtigung auf Anfrage.',
  alternates: { canonical: `${SITE_URL}/mieten` },
  openGraph: {
    title: 'Mieten in Bayreuth — Wohnraum und Gewerbeflächen | BoLaGio',
    description:
      'Wohnraum und Gewerbeflächen in der Bayreuther Innenstadt zur Miete über einen regulären Mietvertrag. Persönliche Beratung, Besichtigung auf Anfrage.',
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
