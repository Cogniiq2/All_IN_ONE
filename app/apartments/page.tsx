import type { Metadata } from 'next';
import { ApartmentsClient } from './apartments-client';
import { SITE_URL } from '@/lib/content/brand';

export const metadata: Metadata = {
  title: 'Apartments in Bayreuth',
  description:
    'Zwei familiengeführte Apartments in der Bayreuther Innenstadt, ein drittes in Vorbereitung. Verfügbarkeit direkt anfragen.',
  alternates: { canonical: `${SITE_URL}/apartments` },
};

export default function ApartmentsPage() {
  return <ApartmentsClient />;
}
