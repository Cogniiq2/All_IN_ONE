import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import ContactClient from './contact-client';

export const metadata: Metadata = {
  title: 'Kontakt',
  description:
    'Direkt Kontakt zur Familie hinter BoLaGio in Bayreuth — per Anfrageformular, WhatsApp oder Telefon.',
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default function ContactPage() {
  return <ContactClient />;
}
