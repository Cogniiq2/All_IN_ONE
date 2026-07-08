import type { Metadata } from 'next';
import { JsonLd, getEventSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import Bayreuth2026Client from './bayreuth-2026-client';

export const metadata: Metadata = {
  title: 'Bayreuther Festspiele 2026 — Unterkunft & Ferienwohnung mieten | All in One Residences',
  description:
    'Ferienwohnung für die Bayreuther Festspiele 2026 mieten — zentrale Apartments am Sternplatz, Garagenparkplatz inklusive, Self Check-in. 25. Juli bis 28. August 2026. Jetzt frühzeitig sichern.',
  keywords: [
    'Bayreuther Festspiele 2026 Unterkunft',
    'Ferienwohnung Bayreuth Festspiele 2026',
    'Unterkunft Bayreuth Wagner Festspiele',
    'Bayreuth Festspiele Apartment mieten',
    'Bayreuth 2026 Wohnung buchen',
    'Bayreuth Festspiele Juli August 2026',
    'Wagner Festspiele Bayreuth Unterkunft zentral',
    'Festspielhaus Bayreuth Unterkunft',
    'Übernachten Bayreuth Festspiele 2026',
    'Bayreuth Festspiele Sternplatz Apartment',
    'Wohnung Bayreuth Festspielzeit mieten',
    'Bayreuth Festspielgäste Unterkunft zentral',
  ],
  openGraph: {
    title: 'Bayreuther Festspiele 2026 — Ferienwohnung mieten | All in One Residences',
    description:
      'Zentrale Ferienwohnungen für die Bayreuther Festspiele 2026. Garagenparkplatz, Self Check-in, persönlicher Service. 25. Juli – 28. August 2026.',
    url: 'https://allinone-residences.de/bayreuth-2026',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1763067/pexels-photo-1763067.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Unterkunft Bayreuther Festspiele 2026',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/bayreuth-2026' },
};

export default function Bayreuth2026Page() {
  const eventSchema = getEventSchema();
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Bayreuther Festspiele 2026', url: 'https://allinone-residences.de/bayreuth-2026' },
  ]);

  return (
    <>
      <JsonLd data={eventSchema} />
      <JsonLd data={breadcrumbSchema} />
      <Bayreuth2026Client />
    </>
  );
}
