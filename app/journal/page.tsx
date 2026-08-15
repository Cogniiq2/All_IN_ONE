import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import { JournalClient } from './journal-client';

export const metadata: Metadata = {
  title: 'Journal',
  description:
    'Notizen aus Bayreuth — über die Stadt, die Festspiele und das Wohnen auf Zeit. Geschrieben von der Familie hinter BoLaGio.',
  alternates: { canonical: `${SITE_URL}/journal` },
};

export default function JournalPage() {
  return <JournalClient />;
}
