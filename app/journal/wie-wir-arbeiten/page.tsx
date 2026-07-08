import type { Metadata } from 'next';
import { JsonLd, getArticleSchema } from '@/components/shared/json-ld';
import ArticleClient from './wie-wir-arbeiten-client';

export const metadata: Metadata = {
  title: 'Hinter den Kulissen: Wie wir All in One Residences betreiben — Bayreuth Journal',
  description:
    'Fünf Ferienwohnungen in Bayreuth, kein Callcenter. Wie persönlicher Service im Jahr 2025 wirklich aussieht — ein Blick hinter die Kulissen von All in One Residences.',
  keywords: [
    'All in One Residences Bayreuth',
    'Ferienwohnung Bayreuth persönlicher Service',
    'Serviced Apartment Bayreuth Betreiber',
    'Bayreuth Unterkunft direkt buchen',
    'Ferienwohnung Bayreuth familiengeführt',
    'Bayreuth Apartment Vermieter persönlich',
    'All in One Residences Betrieb',
    'Bayreuth Serviced Apartment kein Callcenter',
  ],
  openGraph: {
    title: 'Hinter den Kulissen: Wie wir All in One Residences betreiben — Bayreuth Journal',
    description: 'Fünf Ferienwohnungen in Bayreuth, kein Callcenter. Wie persönlicher Service im Jahr 2025 wirklich aussieht — ein Blick hinter die Kulissen von All in One Residences.',
    url: 'https://allinone-residences.de/journal/wie-wir-arbeiten',
    type: 'article',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Hinter den Kulissen: Wie wir All in One Residences betreiben — Bayreuth Journal',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal/wie-wir-arbeiten' },
};

export default function ArticlePage() {
  const articleSchema = getArticleSchema({
    title: 'Hinter den Kulissen: Wie wir All in One Residences betreiben — Bayreuth Journal',
    description: 'Fünf Ferienwohnungen in Bayreuth, kein Callcenter. Wie persönlicher Service im Jahr 2025 wirklich aussieht — ein Blick hinter die Kulissen von All in One Residences.',
    url: 'https://allinone-residences.de/journal/wie-wir-arbeiten',
    image: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
    datePublished: '2025-03-05',
  });

  return (
    <>
      <JsonLd data={articleSchema} />
      <ArticleClient />
    </>
  );
}
