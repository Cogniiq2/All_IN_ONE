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

import { holdMinutes, inventoryMonths, quoteMinutes } from '@/lib/booking/config';
import { createLogger, type BookingLogger } from '@/lib/booking/logger';
import { bookingIdempotencyKey, newBookingReference } from '@/lib/booking/reference';
import {
  createIntent,
  findIntentByIdempotencyKey,
  findUnitBySlug,
  listBookableUnits,
  logTransition,
  OverlappingHoldError,
  readInventory,
  updateIntent,
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
import { apply, isHoldExpired, isQuoteExpired } from '@/lib/booking/state-machine';
import type {
  AvailabilityCalendar,
  BookingErrorBody,
  BookingErrorCode,
  BookingIntentView,
  BookingQuote,
  BookingStatus,
  GuestDetails,
  IsoDate,
  PaymentProvider,
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
 * Create the booking intent and block the inventory.
 *
 * ── Overbooking protection, step by step ─────────────────────────────────
 *  1. The unit, its occupancy and its provider mapping come from the database.
 *  2. The stay is revalidated in shape and against the cached calendar.
 *  3. Beds24 is asked LIVE for an offer. If Booking.com took the dates while
 *     the guest was typing their name, this is where it surfaces — as an
 *     availability conflict, not a 500.
 *  4. The intent is created under an idempotency key. A second concurrent
 *     submission loses the unique-index race and is handed the same row.
 *  5. The hold is created at Beds24, which pushes the closed night out to
 *     Booking.com and Airbnb.
 *  6. The database's exclusion constraint refuses a second active hold
 *     overlapping the same unit, whatever the provider said.
 *
 * The total written to the row is the one Beds24 just returned. Nothing the
 * browser sent is read as an amount at any point.
 */
export async function startBooking(
  input: StartBookingInput,
  logger: BookingLogger = createLogger()
): Promise<{ intent: BookingIntentView; quote: BookingQuote }> {
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
  // holds inventory, that hold is the answer — creating another would be the
  // duplicate booking this whole mechanism exists to prevent.
  const existing = await findIntentByIdempotencyKey(idempotencyKey);
  if (existing && existing.beds24BookingId && !isHoldExpired(existing.status, existing.holdExpiresAt)) {
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

  const quoted = await transition(intent, 'quoted', logger, {
    quotedTotalCents: quote.totalCents,
    quoteComponents: quote.components,
    currency: quote.currency,
    quoteExpiresAt: quote.expiresAt,
  });

  const holdExpiresAt = new Date(Date.now() + holdMinutes() * 60_000).toISOString();

  let held: IntentRecord;
  try {
    const booking = await bookingProvider().createHold({
      unit: unit.providerRef!,
      unitSlug: unit.slug,
      reference: quoted.reference,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults,
      children: input.children,
      guest,
      totalCents: quote.totalCents,
      currency: quote.currency,
      idempotencyKey,
      holdExpiresAt,
    });

    held = await transition(quoted, 'hold_created', logger, {
      beds24BookingId: booking.externalBookingId,
      holdExpiresAt,
      providerSnapshot: booking.snapshot,
    });

    logger.info('beds24.hold', {
      reference: held.reference,
      providerBookingId: booking.externalBookingId,
      unitSlug: unit.slug,
    });
  } catch (cause) {
    const error = fromProvider(cause);
    logger.warn('beds24.hold', { reference: quoted.reference, errorCode: error.code });
    // The intent stays in the database in a non-holding status. It is a record
    // of an attempt, not a reservation, and it cannot block anyone's dates.
    await transition(quoted, 'cancelled', logger, {}, `hold_failed:${error.code}`).catch(() => {});
    throw error;
  }

  return { intent: toView(held), quote };
}

/* ── Payment handoff ───────────────────────────────────────────────────── */

/**
 * Move a held intent to `payment_pending`.
 *
 * The amount is NOT a parameter. The caller supplies a reference and a
 * provider; everything chargeable is read back out of the row that the server
 * itself wrote from a Beds24 offer. This is the single most important line of
 * defence against a browser that edits a price before submitting it.
 */
export async function beginPayment(
  reference: string,
  provider: PaymentProvider,
  logger: BookingLogger = createLogger()
): Promise<IntentRecord> {
  const intent = await requireIntent(reference);

  if (isHoldExpired(intent.status, intent.holdExpiresAt)) {
    await transition(intent, 'expired', logger, {}, 'hold_expired');
    throw new BookingError('hold_expired');
  }
  if (isQuoteExpired(intent.quoteExpiresAt)) {
    throw new BookingError('quote_expired');
  }
  if (!intent.quotedTotalCents || intent.quotedTotalCents <= 0) {
    throw new BookingError('unexpected');
  }

  // Already handed off. Returning the same session rather than opening a
  // second one is what stops a refresh from creating two Stripe checkouts.
  if (intent.status === 'payment_pending' && intent.paymentSessionId) return intent;

  return transition(intent, 'payment_pending', logger, { paymentProvider: provider });
}

export async function attachPaymentSession(
  intent: IntentRecord,
  sessionId: string
): Promise<IntentRecord> {
  return (await updateIntent(intent.id, { paymentSessionId: sessionId })) ?? intent;
}

/* ── Payment outcome ───────────────────────────────────────────────────── */

export type PaymentOutcome = 'succeeded' | 'failed' | 'cancelled' | 'expired';

/**
 * Apply a payment result that a TRUSTED caller reported.
 *
 * "Trusted" means the shared secret was verified by the route handler. A
 * browser arriving at a success URL never reaches this function; that is the
 * whole point of the separation.
 *
 * Idempotent in both directions:
 *   • the same outcome twice is a quiet success (the state machine's 'noop');
 *   • a late `failed` after a `confirmed` is refused, because a guest who has
 *     paid does not lose their stay to a retried webhook.
 */
export async function settlePayment(
  reference: string,
  outcome: PaymentOutcome,
  logger: BookingLogger = createLogger(),
  detail?: { paymentSessionId?: string }
): Promise<BookingIntentView> {
  const intent = await requireIntent(reference);
  const provider = bookingProvider();

  if (outcome === 'succeeded') {
    // A hold that ran out while the guest was paying means the nights went
    // back on sale. The payment is real, so this is not a silent failure — it
    // becomes 'paid' and stops there, awaiting a human, rather than being
    // announced as a confirmed reservation that Beds24 does not have.
    if (isHoldExpired(intent.status, intent.holdExpiresAt)) {
      logger.warn('payment.callback', { reference, outcome: 'paid_after_hold_expiry' });
      const paid = await transition(intent, 'paid', logger, detail?.paymentSessionId
        ? { paymentSessionId: detail.paymentSessionId }
        : {}, 'hold_expired_before_payment');
      return toView(paid);
    }

    const paid = await transition(
      intent,
      'paid',
      logger,
      detail?.paymentSessionId ? { paymentSessionId: detail.paymentSessionId } : {}
    );
    if (paid.status !== 'paid') return toView(paid); // already past 'paid'

    if (paid.beds24BookingId) {
      try {
        const booking = await provider.confirmBooking(paid.beds24BookingId);
        const confirmed = await transition(paid, 'confirmed', logger, {
          providerSnapshot: booking.snapshot,
          holdExpiresAt: null,
        });
        logger.info('beds24.confirm', {
          reference,
          providerBookingId: paid.beds24BookingId,
          amountCents: paid.quotedTotalCents ?? undefined,
        });
        return toView(confirmed);
      } catch (cause) {
        // Money taken, provider would not confirm. It stays 'paid' — never
        // 'confirmed' — so no screen anywhere tells the guest their stay is
        // secured when the channel manager does not agree.
        logger.error('beds24.confirm', cause, { reference });
        return toView(paid);
      }
    }
    return toView(paid);
  }

  const to: BookingStatus = outcome === 'failed' ? 'payment_failed' : 'expired';
  const next = await transition(intent, to, logger, {}, `payment_${outcome}`);
  // Give the nights back. A guest who abandoned a checkout must not cost a
  // sellable night for the rest of the hold window.
  await releaseIfHeld(next, `payment_${outcome}`, logger);
  return toView(next);
}

/** Release a Beds24 hold, tolerating a hold that is already gone. */
export async function releaseIfHeld(
  intent: IntentRecord,
  reason: string,
  logger: BookingLogger
): Promise<void> {
  if (!intent.beds24BookingId) return;
  if (intent.status === 'confirmed' || intent.status === 'paid') return;
  try {
    await bookingProvider().releaseHold(intent.beds24BookingId, reason);
    logger.info('beds24.hold_release', {
      reference: intent.reference,
      providerBookingId: intent.beds24BookingId,
      outcome: reason,
    });
  } catch (cause) {
    // Logged, not thrown. The BoLaGio-side status is already correct, and the
    // next inventory sync reconciles whatever Beds24 still thinks.
    logger.error('beds24.hold_release', cause, { reference: intent.reference });
  }
}

/** Sweep holds that ran out. Called by the scheduled sync. */
export async function expireStaleHolds(
  intents: IntentRecord[],
  logger: BookingLogger
): Promise<number> {
  let released = 0;
  for (const intent of intents) {
    const expired = await transition(intent, 'expired', logger, {}, 'hold_timeout').catch(() => null);
    if (!expired) continue;
    await releaseIfHeld(expired, 'hold_timeout', logger);
    released += 1;
  }
  return released;
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

async function requireBookableUnit(slug: string): Promise<BookableUnit> {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{2,64}$/.test(slug)) {
    throw new BookingError('invalid_input');
  }
  const unit = await findUnitBySlug(slug);
  if (!unit || !unit.isBookable || !unit.providerRef) throw new BookingError('not_bookable');
  return unit;
}

async function requireIntent(reference: string): Promise<IntentRecord> {
  const { findIntentByReference } = await import('@/lib/booking/repository');
  const intent = await findIntentByReference(reference);
  if (!intent) throw new BookingError('invalid_input');
  return intent;
}

/**
 * Move an intent, through the state machine and with a compare-and-set write.
 *
 * `apply()` decides whether the move is legal at all; `expectedStatus` on the
 * update makes the write lose cleanly if something else moved the row first.
 * Together those two are why concurrent callbacks cannot corrupt a booking.
 */
async function transition(
  intent: IntentRecord,
  to: BookingStatus,
  logger: BookingLogger,
  patch: Parameters<typeof updateIntent>[1] = {},
  reason?: string
): Promise<IntentRecord> {
  const outcome = apply(intent.status, to);

  if (outcome === 'noop') return intent;
  if (outcome === 'illegal') {
    logger.warn('intent.transition', {
      reference: intent.reference,
      fromStatus: intent.status,
      toStatus: to,
      outcome: 'illegal',
    });
    return intent;
  }

  const updated = await updateIntent(intent.id, { ...patch, status: to }, intent.status);
  if (!updated) {
    // Something else moved it between the read and the write. Whatever it did
    // is at least as current as what we were about to do.
    logger.warn('intent.transition', {
      reference: intent.reference,
      fromStatus: intent.status,
      toStatus: to,
      outcome: 'lost-race',
    });
    return intent;
  }

  logger.info('intent.transition', {
    reference: intent.reference,
    fromStatus: intent.status,
    toStatus: to,
    outcome: reason ?? 'applied',
  });
  await logTransition({
    intentId: intent.id,
    from: intent.status,
    to,
    reason,
    correlationId: logger.correlationId,
  });

  return updated;
}

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
