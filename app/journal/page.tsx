import type { Metadata } from 'next';
import JournalClient from './journal-client';

export const metadata: Metadata = {
  title: 'Bayreuth Journal — Ferienwohnung, Festspiele & Reise-Guides | All in One Residences',
  description:
    'Alles über Ferienwohnungen in Bayreuth mieten, die Bayreuther Festspiele 2026, Richard Wagner und Bayreuth als Reiseziel — Guides, Geschichten und Insidertipps von All in One Residences.',
  keywords: [
    'Bayreuth Ferienwohnung Tipps',
    'Bayreuther Festspiele 2026 Guide',
    'Bayreuth Unterkunft Ratgeber',
    'Richard Wagner Bayreuth',
    'Bayreuth Reiseguide',
    'Bayreuth Journal',
    'Ferienwohnung Bayreuth mieten Tipps',
    'Bayreuth Geschäftsreise Guide',
  ],
  openGraph: {
    title: 'Bayreuth Journal — Ferienwohnung, Festspiele & Reise-Guides',
    description:
      'Guides und Geschichten rund um Ferienwohnungen in Bayreuth, die Festspiele 2026 und Wagner. Von All in One Residences.',
    url: 'https://allinone-residences.de/journal',
    type: 'website',
    images: [
      {
        url: 'https://images.pexels.com/photos/1763067/pexels-photo-1763067.jpeg?auto=compress&cs=tinysrgb&w=1260',
        width: 1260,
        height: 750,
        alt: 'Bayreuth Journal — All in One Residences',
      },
    ],
  },
  alternates: { canonical: 'https://allinone-residences.de/journal' },
};

export default function JournalPage() {
  return <JournalClient />;
}
