import type { Metadata } from 'next';
import { JsonLd, getContactSchema, getBreadcrumbSchema } from '@/components/shared/json-ld';
import ContactClient from './contact-client';

export const metadata: Metadata = {
  title: 'Ferienwohnung Bayreuth anfragen — Kontakt & Buchung | All in One Residences',
  description:
    'Ferienwohnung Bayreuth direkt anfragen: per WhatsApp, Telefon oder E-Mail. Persönliche Beratung auf Deutsch, Englisch, Französisch und Serbisch. Kein Callcenter — direkter Ansprechpartner.',
  keywords: [
    'Ferienwohnung Bayreuth anfragen',
    'Apartment Bayreuth buchen',
    'Kontakt All in One Residences',
    'Bayreuth Unterkunft direkt buchen',
    'Serviced Apartment Bayreuth reservieren',
    'Ferienwohnung Bayreuth WhatsApp',
    'Bayreuth Apartment Anfrage',
    'Unterkunft Bayreuth Innenstadt buchen',
    'All in One Residences Telefon',
    'Bayreuth Ferienwohnung persönliche Beratung',
  ],
  openGraph: {
    title: 'Ferienwohnung Bayreuth anfragen | All in One Residences',
    description:
      'Direkter Kontakt für Ihre Ferienwohnung in Bayreuth. WhatsApp, Telefon oder E-Mail — persönliche Beratung ohne Warteschleife.',
    url: 'https://allinone-residences.de/contact',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Kontakt All in One Residences Bayreuth',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/contact' },
};

export default function ContactPage() {
  const contactSchema = getContactSchema();
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: 'Startseite', url: 'https://allinone-residences.de' },
    { name: 'Kontakt', url: 'https://allinone-residences.de/contact' },
  ]);

  return (
    <>
      <JsonLd data={contactSchema} />
      <JsonLd data={breadcrumbSchema} />
      <ContactClient />
    </>
  );
}
