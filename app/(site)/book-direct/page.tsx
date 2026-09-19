import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/content/brand';
import BookDirectClient from './book-direct-client';

export const metadata: Metadata = {
  title: 'Direkt anfragen',
  description:
    'Warum es sich lohnt, direkt bei der Familie anzufragen statt über eine Plattform: persönliche Antworten, klare Absprachen, kein Umweg.',
  alternates: { canonical: `${SITE_URL}/book-direct` },
};

export default function BookDirectPage() {
  return <BookDirectClient />;
}
