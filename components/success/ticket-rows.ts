import type { Locale, RentalUnit } from '@/lib/content/apartments';
import { nightsBetween } from '@/lib/booking/availability';
import { formatDate } from '@/lib/booking/date-format';
import type { TicketRow } from '@/components/success/success-experience';

/**
 * The rows of a stay ticket, from whatever facts are actually known. A fact
 * that is missing is a row that is missing — never a dash, never a guess.
 */
export function stayRows(
  facts: { arrival?: string; departure?: string; nights?: number; guests?: number; reference?: string; total?: string },
  locale: Locale
): TicketRow[] {
  const de = locale === 'de';
  const rows: TicketRow[] = [];
  const arrival = formatDate(facts.arrival);
  const departure = formatDate(facts.departure);
  const nights = facts.nights ?? nightsBetween(facts.arrival, facts.departure);
  if (facts.reference) rows.push({ label: de ? 'Referenz' : 'Reference', value: facts.reference, emphasis: true });
  if (arrival) rows.push({ label: de ? 'Anreise' : 'Arrival', value: arrival });
  if (departure) rows.push({ label: de ? 'Abreise' : 'Departure', value: departure });
  if (nights) rows.push({ label: de ? 'Nächte' : 'Nights', value: String(nights) });
  if (facts.guests) rows.push({ label: de ? 'Personen' : 'Guests', value: String(facts.guests) });
  if (facts.total) rows.push({ label: de ? 'Gesamt' : 'Total', value: facts.total });
  return rows;
}

const REQUEST_LABEL = {
  consultation: { de: 'Persönliches Gespräch', en: 'A personal conversation' },
  viewing: { de: 'Besichtigungstermin', en: 'A viewing appointment' },
  information: { de: 'Zunächst Informationen', en: 'Information for now' },
} as const;

const PARTY_LABEL = {
  private: { de: 'Privatperson', en: 'Private individual' },
  company: { de: 'Unternehmen', en: 'Company' },
} as const;

const INTEREST_LABEL = {
  'long-term-residential': { de: 'Wohnen', en: 'Residential' },
  'long-term-commercial': { de: 'Gewerbe', en: 'Commercial' },
} as const;

/** The rows of a rental enquiry ticket. */
export function rentalRows(
  facts: {
    request?: keyof typeof REQUEST_LABEL;
    party?: keyof typeof PARTY_LABEL;
    interest?: keyof typeof INTEREST_LABEL;
  },
  locale: Locale
): TicketRow[] {
  const de = locale === 'de';
  const rows: TicketRow[] = [];
  if (facts.interest) rows.push({ label: de ? 'Nutzung' : 'Use', value: INTEREST_LABEL[facts.interest][locale] });
  if (facts.party) rows.push({ label: de ? 'Anfrage als' : 'Enquiring as', value: PARTY_LABEL[facts.party][locale] });
  if (facts.request) rows.push({ label: de ? 'Gewünscht' : 'Requested', value: REQUEST_LABEL[facts.request][locale] });
  return rows;
}

/** A residence in preparation: its status and, when known, when it opens. */
export function waitlistRows(unit: RentalUnit | undefined, locale: Locale): TicketRow[] {
  const de = locale === 'de';
  if (!unit) return [];
  const rows: TicketRow[] = [{ label: 'Status', value: de ? 'In Vorbereitung' : 'In preparation' }];
  if (unit.expectedAvailability) {
    rows.push({ label: de ? 'Voraussichtlich' : 'Expected', value: unit.expectedAvailability[locale] });
  }
  return rows;
}
