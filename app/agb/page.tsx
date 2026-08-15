import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import AGBClient from './agb-client';

export const metadata: Metadata = {
  title: 'Allgemeine Geschäftsbedingungen',
  description: 'Grundlage für Anfragen und Aufenthalte bei BoLaGio in Bayreuth.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${SITE_URL}/agb` },
};

export default function AGBPage() {
  return <AGBClient />;
}
