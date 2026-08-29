import type { Metadata } from 'next';
import { SITE_URL, brand, contact } from '@/lib/content/brand';
import { JsonLd, getBreadcrumbSchema } from '@/components/shared/json-ld';
import ContactClient from './contact-client';

export const metadata: Metadata = {
  title: 'Kontakt',
  description:
    'Direkt Kontakt zur Familie hinter BoLaGio in Bayreuth — per Anfrageformular, WhatsApp oder Telefon. Keine Verwaltung, kein Callcenter dazwischen.',
  alternates: { canonical: `${SITE_URL}/contact` },
};

/**
 * ContactPage schema.
 *
 * Carries only what is verified in lib/content/brand.ts: the phone number and
 * the street-level address. `contact.email` is null — no address has been
 * confirmed — so no email appears here or anywhere on the page. The street is
 * published without a house number, matching the rest of the site.
 */
const contactSchema = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': `${SITE_URL}/contact`,
  url: `${SITE_URL}/contact`,
  inLanguage: 'de-DE',
  about: {
    '@type': 'LodgingBusiness',
    name: brand.name,
    url: SITE_URL,
    telephone: contact.phone.replace(/\s/g, ''),
    address: {
      '@type': 'PostalAddress',
      streetAddress: contact.street,
      addressLocality: brand.city,
      addressRegion: 'Bayern',
      postalCode: contact.postalCode,
      addressCountry: 'DE',
    },
    availableLanguage: ['German', 'English'],
  },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd data={contactSchema} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Start', url: SITE_URL },
          { name: 'Kontakt', url: `${SITE_URL}/contact` },
        ])}
      />
      <ContactClient />
    </>
  );
}
