import type { Metadata } from 'next';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import BookDirectClient from './book-direct-client';

export const metadata: Metadata = {
  title: 'Ferienwohnung Bayreuth direkt buchen — ohne Gebühren | All in One Residences',
  description:
    'Ferienwohnung Bayreuth direkt buchen — ohne Airbnb-Gebühren, ohne Umwege. Persönlicher Kontakt, Willkommenswein, flexible Check-in Zeiten und bessere Konditionen als auf Buchungsplattformen.',
  keywords: [
    'Ferienwohnung Bayreuth direkt buchen',
    'Apartment Bayreuth ohne Airbnb',
    'Direktbuchung Serviced Apartment Bayreuth',
    'Bayreuth Unterkunft ohne Plattformgebühren',
    'Bayreuth Wohnung direkt reservieren',
    'Bayreuth Apartment ohne Booking.com buchen',
    'Ferienwohnung Bayreuth günstiger direkt',
    'Bayreuth Unterkunft Direktbuchung Vorteile',
    'Serviced Apartment Bayreuth beste Konditionen',
    'Wohnung Bayreuth mieten direkt vom Vermieter',
  ],
  openGraph: {
    title: 'Ferienwohnung Bayreuth direkt buchen | All in One Residences',
    description:
      'Direkt buchen, besser wohnen — keine Airbnb-Gebühren, persönlicher Kontakt, Willkommenswein und flexible Check-in Zeiten.',
    url: 'https://allinone-residences.de/book-direct',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Ferienwohnung Bayreuth direkt buchen',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/book-direct' },
};

export default function BookDirectPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Direkt buchen', url: 'https://allinone-residences.de/book-direct' },
  ]);

  const offerSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Direktbuchung Ferienwohnung Bayreuth',
    description:
      'Ferienwohnungen in Bayreuth direkt beim Betreiber buchen — ohne Plattformgebühren, mit persönlichem Service, Willkommenswein und flexiblen Check-in Zeiten.',
    provider: {
      '@type': 'Organization',
      name: 'All in One Residences',
      url: 'https://allinone-residences.de',
      telephone: '+491601832917',
    },
    areaServed: {
      '@type': 'City',
      name: 'Bayreuth',
    },
    offers: {
      '@type': 'Offer',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        minPrice: 109,
        priceCurrency: 'EUR',
        unitText: 'Nacht',
      },
      availability: 'https://schema.org/InStock',
      url: 'https://allinone-residences.de/book-direct',
    },
  };

  return (
    <>
      <JsonLd data={offerSchema} />
      <JsonLd data={breadcrumbSchema} />
      <BookDirectClient />
    </>
  );
}
