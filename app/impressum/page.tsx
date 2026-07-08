import type { Metadata } from 'next';
import ImpressumClient from './impressum-client';

export const metadata: Metadata = {
  title: 'Impressum | All in One Residences — Bayreuth',
  description: 'Impressum und Pflichtangaben gemäß § 5 TMG für All in One Residences — Bayreuth.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://allinone-residences.de/impressum' },
};

export default function ImpressumPage() {
  return <ImpressumClient />;
}
