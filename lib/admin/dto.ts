/**
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT THE OPERATIONS INTERFACE IS ALLOWED TO SEE.
 *
 * Every page renders one of these shapes and nothing else. They are built by
 * `lib/admin/queries.ts` from database rows through explicit field lists, so
 * a column added to a table later does not appear on a screen by accident.
 *
 * ── Deliberately absent, everywhere ──────────────────────────────────────
 *   the internal intent uuid          (never in a URL, never on a screen)
 *   the idempotency key
 *   the provider snapshot             (a raw Beds24 body)
 *   raw webhook payloads              (payer details live in there)
 *   any secret, token or credential
 *
 * ── Guest data ───────────────────────────────────────────────────────────
 * Lists carry `guestLabel` — surname and an initial. Only `BookingDetailDto`
 * carries the guest's contact details, and only because the detail page is
 * where an operator genuinely needs to reach a guest.
 *
 * This module is pure types and mappers: import-safe from a client component.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { IsoDate } from '@/lib/booking/types';

/* ── Attention ─────────────────────────────────────────────────────────── */

/** Most to least urgent. Mirrors severity 1–4 in `bolagio_ops_attention`. */
export type AttentionLevel = 'critical' | 'high' | 'elevated' | 'watch';

export type AttentionCategory =
  | 'booking'
  | 'external_operation'
  | 'reconciliation'
  | 'payment_inbox'
  | 'outbox';

export interface AttentionItem {
  /** Stable within a page load; used as a React key and for de-duplication. */
  id: string;
  level: AttentionLevel;
  category: AttentionCategory;
  /** The closed-vocabulary code this item is about, when there is one. */
  code: string | null;
  title: string;
  /** What happened, in one or two plain sentences. */
  explanation: string;
  /** The safest next step. Never "retry". */
  nextStep: string;
  reference: string | null;
  unitSlug: string | null;
  unitName: string | null;
  /** When the underlying condition arose. */
  since: string;
  moneyInvolved: boolean | 'unknown';
  inventoryHeld: boolean | 'unknown';
  href: string | null;
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

export interface BookingSummaryDto {
  reference: string;
  unitSlug: string;
  unitName: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  adults: number;
  children: number;
  source: string;
  status: string;
  paymentStatus: string;
  currency: string;
  quotedTotalCents: number | null;
  paidAmountCents: number | null;
  /** Surname and initial, or null when no guest details were collected. */
  guestLabel: string | null;
  guestCountry: string | null;
  reconciliationState: string;
  lastFailureCode: string | null;
  /** A channel-manager booking id exists. The id itself is on the detail. */
  hasExternalBooking: boolean;
  holdExpiresAt: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuestDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string | null;
  locale: string | null;
}

export interface QuoteLineDto {
  code: string;
  label: string;
  amountCents: number;
  mandatory: boolean;
  taxCategory: string | null;
}

export interface LifecycleEventDto {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  correlationId: string | null;
  /** Operational facts only — codes, ids, amounts. Never guest data. */
  detail: Record<string, string | number | boolean | null> | null;
  at: string;
}

export interface ExternalOperationDto {
  id: string;
  provider: string;
  operationType: string;
  outcome: string;
  attempts: number;
  resourceId: string | null;
  startedAt: string;
  completedAt: string | null;
  uncertainAt: string | null;
  reconciledAt: string | null;
  lastError: string | null;
  reference: string | null;
}

export interface PaymentEventDto {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  verification: string;
  status: string;
  attempts: number;
  amountCents: number | null;
  currency: string | null;
  orderId: string | null;
  captureId: string | null;
  reference: string | null;
  receivedAt: string;
  processedAt: string | null;
  lastError: string | null;
}

export interface OutboxEventDto {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  reference: string | null;
  createdAt: string;
  availableAt: string;
  processedAt: string | null;
  lastError: string | null;
}

export interface ReconciliationJobDto {
  id: string;
  reason: string;
  severity: number;
  status: string;
  attempts: number;
  reference: string | null;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  lastError: string | null;
}

export interface BookingDetailDto extends BookingSummaryDto {
  /** The intent's primary key; used to join turnovers and events. Never shown. */
  id: string;
  guest: GuestDto | null;
  quote: {
    lines: QuoteLineDto[];
    expiresAt: string | null;
  };
  channel: {
    bookingId: string | null;
    propertyId: string | null;
    roomId: string | null;
    status: string | null;
    verifiedAt: string | null;
  };
  payment: {
    provider: string | null;
    orderId: string | null;
    captureId: string | null;
    paidAmountCents: number | null;
    paidCurrency: string | null;
    refundedAmountCents: number;
    paidAt: string | null;
  };
  failure: {
    code: string | null;
    reason: string | null;
    at: string | null;
  };
  /** The cancellation saga's own facts, separate from booking and payment state. */
  cancellation: {
    requestedAt: string | null;
    requestedBy: string | null;
    reason: string | null;
    authorizedBy: string | null;
    completedAt: string | null;
    refundState: 'none' | 'not_required' | 'required' | 'pending' | 'completed' | 'unknown' | 'failed' | string;
    refundRequiredCents: number | null;
    refundId: string | null;
    refundLastError: string | null;
  };
  lockExpiresAt: string | null;
  releasedAt: string | null;
  lifecycle: LifecycleEventDto[];
  operations: ExternalOperationDto[];
  paymentEvents: PaymentEventDto[];
  outbox: OutboxEventDto[];
  reconciliationJobs: ReconciliationJobDto[];
}

/* ── Units ─────────────────────────────────────────────────────────────── */

export interface UnitDto {
  slug: string;
  displayName: string;
  /** From the content file: whether the public site offers it. Null when the content file does not know the slug. */
  contentStatus: 'available' | 'in-preparation' | null;
  street: string | null;
  isBookable: boolean;
  currency: string;
  maxGuests: number | null;
  minNights: number | null;
  /** The property's calendar and house rules. Null when the migration that carries them is not applied. */
  clock: { timezone: string; checkInTime: string; checkOutTime: string } | null;
  integration: {
    provider: string;
    externalPropertyId: string;
    externalRoomId: string;
    enabled: boolean;
  } | null;
  inventory: {
    /** Oldest sync in the cached window, or null when nothing is cached. */
    syncedAt: string | null;
    daysCached: number;
  };
  createdAt: string;
  updatedAt: string;
}

/* ── Calendar ──────────────────────────────────────────────────────────── */

export interface CalendarReservationDto {
  reference: string;
  unitSlug: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  status: string;
  paymentStatus: string;
  source: string;
  guestLabel: string | null;
  adults: number;
  children: number;
}

export interface ChannelClosureDto {
  unitSlug: string;
  /** First closed night. */
  from: IsoDate;
  /** Exclusive. */
  to: IsoDate;
  /** When the cache was last refreshed for this unit's window. */
  syncedAt: string | null;
}

export interface CalendarDto {
  windowStart: IsoDate;
  windowEnd: IsoDate;
  today: IsoDate;
  units: { slug: string; displayName: string; isBookable: boolean; contentStatus: UnitDto['contentStatus'] }[];
  reservations: CalendarReservationDto[];
  closures: ChannelClosureDto[];
  /** The oldest sync among the cached inventory shown, or null if none. */
  inventorySyncedAt: string | null;
}

/* ── Cleaning ──────────────────────────────────────────────────────────── */

export type TurnoverAttention = 'overdue' | 'due_today' | 'same_day' | 'unassigned' | null;

export interface TurnoverDto {
  id: string;
  reference: string | null;
  unitSlug: string;
  unitName: string;
  departure: IsoDate;
  nextArrival: IsoDate | null;
  sameDay: boolean;
  windowStart: string;
  windowEnd: string;
  status: 'required' | 'in_progress' | 'done' | 'void' | string;
  assignedTo: string | null;
  note: string | null;
  startedAt: string | null;
  doneAt: string | null;
  doneBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** The most pressing reason an operator should look, derived from the clock. */
  attention: TurnoverAttention;
}

export interface TurnoverEventDto {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actor: string;
  note: string | null;
  at: string;
}

/* ── Automations ───────────────────────────────────────────────────────── */

export interface MessageDeliveryDto {
  id: string;
  reference: string;
  kind: string;
  sequence: number;
  channel: string;
  locale: string;
  templateId: string | null;
  templateVersion: string | null;
  destinationMasked: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'suppressed' | string;
  retryable: boolean;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  provider: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationSignalStatus = 'observed' | 'never';

export interface IntegrationSignalDto {
  provider: 'beds24' | 'paypal' | 'n8n' | string;
  signal: string;
  label: string;
  status: IntegrationSignalStatus;
  observedAt: string | null;
  detail: string | null;
}

/* ── Queues and health ─────────────────────────────────────────────────── */

export interface QueueCountDto {
  queue: 'outbox' | 'payment_events' | 'reconciliation' | 'external_operations' | string;
  state: string;
  items: number;
  oldest: string | null;
}

export type HealthStatus = 'healthy' | 'attention' | 'degraded' | 'not_instrumented' | 'unavailable';

export interface HealthFact {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'caution' | 'critical' | 'muted';
}

export interface HealthSectionDto {
  key: string;
  title: string;
  status: HealthStatus;
  summary: string;
  facts: HealthFact[];
}

/* ── Results ───────────────────────────────────────────────────────────── */

/**
 * Every query answers with one of these, so a page can show what it has and
 * say precisely what it could not load. A thrown database error must never
 * become "0 bookings".
 */
export type QueryResult<T> =
  | { ok: true; data: T; loadedAt: string }
  | { ok: false; error: string; loadedAt: string };

export function ok<T>(data: T, loadedAt: string = new Date().toISOString()): QueryResult<T> {
  return { ok: true, data, loadedAt };
}

export function failed<T>(error: string, loadedAt: string = new Date().toISOString()): QueryResult<T> {
  return { ok: false, error, loadedAt };
}

/* ── Sanitisation helpers used by the mappers ──────────────────────────── */

/**
 * Keys a lifecycle event's detail may carry onto a screen. The audit row is
 * built from the transition patch minus the quote and the snapshot, and the
 * patch keys are a closed set — this list is the allowlist of that set.
 */
const DETAIL_KEYS = new Set([
  'quote_hash',
  'quote_expires_at',
  'currency',
  'quoted_total_cents',
  'hold_expires_at',
  'lock_expires_at',
  'beds24_booking_id',
  'beds24_property_id',
  'beds24_room_id',
  'beds24_status',
  'beds24_verified_at',
  'payment_provider',
  'payment_status',
  'payment_order_id',
  'payment_capture_id',
  'paid_amount_cents',
  'paid_currency',
  'last_failure_code',
  'last_failure_reason',
  'reconciliation_state',
]);

export function sanitizeDetail(detail: unknown): LifecycleEventDto['detail'] {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (!DETAIL_KEYS.has(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Error text from a queue row, trimmed so a provider body cannot flood a screen. */
export function trimError(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 240) : null;
}
