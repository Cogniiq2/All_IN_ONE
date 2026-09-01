import type { Metadata } from 'next';
import { ApartmentsClient } from './apartments-client';
import { SITE_URL } from '@/lib/content/brand';
import { apartments, bookableApartments } from '@/lib/content/apartments';

/**
 * The description counts the inventory rather than stating a number, so adding
 * an apartment cannot leave a stale figure in the search result. It names what
 * is bookable today and what is still in preparation separately — claiming all
 * of them are bookable would be untrue while the Opernstraße flats are being
 * renovated.
 */
const bookable = bookableApartments().length;
const inPreparation = apartments.length - bookable;

export const metadata: Metadata = {
  title: 'Apartments in Bayreuth',
  description:
    `${bookable} familiengeführte Apartments in der Bayreuther Innenstadt` +
    (inPreparation > 0 ? `, ${inPreparation} weitere in Vorbereitung` : '') +
    '. Direkt buchen, persönlich bestätigt.',
  alternates: { canonical: `${SITE_URL}/apartments` },
};

export default function ApartmentsPage() {
  return <ApartmentsClient />;
}
