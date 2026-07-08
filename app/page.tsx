import type { Metadata } from 'next';
import { JsonLd } from '@/components/shared/json-ld';
import { HomePageClient } from './home-client';

export const metadata: Metadata = {
  title: 'Ferienwohnung Bayreuth mieten — Premium Serviced Apartments | All in One Residences',
  description:
    'Ferienwohnung in Bayreuth mieten: 5 exklusive Serviced Apartments am Sternplatz & in der Altstadt. Garagenparkplatz inklusive, Self Check-in 24/7, familiengeführt. Ab €109/Nacht. Ideal für Festspiele 2026, Geschäftsreisen & Urlaub.',
  keywords: [
    'Ferienwohnung Bayreuth mieten',
    'Apartment Bayreuth Sternplatz',
    'Serviced Apartment Bayreuth',
    'Bayreuth Unterkunft Festspiele 2026',
    'Ferienwohnung Bayreuth Innenstadt',
    'Wohnung Bayreuth kurzzeitmiete',
    'Appartement Bayreuth buchen',
    'Bayreuth Urlaub Apartment',
  ],
  openGraph: {
    title: 'Ferienwohnung Bayreuth mieten — 5 Premium Apartments | All in One Residences',
    description:
      '5 exklusive Ferienwohnungen in Bayreuth — Sternplatz & Altstadt. Garagenparkplatz, Self Check-in, persönlicher Service. Ab €109/Nacht.',
    url: 'https://allinone-residences.de',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Ferienwohnung Bayreuth mieten — All in One Residences Sternplatz',
      },
    ],
  },
  alternates: {
    canonical: 'https://allinone-residences.de',
  },
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': ['LodgingBusiness', 'ApartmentComplex'],
  name: 'All in One Residences',
  alternateName: ['All in One Residences Bayreuth', 'Ferienwohnung Bayreuth Sternplatz'],
  description:
    'Ferienwohnungen und Serviced Apartments in Bayreuth mieten — 5 exklusive Apartments am Sternplatz & in der Altstadt. Mit Garagenparkplatz, Self Check-in und persönlichem Service.',
  url: 'https://allinone-residences.de',
  telephone: '+491601832917',
  email: 'info@allinone-residences.de',
  image: [
    'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
    'https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1260',
  ],
  logo: 'https://allinone-residences.de/logo.png',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Sternplatz',
    addressLocality: 'Bayreuth',
    addressRegion: 'Bayern',
    postalCode: '95444',
    addressCountry: 'DE',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 49.9456,
    longitude: 11.5713,
  },
  hasMap: 'https://maps.google.com/?q=Sternplatz+Bayreuth',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '00:00',
    closes: '23:59',
  },
  priceRange: '€€',
  currenciesAccepted: 'EUR',
  paymentAccepted: 'Credit Card, PayPal, Bank Transfer, Direct Booking',
  numberOfRooms: 5,
  containsPlace: [
    { '@type': 'Apartment', name: 'Maison Sternplatz', url: 'https://allinone-residences.de/residences/maison-sternplatz' },
    { '@type': 'Apartment', name: 'Loge am Sternplatz', url: 'https://allinone-residences.de/residences/loge-am-sternplatz' },
    { '@type': 'Apartment', name: 'Atelier Opernstraße', url: 'https://allinone-residences.de/residences/atelier-opernstrasse' },
    { '@type': 'Apartment', name: 'Penthouse Belvédère', url: 'https://allinone-residences.de/residences/belvedere-penthouse' },
    { '@type': 'Apartment', name: 'Design Loft Innenstadt', url: 'https://allinone-residences.de/residences/designloft-innenstadt' },
  ],
  amenityFeature: [
    { '@type': 'LocationFeatureSpecification', name: 'Garagenparkplatz', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Self Check-in 24/7', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'WLAN Glasfaser', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Vollküche', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Klimaanlage', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Waschmaschine', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Nichtraucherwohnung', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Haustiere auf Anfrage', value: false },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '9.4',
    reviewCount: '48',
    bestRating: '10',
    worstRating: '1',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+491601832917',
    contactType: 'reservations',
    availableLanguage: ['German', 'English', 'French', 'Serbian'],
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '08:00',
      closes: '22:00',
    },
  },
  sameAs: [
    'https://www.booking.com/searchresults.html?ss=Bayreuth&accommodation_type=201',
  ],
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Wie kann ich eine Ferienwohnung in Bayreuth mieten?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sie können unsere Ferienwohnungen in Bayreuth direkt über unsere Website buchen oder uns per WhatsApp kontaktieren. Wir bieten auch Buchungen über Booking.com an.',
      },
    },
    {
      '@type': 'Question',
      name: 'Sind die Apartments in der Innenstadt Bayreuth zentral gelegen?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Alle unsere Apartments liegen im Herzen von Bayreuth — am Sternplatz und in der Altstadt. Restaurants, das Markgräfliche Opernhaus und öffentliche Verkehrsmittel sind zu Fuß erreichbar.',
      },
    },
    {
      '@type': 'Question',
      name: 'Gibt es Parkplätze bei den Apartments in Bayreuth?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ja, jede unserer Residenzen verfügt über einen eigenen Garagenstellplatz im Haus — kostenlos für unsere Gäste.',
      },
    },
    {
      '@type': 'Question',
      name: 'Sind die Apartments für die Bayreuther Festspiele geeignet?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ja, unsere zentral gelegenen Apartments sind ideal für Festspielgäste. Das Festspielhaus ist in 15 Fahrminuten erreichbar, und wir bieten Aufenthalte von einer Woche oder länger an.',
      },
    },
    {
      '@type': 'Question',
      name: 'Ab wann ist der Check-in möglich?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Check-in ist ab 15:00 Uhr möglich — flexibel und kontaktlos per Self Check-in, 24 Stunden täglich, 7 Tage die Woche.',
      },
    },
    {
      '@type': 'Question',
      name: 'Kann ich die Apartments für einen längeren Zeitraum mieten?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ja, wir bieten Langzeitaufenthalte ab einem Monat an. Ideal für Geschäftsreisende, Projektleiter oder Monteure. Kontaktieren Sie uns für spezielle Langzeitpreise.',
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={localBusinessSchema} />
      <JsonLd data={faqSchema} />
      <HomePageClient />
    </>
  );
}
