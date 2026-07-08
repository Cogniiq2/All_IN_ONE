import type { Metadata } from 'next';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import LongStayClient from './long-stay-client';

export const metadata: Metadata = {
  title: 'Wohnung auf Zeit Bayreuth mieten — Langzeitaufenthalt ab 7 Nächten | All in One Residences',
  description:
    'Wohnung auf Zeit in Bayreuth mieten: vollmöblierte Apartments ab 7 Nächten, Vollküche, Waschmaschine, Garagenparkplatz, persönlicher Support. Ideal für Relocation, Projektarbeit & Monteure.',
  keywords: [
    'Wohnung auf Zeit Bayreuth mieten',
    'Langzeitmiete Apartment Bayreuth',
    'Möblierte Wohnung Bayreuth mieten',
    'Monteurwohnung Bayreuth Innenstadt',
    'Bayreuth Kurzzeitmiete Wohnung',
    'Relocation Bayreuth Wohnung',
    'Wohnen auf Zeit Bayreuth',
    'Temporäre Unterkunft Bayreuth',
    'Bayreuth Wohnung 1 Monat mieten',
    'Zwischenwohnen Bayreuth',
  ],
  openGraph: {
    title: 'Wohnung auf Zeit Bayreuth mieten — Langzeitaufenthalt | All in One Residences',
    description:
      'Vollmöblierte Apartments auf Zeit in Bayreuth — ab 7 Nächten, zentrale Lage, Vollküche, Garagenparkplatz. Für Monteure, Projektleiter und Umzüge.',
    url: 'https://allinone-residences.de/long-stay',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Wohnung auf Zeit Bayreuth — All in One Residences',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/long-stay' },
};

export default function LongStayPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Langzeitaufenthalt', url: 'https://allinone-residences.de/long-stay' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <LongStayClient />
    </>
  );
}
