import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import ImpressumClient from './impressum-client';

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Impressum und Pflichtangaben gemäß § 5 DDG für BoLaGio in Bayreuth.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/impressum` },
};

export default function ImpressumPage() {
  return <ImpressumClient />;
}
