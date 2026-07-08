import type { Metadata } from 'next';
import DatenschutzClient from './datenschutz-client';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung | All in One Residences — Bayreuth',
  description: 'Datenschutzerklärung gemäß DSGVO für All in One Residences — Bayreuth.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://allinone-residences.de/datenschutz' },
};

export default function DatenschutzPage() {
  return <DatenschutzClient />;
}
