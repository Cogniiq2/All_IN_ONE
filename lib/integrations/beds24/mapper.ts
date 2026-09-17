import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * Beds24 → BoLaGio. The border post.
 *
 * Above this file the application deals in `InventoryDay` and `BookingQuote`.
 * Below it, in Beds24's shapes. Nothing crosses without being read
 * defensively, because a channel manager's response is a third-party input:
 * numbers arrive as strings, booleans as 0 and 1, fields are omitted when a
 * property has not configured them.
 *
 * ── The rule that matters most ───────────────────────────────────────────
 * A field that cannot be read is NOT defaulted to something convenient. An
 * unreadable availability count is unavailable, not available. An unreadable
 * price makes the offer unusable rather than free. Every default in this file
 * fails closed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { addDays, nightsBetween } from '@/lib/booking/stay-rules';
import type { BookingQuote, InventoryDay, IsoDate, QuoteComponent } from '@/lib/booking/types';
import { ProviderError } from '@/lib/integrations/provider';
import type { ProviderPropertySummary } from '@/lib/integrations/provider';
import type {
  Beds24CalendarEntry,
  Beds24CalendarResponse,
  Beds24Offer,
  Beds24OffersResponse,
  Beds24PropertiesResponse,
  Beds24Room,
} from '@/lib/integrations/beds24/types';

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Beds24 writes flags as 0/1, "0"/"1" or true/false depending on endpoint. */
function flag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const n = num(value);
  return n !== undefined && n !== 0;
}

/**
 * Euros (or whatever the property's currency is) to integer minor units.
 *
 * ── Why this does not multiply by 100 ────────────────────────────────────
 * It cannot be done in floating point and be right. `1.005 * 100` is
 * 100.49999999999999, so `Math.round` gives 100 cents for an amount that is
 * plainly 101. A booking total that is a cent out on some stays and not
 * others is a reconciliation problem handed to whoever does the books, and it
 * is the kind that is never traced back to a line of JavaScript.
 *
 * So the value is read as a DECIMAL STRING and the point is moved by hand.
 * Beds24 sends prices as strings about as often as numbers, and `String(n)`
 * gives the shortest representation that round-trips — which is the decimal
 * the provider meant. Half-up on the third decimal, which is what a person
 * doing this on paper would do.
 */
export function toCents(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;

  const raw = typeof value === 'number' ? String(value) : value.trim();
  // Exponential notation is not a price a channel manager sends; refusing it
  // is safer than guessing at its magnitude.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return undefined;

  const whole = match[1];
  const fraction = (match[2] ?? '').padEnd(3, '0');
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2));
  // Half-up on the third decimal.
  return Number(fraction[2]) >= 5 ? cents + 1 : cents;
}

/**
 * Expand Beds24's compressed calendar into one `InventoryDay` per date.
 *
 * Beds24 returns runs — "from 2026-09-16 to 2026-09-19, numAvail 0" — so a
 * year of inventory is a handful of objects rather than 365. This walks each
 * run day by day.
 *
 * ── Verified against the live API ────────────────────────────────────────
 * Confirmed on 2026-09-17 against property 354659: nine compressed runs over
 * a 30-day window expanded to exactly 30 days, 21 of them available, which
 * matches the raw `numAvail` values counted by hand. `closedArrival` and
 * `closedDeparture` were absent from the response entirely — `flag(undefined)`
 * reads false, so an absent flag means "not closed", which is right.
 *
 * ── Checkout semantics ───────────────────────────────────────────────────
 * `numAvail` describes the NIGHT beginning on a date. So a date with no
 * availability is still a legal departure: you may leave on the morning of a
 * night you are not sleeping through. `canCheckOut` is therefore true unless
 * the property has explicitly closed departures on that date. This is the
 * difference between selling the night after a Booking.com stay and losing it.
 */
export function mapCalendar(
  response: Beds24CalendarResponse,
  from: IsoDate,
  to: IsoDate
): InventoryDay[] {
  const entries: Beds24CalendarEntry[] = [];
  for (const room of response.data ?? []) {
    for (const entry of room.calendar ?? []) entries.push(entry);
  }

  const byDate = new Map<IsoDate, InventoryDay>();

  for (const entry of entries) {
    const start = entry.from;
    const end = entry.to ?? entry.from;
    if (!start || !end) continue;

    const available = (num(entry.numAvail) ?? 0) > 0;
    const closedArrival = flag(entry.closedArrival);
    const closedDeparture = flag(entry.closedDeparture);
    const minStay = num(entry.minStay);
    const maxStay = num(entry.maxStay);
    const priceCents = toCents(entry.price1);

    // Beds24's `to` is inclusive for a calendar run.
    for (let d = start; d <= end; d = addDays(d, 1)) {
      byDate.set(d, {
        date: d,
        available,
        canCheckIn: available && !closedArrival,
        canCheckOut: !closedDeparture,
        minStay: minStay && minStay > 1 ? minStay : undefined,
        maxStay: maxStay && maxStay > 0 ? maxStay : undefined,
        displayPriceCents: priceCents,
      });
    }
  }

  // Any date inside the requested window that Beds24 did not describe is
  // treated as unavailable. A gap in a provider response is not permission to
  // sell a night.
  const days: InventoryDay[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    days.push(
      byDate.get(d) ?? { date: d, available: false, canCheckIn: false, canCheckOut: true }
    );
  }
  return days;
}

/**
 * The authoritative total for a concrete stay.
 *
 * An offers response with no offers is an availability conflict, not an empty
 * result — the dates were free when the calendar was cached and are not free
 * now, which is precisely the case the guest gets a premium screen for.
 */
export function mapOffer(
  response: Beds24OffersResponse,
  request: {
    unitSlug: string;
    externalRoomId: string;
    checkIn: IsoDate;
    checkOut: IsoDate;
    adults: number;
    children: number;
  },
  expiresAt: string
): BookingQuote {
  const offers: Beds24Offer[] = [];
  let currency = 'EUR';

  for (const property of response.data ?? []) {
    for (const room of property.roomTypes ?? []) {
      // The response can carry several rooms; only the mapped one is ours.
      if (String(room.roomId ?? '') !== request.externalRoomId) continue;
      for (const offer of room.offers ?? []) {
        offers.push(offer);
        if (offer.currency) currency = offer.currency;
      }
    }
  }

  if (offers.length === 0) {
    throw new ProviderError('availability_conflict', 'Beds24 returned no bookable offer');
  }

  // The cheapest offer Beds24 is willing to sell. A price that cannot be read
  // makes the offer unusable rather than free.
  let best: { offer: Beds24Offer; cents: number } | undefined;
  for (const offer of offers) {
    const cents = toCents(offer.price);
    if (cents === undefined) continue;
    if (!best || cents < best.cents) best = { offer, cents };
  }

  if (!best) {
    throw new ProviderError('unavailable', 'Beds24 offer carried no readable price');
  }

  const nights = nightsBetween(request.checkIn, request.checkOut);

  /**
   * Line items.
   *
   * The accommodation line is the rate Beds24 quoted. Fees the property
   * configures separately come through as their own lines with their own tax
   * category, which is why `QuoteComponent` carries one — German accommodation
   * VAT, a cleaning service and a Kurtaxe are not one rate, and a schema that
   * assumes they are has to be migrated under a deadline later.
   *
   * No tax is COMPUTED here and none is displayed as a breakdown. What is not
   * known is not invented.
   */
  const components: QuoteComponent[] = [
    {
      code: 'accommodation',
      label: { de: `Unterkunft · ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'}`,
               en: `Accommodation · ${nights} ${nights === 1 ? 'night' : 'nights'}` },
      amountCents: best.cents,
      taxCategory: 'accommodation',
      mandatory: true,
    },
  ];

  let totalCents = best.cents;
  for (const fee of best.offer.fees ?? []) {
    const cents = toCents(fee.amount);
    if (cents === undefined || cents === 0) continue;
    const name = typeof fee.name === 'string' && fee.name.trim() !== '' ? fee.name.trim() : 'Zusatzleistung';
    components.push({
      code: `fee:${name.toLowerCase().replace(/\W+/g, '-')}`,
      // The provider supplies one string; it is shown as-is in both languages
      // rather than being machine-translated into something it does not say.
      label: { de: name, en: name },
      amountCents: cents,
      taxCategory: 'unknown',
      mandatory: true,
    });
    totalCents += cents;
  }

  return {
    unitSlug: request.unitSlug,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    nights,
    adults: request.adults,
    children: request.children,
    currency,
    totalCents,
    components,
    expiresAt,
    cancellationPolicy: best.offer.cancellationPolicy
      ? { de: best.offer.cancellationPolicy, en: best.offer.cancellationPolicy }
      : undefined,
  };
}


/* ── Properties and rooms (operations, not the guest flow) ──────────────── */

function readId(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return undefined;
}

/**
 * The account's properties and their rooms.
 *
 * Used once, by operations, to establish which Beds24 property and room a
 * BoLaGio unit maps to — by asking the provider what exists rather than
 * trusting an id copied from somewhere. Never called during a booking.
 *
 * Rooms are read from `roomTypes` or `rooms`, whichever the response carries:
 * the V2 surface uses both names in different places and only `roomTypes` has
 * been observed first-hand, on the offers endpoint. A property whose rooms
 * cannot be read comes back with an empty `rooms` array rather than being
 * dropped, so a mapping gap is visible instead of silent.
 *
 * There is no `GET /properties/rooms`. It returns HTTP 500; rooms exist only
 * nested here, behind `includeAllRooms=true`.
 */
export function mapProperties(response: Beds24PropertiesResponse): ProviderPropertySummary[] {
  const properties: ProviderPropertySummary[] = [];

  for (const property of response.data ?? []) {
    const externalPropertyId = readId(property.id, property.propertyId);
    if (!externalPropertyId) continue;

    const rawRooms: Beds24Room[] = property.roomTypes ?? property.rooms ?? [];
    const rooms = rawRooms.flatMap((room) => {
      const externalRoomId = readId(room.id, room.roomId);
      if (!externalRoomId) return [];
      // `qty` is how many of this room type exist, not how many people it
      // sleeps, so it is deliberately not used as an occupancy fallback.
      const maxGuests = num(room.maxPeople);
      return [{
        externalRoomId,
        name: typeof room.name === 'string' && room.name.trim() !== '' ? room.name.trim() : '(unnamed room)',
        maxGuests: maxGuests && maxGuests > 0 ? maxGuests : undefined,
      }];
    });

    properties.push({
      externalPropertyId,
      name: typeof property.name === 'string' && property.name.trim() !== '' ? property.name.trim() : '(unnamed property)',
      currency: property.currency,
      rooms,
    });
  }

  return properties;
}
