import type { Metadata } from 'next';
import { JsonLd, getArticleSchema } from '@/components/shared/json-ld';
import ArticleClient from './festspiele-client';

export const metadata: Metadata = {
  title: 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss — Bayreuth Journal',
  description:
    'Ferienwohnung für die Bayreuther Festspiele 2026 finden: Warum Nähe, Parkplatz und Komfort nach sechs Stunden Wagner entscheidend sind. Ein Guide von All in One Residences.',
  keywords: [
    'Bayreuth Festspiele 2026 Unterkunft',
    'Ferienwohnung Festspiele Bayreuth',
    'Unterkunft Bayreuth Festspiele Juli 2026',
    'Bayreuth Festspiele Apartment zentral',
    'Wagner Festspiele übernachten Bayreuth',
    'Festspiele Bayreuth Wohnung mieten',
    'Bayreuth Festspiele Sternplatz Unterkunft',
    'Ferienwohnung Festspielhaus Bayreuth Nähe',
  ],
  openGraph: {
    title: 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss — Bayreuth Journal',
    description: 'Ferienwohnung für die Bayreuther Festspiele 2026 finden: Warum Nähe, Parkplatz und Komfort nach sechs Stunden Wagner entscheidend sind. Ein Guide von All in One Residences.',
    url: 'https://allinone-residences.de/journal/bayreuth-festspiele-unterkunft-guide',
    type: 'article',
    images: [
      {
        url: 'https://images.pexels.com/photos/1763067/pexels-photo-1763067.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss — Bayreuth Journal',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal/bayreuth-festspiele-unterkunft-guide' },
};

export default function ArticlePage() {
  const articleSchema = getArticleSchema({
    title: 'Festspiele 2026: Warum Unterkunft dieses Jahr anders denken muss — Bayreuth Journal',
    description: 'Ferienwohnung für die Bayreuther Festspiele 2026 finden: Warum Nähe, Parkplatz und Komfort nach sechs Stunden Wagner entscheidend sind. Ein Guide von All in One Residences.',
    url: 'https://allinone-residences.de/journal/bayreuth-festspiele-unterkunft-guide',
    image: 'https://images.pexels.com/photos/1763067/pexels-photo-1763067.jpeg?auto=compress&cs=tinysrgb&w=1260',
    datePublished: '2025-01-12',
  });

  return (
    <>
      <JsonLd data={articleSchema} />
      <ArticleClient />
    </>
  );
}
