import type { Metadata } from 'next';
import { JsonLd, getCollectionSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import SternplatzClient from './sternplatz-client';

export const metadata: Metadata = {
  title: 'Sternplatz Collection — Drei Premium Apartments am Sternplatz Bayreuth | All in One Residences',
  description:
    'Die Sternplatz Collection vereint drei Luxus-Serviced Apartments direkt am Sternplatz in Bayreuth. Maison Sternplatz, Loge am Sternplatz & Atelier Opernstraße — ab €109/Nacht. Garagenparkplatz inklusive.',
  keywords: [
    'Sternplatz Bayreuth Apartment',
    'Ferienwohnung Sternplatz Bayreuth',
    'Serviced Apartment Bayreuth Sternplatz',
    'Maison Sternplatz Bayreuth mieten',
    'Loge am Sternplatz Bayreuth',
    'Atelier Opernstraße Bayreuth',
    'Apartment Bayreuth Sternplatz direkt',
    'Luxus Ferienwohnung Bayreuth Zentrum',
    'Bayreuth Sternplatz Unterkunft mieten',
    'Premium Apartment Bayreuth Sternplatz',
  ],
  openGraph: {
    title: 'Sternplatz Collection | All in One Residences — Bayreuth',
    description:
      'Drei exklusive Apartments direkt am Sternplatz in Bayreuth: Maison Sternplatz, Loge am Sternplatz & Atelier Opernstraße. Ab €109/Nacht, Garage inklusive.',
    url: 'https://allinone-residences.de/collections/sternplatz',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Sternplatz Collection — Premium Apartments am Sternplatz Bayreuth',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/collections/sternplatz' },
};

export default function SternplatzCollectionPage() {
  const collectionSchema = getCollectionSchema({
    name: 'Sternplatz Collection — All in One Residences Bayreuth',
    description:
      'Drei exklusive Serviced Apartments direkt am Sternplatz in Bayreuth: Maison Sternplatz, Loge am Sternplatz und Atelier Opernstraße.',
    url: 'https://allinone-residences.de/collections/sternplatz',
    residences: [
      {
        name: 'Maison Sternplatz',
        url: 'https://allinone-residences.de/residences/maison-sternplatz',
        price: 129,
      },
      {
        name: 'Loge am Sternplatz',
        url: 'https://allinone-residences.de/residences/loge-am-sternplatz',
        price: 119,
      },
      {
        name: 'Atelier Opernstraße',
        url: 'https://allinone-residences.de/residences/atelier-opernstrasse',
        price: 109,
      },
    ],
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Ferienwohnungen', url: 'https://allinone-residences.de/residences' },
    { name: 'Sternplatz Collection', url: 'https://allinone-residences.de/collections/sternplatz' },
  ]);

  return (
    <>
      <JsonLd data={collectionSchema} />
      <JsonLd data={breadcrumbSchema} />
      <SternplatzClient />
    </>
  );
}
