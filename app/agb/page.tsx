import type { Metadata } from 'next';
import AGBClient from './agb-client';

export const metadata: Metadata = {
  title: 'AGB — Allgemeine Geschäftsbedingungen | All in One Residences',
  description: 'Allgemeine Geschäftsbedingungen für Buchungen und Aufenthalte in den All in One Residences Bayreuth.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://allinone-residences.de/agb' },
};

export default function AGBPage() {
  return <AGBClient />;
}
