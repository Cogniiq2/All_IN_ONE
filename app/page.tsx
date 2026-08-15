import type { Metadata } from 'next';
import { HomePageClient } from './home-client';
import { SITE_URL } from '@/lib/content/brand';

/**
 * No LocalBusiness rating schema and no FAQ schema here any more: both
 * previously carried invented figures (9.4/10 from 48 reviews, five
 * apartments, guaranteed free garage parking, a 15-minute drive to the
 * Festspielhaus). The organisation schema in app/layout.tsx now carries only
 * verified facts.
 */
export const metadata: Metadata = {
  title: 'BoLaGio — Familiengeführte Apartments in Bayreuth',
  description:
    'Zwei Apartments in der Bayreuther Innenstadt, geführt von der Familie, der sie gehören. Verfügbarkeit direkt anfragen — persönlich beantwortet.',
  alternates: { canonical: SITE_URL },
};

export default function HomePage() {
  return <HomePageClient />;
}
