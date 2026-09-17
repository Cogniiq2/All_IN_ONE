import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BOOKING SERVICE — where the rules are actually enforced.
 *
 * Route handlers parse and respond. This file decides. Nothing it does trusts
 * the browser:
 *
 *   • the unit comes from the database, by slug, not from the request body;
 *   • occupancy comes from the unit record, not from a constant in a component;
 *   • availability comes from Beds24, live, at the moment it matters;
 *   • the total comes from a Beds24 offer and is written server-side. A
 *     client-submitted amount is never read, anywhere, in any code path.
 *
 * ── Ordering, and why it is this way round ───────────────────────────────
 *
 *   browse       Supabase cache            instant, may be stale
 *   quote        LIVE Beds24               authoritative availability + price
 *   book         LIVE Beds24 revalidate → HOLD → pay → confirm
 *
 * The hold is created BEFORE the payment, not after. "Take the money, then
 * make the booking" is the race that sells one night twice: between the card
 * clearing and the reservation landing, Booking.com can take the same dates
 * and there is nothing left to give the guest but an apology and a refund.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { directBookingEnabled, inventoryMonths, quoteMinutes } from '@/lib/booking/config';
import { transitionIntent } from '@/lib/booking/commands';
import { acquireHold, HoldError } from '@/lib/booking/hold';
import { evaluateLease } from '@/lib/booking/lease';
import { releaseHold as releaseHoldSaga } from '@/lib/booking/release';
import { quoteHashOf } from '@/lib/booking/quote-hash';
import { createLogger, type BookingLogger } from '@/lib/booking/logger';
import { bookingIdempotencyKey, newBookingReference } from '@/lib/booking/reference';
import {
  createIntent,
  findIntentByIdempotencyKey,
  findUnitBySlug,
  listBookableUnits,
  OverlappingHoldError,
  readInventory,
  upsertInventory,
  type BookableUnit,
  type IntentRecord,
} from '@/lib/booking/repository';
import {
  addDays,
  nightsBetween,
  propertyToday,
  validateAgainstCalendar,
  validateStayShape,
  type StayRequest,
} from '@/lib/booking/stay-rules';
import { isHoldExpired, isQuoteExpired } from '@/lib/booking/state-machine';
import { reservesInventory } from '@/lib/booking/states';
import type {
  AvailabilityCalendar,
  BookingErrorBody,
  BookingErrorCode,
  BookingIntentView,
  BookingQuote,
  GuestDetails,
  IsoDate,
} from '@/lib/booking/types';
import { bookingProvider } from '@/lib/integrations/beds24';
import { ProviderError } from '@/lib/integrations/provider';

/** Thrown out of the service; route handlers turn it into a JSON body. */
export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    readonly meta?: Record<string, number | string | boolean>
  ) {
    super(code);
    this.name = 'BookingError';
  }
}

function fromBody(body: BookingErrorBody): BookingError {
  return new BookingError(body.error, body.meta);
}

/**
 * A provider failure, translated.
 *
 * `unavailable` becomes `provider_unavailable`, which the UI renders as "live
 * availability is temporarily unavailable — please try again shortly". It is
 * never rendered as "no nights free", because those are different facts and
 * the guest deserves the true one.
 */
function fromProvider(error: unknown): BookingError {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case 'availability_conflict':
        return new BookingError('availability_conflict');
      case 'stay_rules':
        return new BookingError('stay_rules', error.meta);
      case 'rejected':
        return new BookingError('unexpected');
      default:
        return new BookingError('provider_unavailable');
    }
  }
  if (error instanceof OverlappingHoldError) return new BookingError('availability_conflict');
  if (error instanceof BookingError) return error;
  return new BookingError('unexpected');
}

/* ── Occupancy ─────────────────────────────────────────────────────────── */

/**
 * The real ceiling for a unit.
 *
 * Read from the unit record. `MAX_GUESTS` in the old availability module was a
 * single number for the whole portfolio, which was honest while there were two
 * identical flats and becomes wrong the moment Opernstraße III sleeps six. The
 * fallback exists only for a unit whose occupancy the owners have not yet
 * confirmed, and it is the conservative direction: fewer guests offered, never
 * more.
 */
export const FALLBACK_MAX_GUESTS = 4;

export function occupancyFor(unit: BookableUnit): number {
  return unit.maxGuests ?? FALLBACK_MAX_GUESTS;
}

/* ── Availability (cached) ─────────────────────────────────────────────── */

/**
 * The calendar the browser paints.
 *
 * Served from Supabase, never from Beds24: a visitor idly paging through
 * months must not generate a provider call per month, and the difference
 * between 8 ms and 800 ms is the difference between a premium calendar and a
 * spinner.
 */
export async function getAvailability(
  unitSlug: string,
  window: { from?: IsoDate; to?: IsoDate },
  logger: BookingLogger = createLogger()
): Promise<AvailabilityCalendar> {
  const unit = await findUnitBySlug(unitSlug);
  const today = propertyToday();
  const from = window.from && window.from > today ? window.from : today;
  const horizon = horizonEnd(today);
  const to = window.to && window.to < horizon ? window.to : horizon;

  if (!unit || !unit.isBookable || !unit.providerRef) {
    // Not an error and not an empty calendar: a unit with no connected source
    // is `unsourced`, and the UI keeps its existing "we confirm your dates
    // personally" behaviour rather than implying every night is free.
    logger.info('availability.read', { unitSlug, outcome: 'unsourced' });
    return { unitSlug, from, to, currency: 'EUR', days: [], unsourced: true };
  }

  const { days, syncedAt } = await readInventory(unit.id, from, to);
  logger.info('availability.read', { unitSlug, from, to, count: days.length });

  return {
    unitSlug,
    from,
    to,
    currency: unit.currency,
    days,
    syncedAt,
    // No inventory at all means the sync has never run for this unit. Saying
    // so is honest; painting an empty month as bookable is not.
    unsourced: days.length === 0,
  };
}

function horizonEnd(today: IsoDate): IsoDate {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + inventoryMonths(), d)).toISOString().slice(0, 10);
}

/* ── Quote (live) ──────────────────────────────────────────────────────── */

export interface QuoteInput extends StayRequest {
  unitSlug: string;
}

/**
 * The authoritative answer for a concrete stay.
 *
 * Three gates in order, cheapest first: the shape of the request, the cached
 * calendar, then Beds24 itself. The first two exist so an obviously impossible
 * stay never costs a provider call; only the third is authoritative.
 */
export async function getQuote(
  input: QuoteInput,
  logger: BookingLogger = createLogger()
): Promise<BookingQuote> {
  const unit = await requireBookableUnit(input.unitSlug);

  const shapeError = validateStayShape(input, {
    maxGuests: occupancyFor(unit),
    minNights: unit.minNights ?? undefined,
  });
  if (shapeError) throw fromBody(shapeError);

  const { days } = await readInventory(unit.id, input.checkIn, addDays(input.checkOut, 1));
  const cacheError = validateAgainstCalendar(input, days);
  if (cacheError) throw fromBody(cacheError);

  const started = Date.now();
  try {
    const quote = await bookingProvider().fetchOffer({
      unit: unit.providerRef!,
      unitSlug: unit.slug,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
    });
    logger.info('beds24.offer', {
      unitSlug: unit.slug,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      amountCents: quote.totalCents,
      currency: quote.currency,
      durationMs: Date.now() - started,
    });
    return quote;
  } catch (cause) {
    const error = fromProvider(cause);
    logger.warn('beds24.offer', {
      unitSlug: unit.slug,
      errorCode: error.code,
      durationMs: Date.now() - started,
    });
    throw error;
  }
}

/* ── Booking: intent + hold ────────────────────────────────────────────── */

export interface StartBookingInput extends StayRequest {
  unitSlug: string;
  guest: GuestDetails;
  /** Distinguishes a deliberate retry from a double-click. Never an amount. */
  attemptId?: string;
}

/**
 * Create the booking intent and reserve the inventory.
 *
 * ── Order of operations, and why it changed ──────────────────────────────
 *  1. The launch gate. A curl request runs into this, not just a hidden button.
 *  2. The unit, its occupancy and its provider mapping come from the database.
 *  3. The stay is revalidated in shape and against the cached calendar.
 *  4. The intent is created under an idempotency key, so a double-click, a
 *     retried fetch and a page refresh all land on one row.
 *  5. A LIVE Beds24 offer sets the authoritative total. Nothing the browser
 *     sent is read as an amount at any point.
 *  6. `acquireHold` takes the LOCAL lock first, then the Beds24 hold, then
 *     verifies both. Locking locally first is the change that makes concurrent
 *     direct bookings safe — see the header of lib/booking/hold.ts.
 */
export async function startBooking(
  input: StartBookingInput,
  logger: BookingLogger = createLogger()
): Promise<{ intent: BookingIntentView; quote: BookingQuote }> {
  requireDirectBooking();
  const unit = await requireBookableUnit(input.unitSlug);

  const shapeError = validateStayShape(input, {
    maxGuests: occupancyFor(unit),
    minNights: unit.minNights ?? undefined,
  });
  if (shapeError) throw fromBody(shapeError);

  const guest = normaliseGuest(input.guest);

  const idempotencyKey = await bookingIdempotencyKey({
    unitSlug: unit.slug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    email: guest.email,
    attemptId: input.attemptId,
  });

  // A second press of the same button finds the first attempt. If it already
  // holds inventory, that hold IS the answer — creating another would be the
  // duplicate booking this whole mechanism exists to prevent.
  const existing = await findIntentByIdempotencyKey(idempotencyKey);
  if (existing && existing.beds24BookingId && reservesInventory(existing.status)) {
    logger.info('intent.create', { reference: existing.reference, outcome: 'idempotent-replay' });
    return { intent: toView(existing), quote: quoteFromIntent(existing) };
  }

  const quote = await getQuote(
    {
      unitSlug: unit.slug,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
    },
    logger
  );

  const intent =
    existing ??
    (await createIntent({
      reference: newBookingReference(),
      unitId: unit.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
      currency: quote.currency,
      guest,
      idempotencyKey,
      // Attribution is written into the row at creation, never inferred later
      // from a label. This website only ever produces direct bookings.
      source: 'direct',
    }));

  logger.info('intent.create', {
    reference: intent.reference,
    unitSlug: unit.slug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: quote.nights,
    amountCents: quote.totalCents,
    currency: quote.currency,
  });

  const quoted = await transitionIntent(
    intent.id,
    {
      expected: intent.status,
      to: 'quoted',
      reason: 'quote_attached',
      patch: {
        quotedTotalCents: quote.totalCents,
        quoteComponents: quote.components,
        quoteHash: await quoteHashOf(quote),
        currency: quote.currency,
        quoteExpiresAt: quote.expiresAt,
      },
    },
    logger
  );
  if (!quoted) throw new BookingError('unexpected');

  try {
    const { intent: held } = await acquireHold(quoted, unit, quote, logger);
    return { intent: toView(held), quote };
  } catch (cause) {
    throw fromHoldFailure(cause);
  }
}

/**
 * A hold saga failure, translated for the guest.
 *
 * The `uncertain` branch is the one that matters. It becomes
 * `pending_verification`, whose copy tells the guest to WAIT and explicitly not
 * to try again — because a retry is precisely what would create the second
 * Beds24 booking. Every other branch invites a retry, because in every other
 * branch nothing was created.
 */
function fromHoldFailure(cause: unknown): BookingError {
  if (!(cause instanceof HoldError)) return fromProvider(cause);
  switch (cause.failure.kind) {
    case 'conflict':
      return new BookingError('availability_conflict');
    case 'stay_rules':
      return new BookingError('stay_rules', cause.failure.meta);
    case 'unavailable':
      return new BookingError('provider_unavailable');
    case 'uncertain':
      return new BookingError('pending_verification');
    default:
      return new BookingError('unexpected');
  }
}

/* ── Release ───────────────────────────────────────────────────────────── */

/**
 * Give a hold back, verified.
 *
 * Delegates to the release saga, which refuses outright for anything on the
 * paid side and leaves the local range RESERVED when it cannot prove the
 * nights reopened. The old implementation logged a failed release and freed
 * the range anyway — see docs/booking-core-audit.md §2.3.
 */
export async function releaseIfHeld(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<void> {
  await releaseHoldSaga(intent, reason, logger);
}

/**
 * Sweep holds whose lease ran out.
 *
 * `evaluateLease` decides, not the clock. A lease running out is permission to
 * ASK whether the guest paid, never permission to cancel — see the header of
 * lib/booking/lease.ts for the ordering this protects against.
 */
export async function expireStaleHolds(
  intents: IntentRecord[],
  logger: BookingLogger
): Promise<{ released: number; heldForPayment: number }> {
  let released = 0;
  let heldForPayment = 0;

  for (const intent of intents) {
    const decision = await evaluateLease(intent, logger);
    if (decision.action !== 'release') {
      if (decision.action === 'hold') heldForPayment += 1;
      continue;
    }
    const expired = await transitionIntent(
      intent.id,
      {
        expected: intent.status,
        to: 'expired',
        reason: 'lease_expired',
        patch: { lastFailureCode: 'BOOKING_LEASE_EXPIRED' },
        outbox: {
          type: 'booking.expired',
          payload: { reference: intent.reference, unitSlug: intent.unitSlug },
        },
      },
      logger
    );
    if (!expired) continue;
    const result = await releaseHoldSaga(expired, 'lease_expired', logger);
    if (result.outcome === 'released' || result.outcome === 'nothing_to_release') released += 1;
  }

  return { released, heldForPayment };
}

/* ── Inventory synchronisation ─────────────────────────────────────────── */

/**
 * Pull the horizon from Beds24 into Supabase, one bulk call per unit.
 *
 * A failure on one unit does not abandon the rest: the others are still worth
 * refreshing, and the failed one keeps its previous cache until it succeeds.
 */
export async function syncInventory(
  logger: BookingLogger = createLogger(),
  onlySlug?: string
): Promise<{ units: number; days: number; failed: string[] }> {
  const all = await listBookableUnits();
  const units = onlySlug ? all.filter((u) => u.slug === onlySlug) : all;

  const today = propertyToday();
  const to = horizonEnd(today);
  const provider = bookingProvider();

  let days = 0;
  const failed: string[] = [];

  for (const unit of units) {
    if (!unit.providerRef) continue;
    const started = Date.now();
    try {
      const inventory = await provider.fetchAvailability({ unit: unit.providerRef, from: today, to });
      days += await upsertInventory(unit.id, inventory, unit.currency);
      logger.info('inventory.sync', {
        unitSlug: unit.slug,
        from: today,
        to,
        count: inventory.length,
        mode: provider.mode,
        durationMs: Date.now() - started,
      });
    } catch (cause) {
      failed.push(unit.slug);
      logger.error('inventory.sync', cause, { unitSlug: unit.slug, mode: provider.mode });
    }
  }

  return { units: units.length, days, failed };
}

/* ── Shared helpers ────────────────────────────────────────────────────── */

/**
 * The launch gate, checked before anything that can reserve inventory or
 * create a payment order.
 *
 * A hidden frontend button is not a gate. This is: a curl request to the
 * command endpoints runs into it, and the per-unit `is_bookable` flag in the
 * database is the second, independent one.
 */
export function requireDirectBooking(): void {
  if (!directBookingEnabled()) throw new BookingError('booking_disabled');
}

async function requireBookableUnit(slug: string): Promise<BookableUnit> {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{2,64}$/.test(slug)) {
    throw new BookingError('invalid_input');
  }
  const unit = await findUnitBySlug(slug);
  if (!unit || !unit.isBookable || !unit.providerRef) throw new BookingError('not_bookable');
  return unit;
}

export async function requireIntent(reference: string): Promise<IntentRecord> {
  const { findIntentByReference } = await import('@/lib/booking/repository');
  const intent = await findIntentByReference(reference);
  if (!intent) throw new BookingError('invalid_input');
  return intent;
}

/*
 * The old `transition()` helper lived here.
 *
 * It applied the state machine in TypeScript and wrote the status with a
 * compare-and-set — correct, but only for callers who remembered to use it,
 * and the audit row was a separate write that could fail on its own. Both are
 * now `bolagio_booking_transition()` in PostgreSQL: the machine, the
 * compare-and-set, the audit row and the outbox row in one transaction, with a
 * trigger that refuses any status change made another way.
 *
 * The typed wrapper is `transitionIntent` in lib/booking/commands.ts.
 */

function normaliseGuest(guest: GuestDetails): GuestDetails {
  return {
    firstName: guest.firstName.trim().slice(0, 100),
    lastName: guest.lastName.trim().slice(0, 100),
    email: guest.email.trim().toLowerCase().slice(0, 254),
    phone: guest.phone.trim().slice(0, 40),
    country: guest.country?.trim().toUpperCase().slice(0, 2) || undefined,
    locale: guest.locale === 'en' ? 'en' : 'de',
  };
}

export function toView(intent: IntentRecord): BookingIntentView {
  return {
    reference: intent.reference,
    status: intent.status,
    unitSlug: intent.unitSlug,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    nights: nightsBetween(intent.checkIn, intent.checkOut),
    adults: intent.adults,
    children: intent.children,
    currency: intent.currency,
    totalCents: intent.quotedTotalCents,
    components: intent.quoteComponents,
    holdExpiresAt: intent.holdExpiresAt ?? undefined,
    // What the MONEY is doing, separately from the reservation. The return
    // page needs both to tell "we are still confirming your payment" apart
    // from "your payment did not go through".
    paymentStatus: intent.paymentStatus,
  };
}

function quoteFromIntent(intent: IntentRecord): BookingQuote {
  return {
    unitSlug: intent.unitSlug,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    nights: nightsBetween(intent.checkIn, intent.checkOut),
    adults: intent.adults,
    children: intent.children,
    currency: intent.currency,
    totalCents: intent.quotedTotalCents ?? 0,
    components: intent.quoteComponents,
    expiresAt: intent.quoteExpiresAt ?? new Date(Date.now() + quoteMinutes() * 60_000).toISOString(),
  };
}
