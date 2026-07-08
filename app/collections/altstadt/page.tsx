import type { Metadata } from 'next';
import { JsonLd, getCollectionSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import AltstadtClient from './altstadt-client';

export const metadata: Metadata = {
  title: 'Innenstadt Collection — Premium Apartments in der Bayreuther Altstadt | All in One Residences',
  description:
    'Die Innenstadt Collection bietet zwei exklusive Premium-Apartments im historischen Zentrum Bayreuths. Penthouse Belvédère mit Panoramablick & Balkon sowie das Design Loft Innenstadt — ab €119/Nacht. Garagenparkplatz inklusive.',
  keywords: [
    'Innenstadt Bayreuth Apartment',
    'Ferienwohnung Bayreuther Altstadt',
    'Penthouse Bayreuth mieten',
    'Design Loft Bayreuth',
    'Apartment Bayreuth Zentrum mieten',
    'Ferienwohnung Bayreuth Innenstadt historisch',
    'Penthouse Bayreuth Panoramablick',
    'Luxury Apartment Bayreuth Altstadt',
    'Bayreuth Innenstadt Wohnung kurzzeitmiete',
    'Premium Unterkunft Bayreuth Altstadt',
  ],
  openGraph: {
    title: 'Innenstadt Collection | All in One Residences — Bayreuth',
    description:
      'Zwei exklusive Apartments in der Bayreuther Innenstadt. Penthouse Belvédère mit Panoramablick & privatem Balkon und Design Loft — ab €119/Nacht.',
    url: 'https://allinone-residences.de/collections/altstadt',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Innenstadt Collection — Premium Apartments Bayreuth Altstadt',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/collections/altstadt' },
};

export default function AltstadtCollectionPage() {
  const collectionSchema = getCollectionSchema({
    name: 'Innenstadt Collection — All in One Residences Bayreuth',
    description:
      'Zwei exklusive Premium-Apartments in der historischen Innenstadt Bayreuths: Penthouse Belvédère und Design Loft Innenstadt.',
    url: 'https://allinone-residences.de/collections/altstadt',
    residences: [
      {
        name: 'Penthouse Belvédère',
        url: 'https://allinone-residences.de/residences/belvedere-penthouse',
        price: 139,
      },
      {
        name: 'Design Loft Innenstadt',
        url: 'https://allinone-residences.de/residences/designloft-innenstadt',
        price: 119,
      },
    ],
  });

  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Ferienwohnungen', url: 'https://allinone-residences.de/residences' },
    { name: 'Innenstadt Collection', url: 'https://allinone-residences.de/collections/altstadt' },
  ]);

  return (
    <>
      <JsonLd data={collectionSchema} />
      <JsonLd data={breadcrumbSchema} />
      <AltstadtClient />
    </>
  );
}
