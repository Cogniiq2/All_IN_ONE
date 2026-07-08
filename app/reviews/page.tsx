import type { Metadata } from 'next';
import { JsonLd, getAggregateRatingSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import ReviewsClient from './reviews-client';

export const metadata: Metadata = {
  title: 'Bewertungen Ferienwohnung Bayreuth — 9.4/10 Gästestimmen | All in One Residences',
  description:
    'Echte Gästebewertungen für Ferienwohnungen in Bayreuth. Durchschnitt 9.4/10 aus 48+ Bewertungen — 96% Weiterempfehlungsrate. Lesen Sie, was Gäste über All in One Residences sagen.',
  keywords: [
    'Bewertungen Ferienwohnung Bayreuth',
    'All in One Residences Bayreuth Erfahrungen',
    'Serviced Apartment Bayreuth Bewertung',
    'Bayreuth Unterkunft Gästestimmen',
    'Apartment Bayreuth Rezensionen',
    'Ferienwohnung Bayreuth Erfahrungsbericht',
    'All in One Residences Bewertungen',
    'Bayreuth Apartment Gäste Feedback',
    'Unterkunft Bayreuth Empfehlung',
    'Bayreuth Sternplatz Apartment Bewertung',
  ],
  openGraph: {
    title: 'Gästebewertungen Ferienwohnung Bayreuth — 9.4/10 | All in One Residences',
    description:
      '9.4/10 Durchschnittsbewertung aus 48 echten Gästestimmen. 96% würden All in One Residences Bayreuth weiterempfehlen.',
    url: 'https://allinone-residences.de/reviews',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Gästebewertungen All in One Residences Bayreuth',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/reviews' },
};

export default function ReviewsPage() {
  const ratingSchema = getAggregateRatingSchema();
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Bewertungen', url: 'https://allinone-residences.de/reviews' },
  ]);

  return (
    <>
      <JsonLd data={ratingSchema} />
      <JsonLd data={breadcrumbSchema} />
      <ReviewsClient />
    </>
  );
}
