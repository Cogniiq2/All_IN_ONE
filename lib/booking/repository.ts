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
  QuoteComponent,
} from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';

/* ── Units and provider mapping ─────────────────────────────────────────── */

export interface UnitRecord {
  id: string;
  slug: string;
  displayName: string;
  maxGuests: number | null;
  minNights: number | null;
  currency: string;
  isBookable: boolean;
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
      'id, slug, display_name, max_guests, min_nights, currency, is_bookable,' +
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
      'id, slug, display_name, max_guests, min_nights, currency, is_bookable,' +
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
}

const INTENT_COLUMNS =
  'id, reference, unit_id, check_in, check_out, adults, children, currency,' +
  ' quoted_total_cents, quote_components, status, source, beds24_booking_id,' +
  ' payment_provider, payment_session_id, quote_expires_at, hold_expires_at,' +
  ' guest_first_name, guest_last_name, guest_email, guest_phone, country, locale,' +
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

export async function findIntentByProviderBookingId(id: string): Promise<IntentRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .eq('beds24_booking_id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toIntent(data as unknown as IntentRow) : null;
}

export interface UpdateIntentInput {
  status?: BookingStatus;
  quotedTotalCents?: number | null;
  quoteComponents?: QuoteComponent[];
  currency?: string;
  quoteExpiresAt?: string | null;
  holdExpiresAt?: string | null;
  beds24BookingId?: string | null;
  paymentProvider?: PaymentProvider | null;
  paymentSessionId?: string | null;
  providerSnapshot?: unknown;
}

/**
 * Write a change, guarded by the status it was read at.
 *
 * `expectedStatus` turns the update into a compare-and-set: two callbacks
 * racing on the same intent cannot both move it, because the second one
 * matches zero rows and is reported as a no-op instead of overwriting the
 * first. Combined with the pure state machine in `state-machine.ts`, a
 * duplicate payment callback is a quiet success and a late failure callback
 * cannot un-confirm a paid stay.
 */
export async function updateIntent(
  id: string,
  patch: UpdateIntentInput,
  expectedStatus?: BookingStatus
): Promise<IntentRecord | null> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.quotedTotalCents !== undefined) row.quoted_total_cents = patch.quotedTotalCents;
  if (patch.quoteComponents !== undefined) row.quote_components = patch.quoteComponents;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.quoteExpiresAt !== undefined) row.quote_expires_at = patch.quoteExpiresAt;
  if (patch.holdExpiresAt !== undefined) row.hold_expires_at = patch.holdExpiresAt;
  if (patch.beds24BookingId !== undefined) row.beds24_booking_id = patch.beds24BookingId;
  if (patch.paymentProvider !== undefined) row.payment_provider = patch.paymentProvider;
  if (patch.paymentSessionId !== undefined) row.payment_session_id = patch.paymentSessionId;
  if (patch.providerSnapshot !== undefined) row.provider_snapshot = patch.providerSnapshot;

  let query = supabaseAdmin().from('bolagio_booking_intents').update(row).eq('id', id);
  if (expectedStatus) query = query.eq('status', expectedStatus);

  const { data, error } = await query.select(INTENT_COLUMNS).maybeSingle();

  if (error) {
    // 23P01 = exclusion_violation: the no-overlap constraint on active holds.
    if (error.code === '23P01') throw new OverlappingHoldError();
    throw error;
  }
  return data ? toIntent(data as unknown as IntentRow) : null;
}

/** Append-only transition log. Never fails the caller — it is observability. */
export async function logTransition(input: {
  intentId: string;
  from: BookingStatus | null;
  to: BookingStatus;
  reason?: string;
  correlationId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin().from('bolagio_booking_intent_events').insert({
    intent_id: input.intentId,
    from_status: input.from,
    to_status: input.to,
    reason: input.reason ?? null,
    correlation_id: input.correlationId ?? null,
    detail: input.detail ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console -- audit trail write failed; the
    // booking itself already succeeded and must not be rolled back for it.
    console.error(JSON.stringify({ scope: 'booking', event: 'intent.transition', level: 'error', cause: error.code }));
  }
}

/** Holds that ran out. The release sweep reads this. */
export async function findExpiredHolds(limit = 50): Promise<IntentRecord[]> {
  const { data, error } = await supabaseAdmin()
    .from('bolagio_booking_intents')
    .select(INTENT_COLUMNS)
    .in('status', ['hold_created', 'payment_pending'])
    .lt('hold_expires_at', new Date().toISOString())
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
