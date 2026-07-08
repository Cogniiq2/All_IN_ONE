import type { Metadata } from 'next';
import { JsonLd, getArticleSchema } from '@/components/shared/json-ld';
import ArticleClient from './wo-in-bayreuth-client';

export const metadata: Metadata = {
  title: 'Wo in Bayreuth übernachten: Ein ehrlicher Guide — Bayreuth Journal',
  description:
    'Ferienwohnung in Bayreuth mieten — was wirklich zählt: Lage, Parkplatz, Serviced Apartment vs. Hotel. Ein ehrlicher Vergleich für anspruchsvolle Reisende.',
  keywords: [
    'Wo in Bayreuth übernachten',
    'Ferienwohnung Bayreuth mieten Guide',
    'Bayreuth Unterkunft Tipps',
    'Serviced Apartment vs Hotel Bayreuth',
    'Bayreuth beste Unterkunft Innenstadt',
    'Bayreuth Übernachtung Empfehlung',
    'Bayreuth Hotel Alternative Apartment',
    'Übernachten Bayreuth Innenstadt günstig',
  ],
  openGraph: {
    title: 'Wo in Bayreuth übernachten: Ein ehrlicher Guide — Bayreuth Journal',
    description: 'Ferienwohnung in Bayreuth mieten — was wirklich zählt: Lage, Parkplatz, Serviced Apartment vs. Hotel. Ein ehrlicher Vergleich für anspruchsvolle Reisende.',
    url: 'https://allinone-residences.de/journal/wo-in-bayreuth-ubernachten',
    type: 'article',
    images: [
      {
        url: 'https://images.pexels.com/photos/2029722/pexels-photo-2029722.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Wo in Bayreuth übernachten: Ein ehrlicher Guide — Bayreuth Journal',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal/wo-in-bayreuth-ubernachten' },
};

export default function ArticlePage() {
  const articleSchema = getArticleSchema({
    title: 'Wo in Bayreuth übernachten: Ein ehrlicher Guide — Bayreuth Journal',
    description: 'Ferienwohnung in Bayreuth mieten — was wirklich zählt: Lage, Parkplatz, Serviced Apartment vs. Hotel. Ein ehrlicher Vergleich für anspruchsvolle Reisende.',
    url: 'https://allinone-residences.de/journal/wo-in-bayreuth-ubernachten',
    image: 'https://images.pexels.com/photos/2029722/pexels-photo-2029722.jpeg?auto=compress&cs=tinysrgb&w=1260',
    datePublished: '2025-03-18',
  });

  return (
    <>
      <JsonLd data={articleSchema} />
      <ArticleClient />
    </>
  );
}
