import type { Metadata } from 'next';
import { JsonLd, getArticleSchema } from '@/components/shared/json-ld';
import ArticleClient from './business-client';

export const metadata: Metadata = {
  title: 'Business Apartment Bayreuth mieten: Was das Hotelzimmer nicht kann — Bayreuth Journal',
  description:
    'Serviced Apartment für Geschäftsreise in Bayreuth mieten: Glasfaser-WLAN, Vollküche, Garagenparkplatz. Warum immer mehr Ingenieure und Consultants auf Apartments umsteigen.',
  keywords: [
    'Serviced Apartment Bayreuth Geschäftsreise',
    'Business Apartment Bayreuth mieten',
    'Bayreuth Geschäftsreise Unterkunft',
    'Firmenwohnung Bayreuth',
    'Bayreuth Dienstreise Apartment',
    'Bayreuth Unterkunft Geschäftsreisende besser als Hotel',
    'Serviced Apartment Bayreuth Glasfaser WLAN',
    'Businesswohnung Bayreuth Innenstadt',
  ],
  openGraph: {
    title: 'Business Apartment Bayreuth mieten: Was das Hotelzimmer nicht kann — Bayreuth Journal',
    description: 'Serviced Apartment für Geschäftsreise in Bayreuth mieten: Glasfaser-WLAN, Vollküche, Garagenparkplatz. Warum immer mehr Ingenieure und Consultants auf Apartments umsteigen.',
    url: 'https://allinone-residences.de/journal/serviced-apartments-bayreuth-geschaftsreisen',
    type: 'article',
    images: [
      {
        url: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Business Apartment Bayreuth mieten: Was das Hotelzimmer nicht kann — Bayreuth Journal',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal/serviced-apartments-bayreuth-geschaftsreisen' },
};

export default function ArticlePage() {
  const articleSchema = getArticleSchema({
    title: 'Business Apartment Bayreuth mieten: Was das Hotelzimmer nicht kann — Bayreuth Journal',
    description: 'Serviced Apartment für Geschäftsreise in Bayreuth mieten: Glasfaser-WLAN, Vollküche, Garagenparkplatz. Warum immer mehr Ingenieure und Consultants auf Apartments umsteigen.',
    url: 'https://allinone-residences.de/journal/serviced-apartments-bayreuth-geschaftsreisen',
    image: 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1260',
    datePublished: '2025-03-22',
  });

  return (
    <>
      <JsonLd data={articleSchema} />
      <ArticleClient />
    </>
  );
}
