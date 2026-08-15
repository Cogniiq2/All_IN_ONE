import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import AboutClient from './about-client';

export const metadata: Metadata = {
  title: 'Über uns',
  description:
    'BoLaGio ist ein Familienunternehmen in Bayreuth. Wir vermieten unsere eigenen Apartments und kümmern uns persönlich darum.',
  alternates: { canonical: `${SITE_URL}/about` },
};

export default function AboutPage() {
  return <AboutClient />;
}
