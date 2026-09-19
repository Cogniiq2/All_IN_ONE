import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import DatenschutzClient from './datenschutz-client';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Wie BoLaGio mit personenbezogenen Daten auf dieser Website umgeht.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/datenschutz` },
};

export default function DatenschutzPage() {
  return <DatenschutzClient />;
}
