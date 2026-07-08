import type { Metadata } from 'next';
import { JsonLd, getArticleSchema } from '@/components/shared/json-ld';
import ArticleClient from './wagner-client';

export const metadata: Metadata = {
  title: 'Richard Wagner & Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde — Bayreuth Journal',
  description:
    'Die Geschichte von Richard Wagner und Bayreuth: Warum er das Festspielhaus baute, was den mystischen Abgrund ausmacht, und warum Bayreuth einzigartig bleibt.',
  keywords: [
    'Richard Wagner Bayreuth',
    'Bayreuther Festspiele Geschichte',
    'Festspielhaus Bayreuth Geschichte',
    'Wagner Gesamtkunstwerk',
    'Bayreuth Kultur Geschichte',
    'Richard Wagner Festspielhaus',
    'Bayreuth Wagner Mythos',
    'Bayreuther Festspiele Bedeutung',
  ],
  openGraph: {
    title: 'Richard Wagner & Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde — Bayreuth Journal',
    description: 'Die Geschichte von Richard Wagner und Bayreuth: Warum er das Festspielhaus baute, was den mystischen Abgrund ausmacht, und warum Bayreuth einzigartig bleibt.',
    url: 'https://allinone-residences.de/journal/richard-wagner-bayreuth-mythos',
    type: 'article',
    images: [
      {
        url: 'https://c8.alamy.com/comp/KD6MMB/richard-wagner-in-bayreuth-with-festspielhaus-festival-house-and-villa-KD6MMB.jpg',
        width: 1260,
        height: 750,
        alt: 'Richard Wagner & Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde — Bayreuth Journal',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal/richard-wagner-bayreuth-mythos' },
};

export default function ArticlePage() {
  const articleSchema = getArticleSchema({
    title: 'Richard Wagner & Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde — Bayreuth Journal',
    description: 'Die Geschichte von Richard Wagner und Bayreuth: Warum er das Festspielhaus baute, was den mystischen Abgrund ausmacht, und warum Bayreuth einzigartig bleibt.',
    url: 'https://c8.alamy.com/comp/KD6MMB/richard-wagner-in-bayreuth-with-festspielhaus-festival-house-and-villa-KD6MMB.jpg',
    image: 'https://c8.alamy.com/comp/KD6MMB/richard-wagner-in-bayreuth-with-festspielhaus-festival-house-and-villa-KD6MMB.jpg',
    datePublished: '2025-02-28',
  });

  return (
    <>
      <JsonLd data={articleSchema} />
      <ArticleClient />
    </>
  );
}
