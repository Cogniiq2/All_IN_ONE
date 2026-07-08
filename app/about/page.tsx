import type { Metadata } from 'next';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import AboutClient from './about-client';

export const metadata: Metadata = {
  title: 'Über uns — Ihr persönlicher Ansprechpartner für Ferienwohnungen in Bayreuth | All in One Residences',
  description:
    'All in One Residences Bayreuth — familiengeführter Betrieb mit 5 Apartments am Sternplatz & in der Altstadt. Kein Callcenter, kein Franchise. Persönlicher Service, direkte Kommunikation.',
  keywords: [
    'All in One Residences Bayreuth',
    'Ferienwohnung Bayreuth Betreiber',
    'Serviced Apartments Bayreuth Inhaber',
    'Bayreuth Unterkunft familiengeführt',
    'Apartment Bayreuth persönlicher Service',
    'Ferienwohnung Bayreuth Sternplatz Betreiber',
    'All in One Residences Team Bayreuth',
    'Bayreuth Apartment Vermieter direkt',
    'Ferienwohnung Bayreuth ohne Agentur',
    'Unterkunft Bayreuth direkter Kontakt',
  ],
  openGraph: {
    title: 'Über uns | All in One Residences — Ferienwohnungen Bayreuth',
    description:
      'Das Team hinter All in One Residences — 5 Apartments in Bayreuth, familiengeführt, persönlicher Service ohne Callcenter.',
    url: 'https://allinone-residences.de/about',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'All in One Residences Bayreuth — Über uns',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/about' },
};

export default function AboutPage() {
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Über uns', url: 'https://allinone-residences.de/about' },
  ]);

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'All in One Residences',
    alternateName: 'All in One Residences Bayreuth',
    description:
      'Familiengeführter Betrieb mit 5 Serviced Apartments in Bayreuth am Sternplatz & in der Altstadt. Kein Callcenter, direkter persönlicher Ansprechpartner.',
    url: 'https://allinone-residences.de',
    telephone: '+491601832917',
    email: 'info@allinone-residences.de',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Sternplatz',
      addressLocality: 'Bayreuth',
      addressRegion: 'Bayern',
      postalCode: '95444',
      addressCountry: 'DE',
    },
    knowsLanguage: ['de', 'en', 'fr', 'sr'],
  };

  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={breadcrumbSchema} />
      <AboutClient />
    </>
  );
}
