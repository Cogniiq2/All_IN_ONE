import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATA ACCESS for the booking foundation.
 *
 * Every read and write of a `bolagio_*` table happens here. Route handlers and
 * the service layer call functions with domain names; nothing above this file
 * writes a `.from('bolagio_…')` or knows a column name.
 *
 * Row shapes are declared locally rather than generated, because the generator
 * needs a live project and none exists yet. When the migration is applied,
 * `supabase gen types typescript` can replace these — the surface is the same.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type {
  BookingSource,
  BookingStatus,
  GuestDetails,
  InventoryDay,
  IsoDate,
  PaymentProvider,
  PaymentStatus,
  QuoteComponent,
} from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';
import { parseAcceptedVersions, type AcceptedTermsVersions } from '@/lib/legal/booking-terms';
import { HOUSE_RULES, PROPERTY_TIMEZONE } from '@/lib/booking/property-config';

/* ── Units and provider mapping ─────────────────────────────────────────── */

export interface UnitRecord {
  id: string;
  slug: string;
  displayName: string;
  maxGuests: number | null;
  minNights: number | null;
  currency: string;
  isBookable: boolean;
  /** The unit's operational clock. From the row; defaults are the house rules. */
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
}

export interface BookableUnit extends UnitRecord {
  /** Present only when a provider mapping exists and is enabled. */
  providerRef?: ProviderUnitRef;
}

/**
 * A unit and, if it has one, where it lives at the provider.
 *
 * One query rather than two. `unsourced` downstream means the left join found
 * nothing — a unit BoLaGio knows about that no channel manager is driving yet,
 * which is exactly the Opernstraße case today.
 */
export async function findUnitBySlug(slug: string): Promise<BookableUnit | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_units')
    .select(
      'id, slug, display_name, max_guests, min_nights, currency, is_bookable, timezone, check_in_time, check_out_time,' +
        ' bolagio_unit_integrations(provider, external_property_id, external_room_id, enabled)'
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toBookableUnit(data as unknown as UnitRow);
}

export async function listBookableUnits(): Promise<BookableUnit[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_units')
    .select(
      'id, slug, display_name, max_guests, min_nights, currency, is_bookable, timezone, check_in_time, check_out_time,' +
        ' bolagio_unit_integrations(provider, external_property_id, external_room_id, enabled)'
    )
    .eq('is_bookable', true);

  if (error) throw error;
  return ((data ?? []) as unknown as UnitRow[]).map(toBookableUnit);
}

interface UnitRow {
  id: string;
  slug: string;
  display_name: string;
  max_guests: number | null;
  min_nights: number | null;
  currency: string;
  is_bookable: boolean;
  timezone?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  bolagio_unit_integrations?: Array<{
    provider: 'beds24';
    external_property_id: string;
    external_room_id: string;
    enabled: boolean;
  }> | null;
}

function toBookableUnit(row: UnitRow): BookableUnit {
  const mapping = (row.bolagio_unit_integrations ?? []).find((m) => m.enabled);
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    maxGuests: row.max_guests,
    minNights: row.min_nights,
    currency: row.currency,
    isBookable: row.is_bookable,
    timezone: row.timezone || PROPERTY_TIMEZONE,
    checkInTime: (row.check_in_time || HOUSE_RULES.checkInTime).slice(0, 5),
    checkOutTime: (row.check_out_time || HOUSE_RULES.checkOutTime).slice(0, 5),
    providerRef: mapping
      ? {
          provider: mapping.provider,
          externalPropertyId: mapping.external_property_id,
          externalRoomId: mapping.external_room_id,
        }
      : undefined,
  };
}

/* ── Inventory cache ────────────────────────────────────────────────────── */

export async function readInventory(
  unitId: string,
  from: IsoDate,
  to: IsoDate
): Promise<{ days: InventoryDay[]; syncedAt?: string }> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_unit_inventory_days')
    .select('date, is_available, can_check_in, can_check_out, min_stay, max_stay, display_price_cents, synced_at')
    .eq('unit_id', unitId)
    .gte('date', from)
    .lt('date', to)
    .order('date', { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  return {
    days: rows.map((r) => ({
      date: r.date as IsoDate,
      available: Boolean(r.is_available),
      canCheckIn: Boolean(r.can_check_in),
      canCheckOut: Boolean(r.can_check_out),
      minStay: r.min_stay ?? undefined,
      maxStay: r.max_stay ?? undefined,
      displayPriceCents: r.display_price_cents ?? undefined,
    })),
    // The oldest sync in the window, so staleness is judged by the worst day
    // in it rather than by the most recently touched one.
    syncedAt: rows.reduce<string | undefined>(
      (oldest, r) => (!oldest || (r.synced_at as string) < oldest ? (r.synced_at as string) : oldest),
      undefined
    ),
  };
}

/**
 * Replace a unit's inventory for a window.
 *
 * A bulk upsert in chunks, not a row at a time: 18 months is ~550 rows per
 * unit, and five units at one round trip per row would be 2,750 sequential
 * statements per sync.
 */
export async function upsertInventory(
  unitId: string,
  days: InventoryDay[],
  currency: string
): Promise<number> {
  if (days.length === 0) return 0;
  const syncedAt = new Date().toISOString();
  const rows = days.map((d) => ({
    unit_id: unitId,
    date: d.date,
    is_available: d.available,
    can_check_in: d.canCheckIn,
    can_check_out: d.canCheckOut,
    min_stay: d.minStay ?? null,
    max_stay: d.maxStay ?? null,
    display_price_cents: d.displayPriceCents ?? null,
    currency,
    provider: 'beds24' as const,
    provider_updated_at: syncedAt,
    synced_at: syncedAt,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseAdmin()
      .from('bolagio_unit_inventory_days')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'unit_id,date' });
    if (error) throw error;
  }
  return rows.length;
}

/**
 * Mark a window stale so the next calendar read cannot serve it as fact.
 *
 * Used by the Beds24 webhook: a reservation arriving from Booking.com makes
 * the cached nights wrong immediately, and the honest interim answer is "not
 * available" rather than "available, we just have not resynced".
 */
export async function invalidateInventory(unitId: string, from: IsoDate, to: IsoDate): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('bolagio_unit_inventory_days')
    .update({ is_available: false, can_check_in: false, synced_at: new Date().toISOString() })
    .eq('unit_id', unitId)
    .gte('date', from)
    .lt('date', to);
  if (error) throw error;
}

export async function findUnitByProviderRoom(
  externalPropertyId: string,
  externalRoomId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_unit_integrations')
    .select('unit_id')
    .eq('provider', 'beds24')
    .eq('external_property_id', externalPropertyId)
    .eq('external_room_id', externalRoomId)
    .maybeSingle();
  if (error) throw error;
  return (data?.unit_id as string | undefined) ?? null;
}

/* ── Booking intents ────────────────────────────────────────────────────── */

export interface IntentRecord {
  id: string;
  reference: string;
  unitId: string;
  unitSlug: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  adults: number;
  children: number;
  currency: string;
  quotedTotalCents: number | null;
  quoteComponents: QuoteComponent[];
  status: BookingStatus;
  source: BookingSource;
  beds24BookingId: string | null;
  paymentProvider: PaymentProvider | null;
  paymentSessionId: string | null;
  quoteExpiresAt: string | null;
  holdExpiresAt: string | null;
  guest: GuestDetails | null;

  /* ── Added by the hardening pass ───────────────────────────────────────
   * Everything below answers one question: if every running process
   * disappeared, could a cold reconciliation worker work out what to do from
   * this row alone? Nothing here is a convenience copy.
   */

  /** What the MONEY is doing, separately from what the reservation is doing. */
  paymentStatus: PaymentStatus;
  paymentOrderId: string | null;
  paymentCaptureId: string | null;
  paidAmountCents: number | null;
  paidCurrency: string | null;

  /** The local lock lease. Set while `locking`, cleared once resolved. */
  lockExpiresAt: string | null;

  /**
   * The Beds24 ids the hold was ACTUALLY made with, snapshotted at the time.
   * The mapping table can change; a booking must still be releasable against
   * the ids it was created with, or recovery depends on current configuration
   * being the same as historical configuration.
   */
  beds24PropertyId: string | null;
  beds24RoomId: string | null;
  beds24Status: string | null;
  beds24VerifiedAt: string | null;

  quoteHash: string | null;
  lastFailureCode: string | null;
  reconciliationState: 'ok' | 'pending' | 'failed' | 'manual';
  confirmedAt: string | null;
  paidAt: string | null;

  /* ── Cancellation and refund: orthogonal to the status ─────────────── */
  refundedAmountCents: number;
  cancellationRequestedAt: string | null;
  cancellationRequestedBy: string | null;
  cancellationReason: string | null;
  /** Non-null means a person took responsibility for ending a booking with payment evidence. */
  cancellationAuthorizedBy: string | null;
  cancellationCompletedAt: string | null;
  refundState: RefundState;
  refundRequiredCents: number | null;
  refundId: string | null;
}

export type RefundState = 'none' | 'not_required' | 'required' | 'pending' | 'completed' | 'unknown' | 'failed';

const INTENT_COLUMNS =
  'id, reference, unit_id, check_in, check_out, adults, children, currency,' +
  ' quoted_total_cents, quote_components, status, source, beds24_booking_id,' +
  ' payment_provider, payment_session_id, quote_expires_at, hold_expires_at,' +
  ' guest_first_name, guest_last_name, guest_email, guest_phone, country, locale,' +
  ' payment_status, payment_order_id, payment_capture_id, paid_amount_cents, paid_currency,' +
  ' lock_expires_at, beds24_property_id, beds24_room_id, beds24_status, beds24_verified_at,' +
  ' quote_hash, last_failure_code, reconciliation_state, confirmed_at, paid_at,' +
  ' refunded_amount_cents, cancellation_requested_at, cancellation_requested_by, cancellation_reason,' +
  ' cancellation_authorized_by, cancellation_completed_at, refund_state, refund_required_cents, refund_id,' +
  ' bolagio_units(slug)';

/**
 * Raised when the database's overlap exclusion constraint refuses a hold.
 *
 * This is the last line of overbooking defence firing, and it is a conflict to
 * be shown to the guest, not a server error to be swallowed.
 */
export class OverlappingHoldError extends Error {
  constructor() {
    super('An active hold already covers these dates');
    this.name = 'OverlappingHoldError';
  }
}

export interface CreateIntentInput {
  reference: string;
  unitId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  adults: number;
  children: number;
  currency: string;
  guest: GuestDetails;
  idempotencyKey: string;
  source: BookingSource;
  /**
   * Which versions of the cancellation policy, withdrawal notice, AGB,
   * privacy notice and price statement the guest was shown when they pressed
   * the booking button — the evidence of what they agreed to. Written once,
   * with the row. See lib/legal/booking-terms.ts.
   */
  termsEvidence?: TermsEvidence;
}

export interface TermsEvidence {
  versions: AcceptedTermsVersions;
  acceptedAt: string;
  locale: 'de' | 'en';
}

/**
 * The terms evidence of one booking, read on its own.
 *
 * Deliberately NOT part of INTENT_COLUMNS: every admin screen reads intents
 * through that list, and a column that only exists after the 2026-09-25
 * migration must not be able to break them on a database that has not had it
 * yet. Only the confirmation email reads this, and it refuses to render when
 * the evidence cannot be read — which is the fail-closed direction.
 */
export async function readTermsEvidence(intentId: string): Promise<TermsEvidence | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select('terms_evidence')
    .eq('id', intentId)
    .maybeSingle();
  if (error) throw error;
  const raw = (data as { terms_evidence?: unknown } | null)?.terms_evidence;
  if (typeof raw !== 'object' || raw === null) return null;
  const evidence = raw as Record<string, unknown>;
  const versions = parseAcceptedVersions(evidence.versions);
  if (!versions || typeof evidence.acceptedAt !== 'string') return null;
  return { versions, acceptedAt: evidence.acceptedAt, locale: evidence.locale === 'en' ? 'en' : 'de' };
}

/**
 * Create a booking intent, or return the one this attempt already created.
 *
 * The idempotency key is a unique index, so the second of two concurrent
 * submissions loses the insert race and is handed the first one's row instead
 * of creating a twin. That is the whole mechanism: a disabled button is a
 * courtesy, this is the guarantee.
 */
export async function createIntent(input: CreateIntentInput): Promise<IntentRecord> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .insert({
      reference: input.reference,
      unit_id: input.unitId,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: input.children,
      currency: input.currency,
      guest_first_name: input.guest.firstName,
      guest_last_name: input.guest.lastName,
      guest_email: input.guest.email,
      guest_phone: input.guest.phone,
      country: input.guest.country ?? null,
      locale: input.guest.locale ?? null,
      idempotency_key: input.idempotencyKey,
      source: input.source,
      status: 'draft',
      ...(input.termsEvidence ? { terms_evidence: input.termsEvidence } : {}),
    })
    .select(INTENT_COLUMNS)
    .single();

  if (error) {
    // 23505 = unique_violation. The attempt already exists; return it.
    if (error.code === '23505') {
      const existing = await findIntentByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }
  return toIntent(data as unknown as IntentRow);
}

export async function findIntentByIdempotencyKey(key: string): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntent(data as unknown as IntentRow) : null;
}

export async function findIntentByReference(reference: string): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntent(data as unknown as IntentRow) : null;
}

/**
 * Find a booking by its PAYMENT ORDER id.
 *
 * The fallback attribution path for a verified provider event that does not
 * carry our reference. Without it such an event would be an unattributable
 * payment, and silently dropping one is how a guest's money goes missing.
 */
export async function findIntentByOrderId(orderId: string): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('payment_order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntent(data as unknown as IntentRow) : null;
}

export async function findIntentByProviderBookingId(id: string): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('beds24_booking_id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntent(data as unknown as IntentRow) : null;
}

/**
 * Holds that ran out. The release sweep reads this.
 *
 * Every state a guest could still pay from is a candidate — a declined
 * (`payment_failed`) or abandoned (`payment_cancelled`) attempt included.
 * The earlier list stopped at `payment_pending`, so a declined card left its
 * Beds24 hold blocking the nights on every channel until a person noticed.
 * The lease check downstream still refuses while any payment evidence exists.
 */
export const LEASEABLE_STATUSES: readonly BookingStatus[] = [
  'hold_created', 'payment_session_created', 'awaiting_payment', 'payment_pending',
  'payment_failed', 'payment_cancelled',
];

export async function findExpiredHolds(limit = 50, now: Date = new Date()): Promise<IntentRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .in('status', LEASEABLE_STATUSES as string[])
    .lt('hold_expires_at', now.toISOString())
    .order('hold_expires_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as IntentRow[]).map(toIntent);
}

interface IntentRow {
  id: string;
  reference: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  currency: string;
  quoted_total_cents: number | null;
  quote_components: QuoteComponent[] | null;
  status: BookingStatus;
  source: BookingSource;
  beds24_booking_id: string | null;
  payment_provider: PaymentProvider | null;
  payment_session_id: string | null;
  quote_expires_at: string | null;
  hold_expires_at: string | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  country: string | null;
  locale: string | null;
  payment_status: PaymentStatus;
  payment_order_id: string | null;
  payment_capture_id: string | null;
  paid_amount_cents: number | null;
  paid_currency: string | null;
  lock_expires_at: string | null;
  beds24_property_id: string | null;
  beds24_room_id: string | null;
  beds24_status: string | null;
  beds24_verified_at: string | null;
  quote_hash: string | null;
  last_failure_code: string | null;
  reconciliation_state: 'ok' | 'pending' | 'failed' | 'manual';
  confirmed_at: string | null;
  paid_at: string | null;
  refunded_amount_cents?: number | null;
  cancellation_requested_at?: string | null;
  cancellation_requested_by?: string | null;
  cancellation_reason?: string | null;
  cancellation_authorized_by?: string | null;
  cancellation_completed_at?: string | null;
  refund_state?: RefundState | null;
  refund_required_cents?: number | null;
  refund_id?: string | null;
  bolagio_units?: { slug: string } | { slug: string }[] | null;
}

function toIntent(row: IntentRow): IntentRecord {
  const unit = Array.isArray(row.bolagio_units) ? row.bolagio_units[0] : row.bolagio_units;
  return {
    id: row.id,
    reference: row.reference,
    unitId: row.unit_id,
    unitSlug: unit?.slug ?? '',
    checkIn: row.check_in,
    checkOut: row.check_out,
    adults: row.adults,
    children: row.children,
    currency: row.currency,
    quotedTotalCents: row.quoted_total_cents,
    quoteComponents: row.quote_components ?? [],
    status: row.status,
    source: row.source,
    beds24BookingId: row.beds24_booking_id,
    paymentProvider: row.payment_provider,
    paymentSessionId: row.payment_session_id,
    quoteExpiresAt: row.quote_expires_at,
    holdExpiresAt: row.hold_expires_at,
    paymentStatus: row.payment_status ?? 'not_created',
    paymentOrderId: row.payment_order_id,
    paymentCaptureId: row.payment_capture_id,
    paidAmountCents: row.paid_amount_cents,
    paidCurrency: row.paid_currency,
    lockExpiresAt: row.lock_expires_at,
    beds24PropertyId: row.beds24_property_id,
    beds24RoomId: row.beds24_room_id,
    beds24Status: row.beds24_status,
    beds24VerifiedAt: row.beds24_verified_at,
    quoteHash: row.quote_hash,
    lastFailureCode: row.last_failure_code,
    reconciliationState: row.reconciliation_state ?? 'ok',
    confirmedAt: row.confirmed_at,
    paidAt: row.paid_at,
    refundedAmountCents: row.refunded_amount_cents ?? 0,
    cancellationRequestedAt: row.cancellation_requested_at ?? null,
    cancellationRequestedBy: row.cancellation_requested_by ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    cancellationAuthorizedBy: row.cancellation_authorized_by ?? null,
    cancellationCompletedAt: row.cancellation_completed_at ?? null,
    refundState: row.refund_state ?? 'none',
    refundRequiredCents: row.refund_required_cents ?? null,
    refundId: row.refund_id ?? null,
    guest: row.guest_email
      ? {
          firstName: row.guest_first_name ?? '',
          lastName: row.guest_last_name ?? '',
          email: row.guest_email,
          phone: row.guest_phone ?? '',
          country: row.country ?? undefined,
          locale: row.locale === 'en' ? 'en' : 'de',
        }
      : null,
  };
}

/* ── Provider events ────────────────────────────────────────────────────── */

/**
 * Persist a raw provider event.
 *
 * Returns `false` when this exact payload has already been stored, which is
 * how a webhook delivered five times is processed once. The hash is of the raw
 * body, so a genuine re-send and a genuine second identical event are
 * indistinguishable — and treating a repeat as a duplicate is the safe
 * direction for a booking system.
 */
export async function recordIntegrationEvent(input: {
  eventType: string;
  externalId?: string;
  payload: unknown;
  payloadHash: string;
}): Promise<{ id: string; duplicate: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_integration_events')
    .insert({
      provider: 'beds24',
      event_type: input.eventType,
      external_id: input.externalId ?? null,
      payload: input.payload,
      payload_hash: input.payloadHash,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { id: '', duplicate: true };
    throw error;
  }
  return { id: data.id as string, duplicate: false };
}

export async function markIntegrationEvent(
  id: string,
  status: 'processed' | 'ignored' | 'failed',
  error?: string
): Promise<void> {
  if (!id) return;
  await supabaseAdmin()
    .from('bolagio_integration_events')
    .update({ status, processed_at: new Date().toISOString(), error: error ?? null })
    .eq('id', id);
}


/* ── Cancellations awaiting completion ─────────────────────────────────── */

/**
 * Bookings whose release was verified after a cancellation request and that
 * have not been moved to `cancelled` yet — a process died between the two.
 * Reconciliation finishes them.
 */
export async function findReleasedPendingCancellation(limit = 50): Promise<IntentRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('status', 'released')
    .not('cancellation_requested_at', 'is', null)
    .is('cancellation_completed_at', null)
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as IntentRow[]).map(toIntent);
}
