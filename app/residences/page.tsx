import type { Metadata } from 'next';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import ResidencesClient from './residences-client';

export const metadata: Metadata = {
  title: 'Ferienwohnungen & Serviced Apartments in Bayreuth mieten — Alle Residenzen',
  description:
    'Ferienwohnung Bayreuth mieten: 5 exklusive Apartments am Sternplatz & in der Altstadt. Maison Sternplatz, Loge, Atelier Opernstraße, Penthouse Belvédère, Design Loft. Ab €109/Nacht, Garage inklusive.',
  keywords: [
    'Ferienwohnung Bayreuth mieten',
    'Serviced Apartment Bayreuth Innenstadt',
    'Apartment Bayreuth Sternplatz mieten',
    'Bayreuth Unterkunft Innenstadt',
    'Ferienwohnungen Bayreuth Zentrum',
    'Bayreuth Kurzzeitmiete Wohnung',
    'Penthouse Bayreuth mieten',
    'Apartment Bayreuth Altstadt',
    'Premium Unterkunft Bayreuth',
    'Bayreuth Wohnung auf Zeit',
  ],
  openGraph: {
    title: 'Ferienwohnungen Bayreuth mieten — 5 Apartments | All in One Residences',
    description:
      '5 Serviced Apartments in Bayreuth — Sternplatz & Altstadt. Garagenparkplatz, Self Check-in, ab €109/Nacht.',
    url: 'https://allinone-residences.de/residences',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Ferienwohnungen in Bayreuth — All in One Residences',
      },
    ],
  },
  alternates: {
    canonical: 'https://allinone-residences.de/residences',
  },
};

export default function ResidencesPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Ferienwohnungen Bayreuth', url: 'https://allinone-residences.de/residences' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <ResidencesClient />
    </>
  );
}
