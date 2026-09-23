/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOOKING DOMAIN — shared by the browser, the route handlers and the
 * provider adapters.
 *
 * This file is import-safe from a client component. It contains types and
 * pure constants only: no secrets, no provider names in the wire format, no
 * Beds24 identifiers. What the browser receives about a booking is exactly
 * what is described here, and a Beds24 property id is not in it.
 *
 * ── Money ────────────────────────────────────────────────────────────────
 * Always integer minor units (cents) plus an ISO-4217 currency. Floating
 * point euros are a correctness bug waiting for a three-night stay at
 * 83.33 €.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { isConfirmed, reservesInventory } from '@/lib/booking/states';
import type { BookingState, PaymentState } from '@/lib/booking/states';
import type { AcceptedTermsVersions, CheckoutTerms } from '@/lib/legal/booking-terms';

/** ISO `YYYY-MM-DD`. The only date shape that crosses a boundary. */
export type IsoDate = string;

/* ── Availability ──────────────────────────────────────────────────────── */

/**
 * One calendar day, as the UI needs to paint it.
 *
 * ── Hotel date semantics ─────────────────────────────────────────────────
 * A reservation from 16 Sep to 20 Sep occupies the NIGHTS of 16, 17, 18 and
 * 19. The 20th is a checkout, not an occupied night: unless something else
 * takes it, the 20th is a perfectly valid new arrival and the calendar must
 * offer it. Three independent flags, because they genuinely differ:
 *
 *   available     the night beginning on this date is free
 *   canCheckIn    a stay may START here (free night + no provider arrival rule)
 *   canCheckOut   a stay may END here (this date is not itself a night)
 *
 * The day after a fully booked month is `available: false, canCheckOut: true`
 * — you may leave on it, you may not sleep through it.
 */
export interface InventoryDay {
  date: IsoDate;
  available: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  /** Minimum nights when arriving on this date, when the provider sets one. */
  minStay?: number;
  maxStay?: number;
  /** Indicative only. The authoritative total always comes from a live quote. */
  displayPriceCents?: number;
}

export interface AvailabilityCalendar {
  unitSlug: string;
  from: IsoDate;
  to: IsoDate;
  currency: string;
  days: InventoryDay[];
  /**
   * When the cache behind this answer was last refreshed from the provider.
   * The UI does not show it; observability and staleness checks use it.
   */
  syncedAt?: string;
  /**
   * True when this unit has no connected provider mapping at all. The UI then
   * keeps the existing "we confirm your dates personally" behaviour instead of
   * pretending every night is free.
   */
  unsourced?: boolean;
}

/* ── Quotes ────────────────────────────────────────────────────────────── */

/**
 * A priced line.
 *
 * `taxCategory` is carried from the first line this repository ever prices.
 * German accommodation, a cleaning fee and a Kurtaxe are not the same tax
 * treatment, and a schema that assumes every euro is one category has to be
 * migrated under a deadline later. It is not *computed* anywhere yet, and no
 * tax breakdown is invented — the field simply records what the provider said
 * the line is.
 */
export interface QuoteComponent {
  code: string;
  label: { de: string; en: string };
  amountCents: number;
  taxCategory?: 'accommodation' | 'service' | 'city_tax' | 'deposit' | 'unknown';
  /** True when the guest must pay it to book — as opposed to payable on site. */
  mandatory: boolean;
}

export interface BookingQuote {
  unitSlug: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  totalCents: number;
  components: QuoteComponent[];
  /** ISO timestamp after which this quote must be refetched. */
  expiresAt: string;
  /**
   * Cancellation wording the PROVIDER returned, when it returns one.
   *
   * Never shown to a guest and never sent to the browser: the service strips
   * it. Beds24's text is single-language, unreviewed and may be absent — the
   * checkout used to render nothing at all when it was. BoLaGio's approved,
   * versioned policy in `terms` is the only one a guest sees.
   */
  cancellationPolicy?: { de: string; en: string };
  /**
   * The approved BoLaGio terms for this checkout: cancellation policy,
   * no-withdrawal notice, AGB and privacy versions, the price statement and
   * the contracting party. `null` (or absent) means one of them is not
   * approved yet — the checkout then renders that gap and offers NO payment.
   * See lib/legal/readiness.ts.
   */
  terms?: CheckoutTerms | null;
}

/* ── Booking intent ────────────────────────────────────────────────────── */

/**
 * The booking state, re-exported from the canonical machine.
 *
 * Defined in `lib/booking/states.ts` and enforced in PostgreSQL. It lives
 * there rather than here because the machine is more than a union of strings —
 * it is a transition table, a reserving-state predicate and a paid-side
 * predicate, and splitting the name from its rules is how the two drift apart.
 */
export type BookingStatus = BookingState;
export type PaymentStatus = PaymentState;

export type PaymentProvider = 'stripe' | 'paypal';

export type BookingSource = 'direct' | 'booking_com' | 'airbnb' | 'manual';

export type { AcceptedTermsVersions, CheckoutTerms };

/** The guest details a booking actually needs. Nothing more is collected. */
export interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO-3166-1 alpha-2. */
  country?: string;
  locale?: 'de' | 'en';
}

/**
 * What the browser is told about a booking intent.
 *
 * Deliberately NOT in here: the internal uuid, the Beds24 booking id, the
 * provider snapshot, the idempotency key. The guest works with `reference`
 * (BLG-XXXXXX) and nothing else.
 */
export interface BookingIntentView {
  reference: string;
  status: BookingStatus;
  unitSlug: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  totalCents: number | null;
  components: QuoteComponent[];
  /** ISO timestamp the inventory hold runs out at, when one is held. */
  holdExpiresAt?: string;
  /**
   * What the MONEY is doing, separately from what the reservation is doing.
   *
   * The return page needs this to tell "we are still confirming your payment"
   * apart from "your payment did not go through", which a single status column
   * cannot express — see the header of lib/booking/states.ts.
   */
  paymentStatus: PaymentStatus;
}

/**
 * The single place that decides whether a reservation may be announced as
 * confirmed. A browser returning to a success URL is not evidence of anything;
 * only these two statuses are, and both are only ever set by a trusted
 * server-side callback.
 */
export function isConfirmedStatus(status: BookingStatus): boolean {
  return isConfirmed(status);
}

/** Statuses that hold inventory and must be released if they do not complete. */
export function holdsInventory(status: BookingStatus): boolean {
  return reservesInventory(status);
}

/* ── Failure vocabulary ────────────────────────────────────────────────── */

/**
 * Every way a booking call may fail, as a closed set.
 *
 * The browser gets one of these codes and never a provider message, a database
 * error, a stack trace or an internal id. `components/booking/booking-errors`
 * turns each one into the BoLaGio sentence for it, in both languages.
 */
export type BookingErrorCode =
  /** Dates are gone — someone else took them, possibly via Booking.com. */
  | 'availability_conflict'
  /** Minimum stay, maximum stay, or an arrival the provider does not allow. */
  | 'stay_rules'
  /** Party size above the unit's real occupancy. */
  | 'occupancy'
  /** The dates themselves are not a stay: past, inverted, too long. */
  | 'invalid_dates'
  /** Something the guest typed is not usable. */
  | 'invalid_input'
  /** The quote the guest is acting on has aged out. Re-quote and show again. */
  | 'quote_expired'
  /** The inventory hold ran out before payment completed. */
  | 'hold_expired'
  /** Beds24 is unreachable or erroring. Never fall back to fake availability. */
  | 'provider_unavailable'
  /** This unit is not connected to a provider, or is not bookable. */
  | 'not_bookable'
  /** We could not open the payment page. Nothing has been charged. */
  | 'payment_handoff_failed'
  /** Too many attempts from one source. */
  | 'rate_limited'
  /** Direct booking is switched off. Not a fault; a launch gate. */
  | 'booking_disabled'
  /**
   * The approved booking terms (cancellation policy, withdrawal notice, AGB)
   * are not configured. Fail closed: no hold, no payment.
   */
  | 'terms_unavailable'
  /**
   * The terms changed between the moment the guest saw them and the moment
   * they pressed the button. They are shown the current ones and press again.
   */
  | 'terms_changed'
  /**
   * We cannot tell what a provider did. The guest is told to wait and NOT to
   * retry, because retrying is exactly what would double-book or double-charge
   * them. A person is already looking.
   */
  | 'pending_verification'
  /** Anything else. Deliberately opaque. */
  | 'unexpected';

export interface BookingErrorBody {
  error: BookingErrorCode;
  /**
   * Optional, non-identifying detail the UI may use to be more helpful —
   * e.g. the minimum stay that was violated. Never free text from a provider.
   */
  meta?: Record<string, number | string | boolean>;
}

/* ── Analytics ─────────────────────────────────────────────────────────── */

/**
 * The booking funnel, as events.
 *
 * No analytics vendor is installed in this repository and this task does not
 * add one. These are the hooks a future one plugs into, and the type is the
 * contract that keeps guest personal data out of them: an event may carry a
 * unit slug, a night count and a party size, and may not carry a name, an
 * email, a phone number or a booking reference.
 */
export type BookingAnalyticsEvent =
  | 'booking_calendar_opened'
  | 'booking_dates_selected'
  | 'booking_quote_loaded'
  | 'booking_started'
  | 'guest_details_completed'
  | 'payment_method_selected'
  | 'payment_started'
  | 'booking_confirmed';
