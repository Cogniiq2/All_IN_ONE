import type { Metadata } from 'next';
import { faqs } from '@/lib/faq';
import { JsonLd } from '@/components/shared/json-ld';
import FAQClient from './faq-client';

export const metadata: Metadata = {
  title: 'FAQ — Ferienwohnung Bayreuth mieten: Check-in, Buchung & Aufenthalt | All in One Residences',
  description:
    'Häufige Fragen zu unseren Ferienwohnungen in Bayreuth: Wie funktioniert der Check-in? Gibt es Parkplätze? Kann ich direkt buchen? Alle Antworten auf einen Blick.',
  keywords: [
    'FAQ Ferienwohnung Bayreuth',
    'Self Check-in Bayreuth Apartment',
    'Parkplatz Bayreuth Innenstadt mieten',
    'Buchung Serviced Apartment Bayreuth',
    'Ferienwohnung Bayreuth Fragen',
    'Stornierung Apartment Bayreuth',
  ],
  openGraph: {
    title: 'FAQ — Ferienwohnung Bayreuth mieten | All in One Residences',
    description:
      'Alle wichtigen Fragen zu unseren Ferienwohnungen in Bayreuth: Check-in, Parkplatz, Buchung, Stornierung.',
    url: 'https://allinone-residences.de/faq',
    type: 'website',
  },
  alternates: { canonical: 'https://allinone-residences.de/faq' },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question.de,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer.de,
    },
  })),
};

export default function FAQPage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <FAQClient />
    </>
  );
}
