import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import BayreuthClient from './bayreuth-2026-client';

export const metadata: Metadata = {
  title: 'Bayreuth & die Festspiele',
  description:
    'Übernachten in Bayreuth zur Festspielzeit — und den Rest des Jahres. Zwei familiengeführte Apartments in der Innenstadt, direkt anzufragen.',
  alternates: { canonical: `${SITE_URL}/bayreuth-2026` },
};

export default function BayreuthPage() {
  return <BayreuthClient />;
}
