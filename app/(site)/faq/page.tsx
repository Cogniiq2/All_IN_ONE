import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import { faqs } from '@/lib/faq';
import { JsonLd, getFaqSchema } from '@/components/shared/json-ld';
import FaqClient from './faq-client';

export const metadata: Metadata = {
  title: 'Häufige Fragen',
  description:
    'Antworten zu Anfrage, Buchung, Anreise und Aufenthalt in den BoLaGio Apartments in Bayreuth.',
  alternates: { canonical: `${SITE_URL}/faq` },
};

export default function FaqPage() {
  return (
    <>
      {/* FAQ schema is generated from the same answers shown on the page —
          nothing is asserted to Google that a visitor cannot read here. */}
      <JsonLd
        data={getFaqSchema(
          faqs.map((faq) => ({ question: faq.question.de, answer: faq.answer.de }))
        )}
      />
      <FaqClient />
    </>
  );
}
