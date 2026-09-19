import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * READ MODELS for BoLaGio Control.
 *
 * Each function composes rows from the row source into one of the DTOs in
 * `dto.ts` and answers with a `QueryResult`, so a page can show what loaded
 * and say exactly what did not. Nothing here writes. Nothing here decides
 * booking semantics — the mapping asks `lib/booking` where a fact is needed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { getRentalUnit } from '@/lib/content/apartments';
import { nightsBetween } from '@/lib/booking/stay-rules';
import { isPaidSide } from '@/lib/booking/states';
import { adminPosture } from '@/lib/admin/config';
import {
  failed,
  ok,
  sanitizeDetail,
  trimError,
  type AttentionItem,
  type BookingDetailDto,
  type BookingSummaryDto,
  type CalendarDto,
  type ExternalOperationDto,
  type HealthSectionDto,
  type LifecycleEventDto,
  type OutboxEventDto,
  type PaymentEventDto,
  type QueryResult,
  type QueueCountDto,
  type ReconciliationJobDto,
  type UnitDto,
} from '@/lib/admin/dto';
import { collectAttention, OUTBOX_BACKLOG_MS, PAYMENT_EVENT_STUCK_MS } from '@/lib/admin/attention';
import { closedRanges, nightsCovered } from '@/lib/admin/calendar';
import { ageMs, guestListLabel } from '@/lib/admin/format';
import { PAGE_SIZE, statesFor, type BookingListFilter } from '@/lib/admin/filters';
import { AdminUnconfiguredError, rowSource } from '@/lib/admin/source';
import type { IntentRow, JobRow, OperationRow, OutboxRow, PaymentEventRow, UnitRow } from '@/lib/admin/rows';
import { reservesInventory } from '@/lib/booking/states';
import { isBookingState } from '@/lib/admin/presentation';

/* ── Error shaping ─────────────────────────────────────────────────────── */

/** A message an operator can act on, and never a Postgres error body. */
function describe(cause: unknown): string {
  if (cause instanceof AdminUnconfiguredError) return 'The operations backend is not configured on this deployment.';
  if (cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code: unknown }).code === 'string') {
    const code = (cause as { code: string }).code;
    if (code === '42P01') return 'A booking table is missing. The booking migrations have not been applied to this database.';
    if (code === '42501') return 'The database refused the read. The service role is not configured correctly.';
    return `The database could not answer (code ${code}).`;
  }
  if (cause instanceof Error && /fetch|network|ECONN|timeout/i.test(cause.message)) return 'The database could not be reached.';
  return 'The data could not be loaded.';
}

async function guard<T>(fn: () => Promise<T>): Promise<QueryResult<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    // eslint-disable-next-line no-console -- server-side diagnostics only; the operator sees `describe()`.
    console.error(JSON.stringify({ scope: 'admin', event: 'query.error', level: 'error', cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown' }));
    return failed(describe(cause));
  }
}

/* ── Units ─────────────────────────────────────────────────────────────── */

function unitName(slug: string, fallback: string): string {
  return fallback || getRentalUnit(slug)?.name.de || slug;
}

function toUnitDto(row: UnitRow, meta: { syncedAt: string | null; daysCached: number }): UnitDto {
  const content = getRentalUnit(row.slug);
  return {
    slug: row.slug,
    displayName: row.display_name || content?.name.de || row.slug,
    contentStatus: content ? content.status : null,
    street: content?.street ?? null,
    isBookable: row.is_bookable,
    currency: row.currency,
    maxGuests: row.max_guests,
    minNights: row.min_nights,
    integration: row.integration
      ? {
          provider: row.integration.provider,
          externalPropertyId: row.integration.external_property_id,
          externalRoomId: row.integration.external_room_id,
          enabled: row.integration.enabled,
        }
      : null,
    inventory: meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listUnits(): Promise<QueryResult<UnitDto[]>> {
  return guard(async () => {
    const source = await rowSource();
    const [units, meta] = await Promise.all([source.units(), source.inventoryMeta().catch(() => [])]);
    return units.map((u) => {
      const m = meta.find((x) => x.unit_id === u.id);
      return toUnitDto(u, { syncedAt: m?.oldest_sync ?? null, daysCached: m?.days_cached ?? 0 });
    });
  });
}

/* ── Bookings ──────────────────────────────────────────────────────────── */

function toSummary(row: IntentRow, unitNames: Map<string, string>): BookingSummaryDto {
  return {
    reference: row.reference,
    unitSlug: row.unit_slug,
    unitName: unitName(row.unit_slug, unitNames.get(row.unit_id) ?? ''),
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: nightsBetween(row.check_in, row.check_out),
    adults: row.adults,
    children: row.children,
    source: row.source,
    status: row.status,
    paymentStatus: row.payment_status ?? 'not_created',
    currency: row.currency,
    quotedTotalCents: row.quoted_total_cents,
    paidAmountCents: row.paid_amount_cents,
    guestLabel: guestListLabel(row.guest_first_name, row.guest_last_name),
    guestCountry: row.country,
    reconciliationState: row.reconciliation_state ?? 'ok',
    lastFailureCode: row.last_failure_code,
    hasExternalBooking: Boolean(row.beds24_booking_id),
    holdExpiresAt: row.hold_expires_at,
    paidAt: row.paid_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toOperation(row: OperationRow): ExternalOperationDto {
  return {
    id: row.id,
    provider: row.provider,
    operationType: row.operation_type,
    outcome: row.outcome,
    attempts: row.attempts,
    resourceId: row.resource_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    uncertainAt: row.uncertain_at,
    reconciledAt: row.reconciled_at,
    lastError: trimError(row.last_error),
    reference: row.reference,
  };
}

function toPaymentEvent(row: PaymentEventRow): PaymentEventDto {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    verification: row.verification,
    status: row.status,
    attempts: row.attempts,
    amountCents: row.amount_cents,
    currency: row.currency,
    orderId: row.order_id,
    captureId: row.capture_id,
    reference: row.reference,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    lastError: trimError(row.last_error),
  };
}

function toOutbox(row: OutboxRow): OutboxEventDto {
  return {
    id: row.id,
    eventType: row.event_type,
    status: row.status,
    attempts: row.attempts,
    reference: row.reference,
    createdAt: row.created_at,
    availableAt: row.available_at,
    processedAt: row.processed_at,
    lastError: trimError(row.last_error),
  };
}

function toJob(row: JobRow): ReconciliationJobDto {
  return {
    id: row.id,
    reason: row.reason,
    severity: row.severity,
    status: row.status,
    attempts: row.attempts,
    reference: row.reference,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    lastError: trimError(row.last_error),
  };
}

async function unitNameMap(): Promise<Map<string, string>> {
  const source = await rowSource();
  const units = await source.units();
  return new Map(units.map((u) => [u.id, u.display_name]));
}

export interface BookingPage {
  items: BookingSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listBookings(filter: BookingListFilter): Promise<QueryResult<BookingPage>> {
  return guard(async () => {
    const source = await rowSource();
    const units = await source.units();
    const names = new Map(units.map((u) => [u.id, u.display_name]));
    const unitId = filter.unit ? units.find((u) => u.slug === filter.unit)?.id ?? '__none__' : null;
    const sortColumn = (
      {
        arrival: 'check_in',
        departure: 'check_out',
        updated: 'updated_at',
        created: 'created_at',
        amount: 'quoted_total_cents',
      } as const
    )[filter.sort];

    const { rows, total } = await source.intents({
      statuses: statesFor(filter),
      paymentStatuses: filter.payment ? [filter.payment] : null,
      unitId,
      source: filter.source,
      search: filter.q || null,
      checkInFrom: filter.from,
      checkInTo: filter.to,
      attentionOnly: filter.attention,
      sort: sortColumn,
      dir: filter.dir,
      offset: (filter.page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    return { items: rows.map((r) => toSummary(r, names)), total, page: filter.page, pageSize: PAGE_SIZE };
  });
}

/** A short list for the command palette: reference or surname prefix. */
export async function searchBookings(query: string, limit = 8): Promise<QueryResult<BookingSummaryDto[]>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    const { rows } = await source.intents({ search: query, sort: 'updated_at', dir: 'desc', limit });
    return rows.map((r) => toSummary(r, names));
  });
}

export async function getBookingDetail(reference: string): Promise<QueryResult<BookingDetailDto | null>> {
  return guard(async () => {
    const source = await rowSource();
    const row = await source.intentByReference(reference);
    if (!row) return null;
    const names = await unitNameMap();
    const [events, operations, paymentEvents, outbox, jobs] = await Promise.all([
      source.intentEvents(row.id),
      source.operations({ intentId: row.id, limit: 50 }),
      source.paymentEvents({ reference: row.reference, limit: 50 }),
      source.outbox({ reference: row.reference, limit: 50 }),
      source.jobs({ intentId: row.id, limit: 50 }),
    ]);

    const components = Array.isArray(row.quote_components) ? (row.quote_components as Array<Record<string, unknown>>) : [];
    const lifecycle: LifecycleEventDto[] = events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      reason: e.reason,
      correlationId: e.correlation_id,
      detail: sanitizeDetail(e.detail),
      at: e.created_at,
    }));

    return {
      ...toSummary(row, names),
      guest: row.guest_email
        ? {
            firstName: row.guest_first_name ?? '',
            lastName: row.guest_last_name ?? '',
            email: row.guest_email,
            phone: row.guest_phone ?? '',
            country: row.country,
            locale: row.locale,
          }
        : null,
      quote: {
        lines: components.map((c) => ({
          code: String(c.code ?? ''),
          label:
            typeof c.label === 'object' && c.label && 'en' in (c.label as object)
              ? String((c.label as { en?: string }).en ?? (c.label as { de?: string }).de ?? '')
              : String(c.label ?? c.code ?? ''),
          amountCents: Number(c.amountCents ?? 0),
          mandatory: Boolean(c.mandatory),
          taxCategory: typeof c.taxCategory === 'string' ? c.taxCategory : null,
        })),
        expiresAt: row.quote_expires_at,
      },
      channel: {
        bookingId: row.beds24_booking_id,
        propertyId: row.beds24_property_id,
        roomId: row.beds24_room_id,
        status: row.beds24_status,
        verifiedAt: row.beds24_verified_at,
      },
      payment: {
        provider: row.payment_provider,
        orderId: row.payment_order_id,
        captureId: row.payment_capture_id,
        paidAmountCents: row.paid_amount_cents,
        paidCurrency: row.paid_currency,
        refundedAmountCents: row.refunded_amount_cents ?? 0,
        paidAt: row.paid_at,
      },
      failure: { code: row.last_failure_code, reason: row.last_failure_reason ? row.last_failure_reason.slice(0, 400) : null, at: row.last_failure_at },
      lockExpiresAt: row.lock_expires_at,
      releasedAt: row.released_at,
      lifecycle,
      operations: operations.map(toOperation),
      paymentEvents: paymentEvents.map(toPaymentEvent),
      outbox: outbox.map(toOutbox),
      reconciliationJobs: jobs.map(toJob),
    };
  });
}

/* ── Today and upcoming ────────────────────────────────────────────────── */

/** States that mean a guest is genuinely expected: paid-side only. A held, unpaid attempt is not an arrival. */
function isExpected(status: string): boolean {
  return isBookingState(status) && isPaidSide(status);
}

export interface TodayBoard {
  today: string;
  arrivals: BookingSummaryDto[];
  departures: BookingSummaryDto[];
  inHouse: BookingSummaryDto[];
}

export async function loadToday(today: string): Promise<QueryResult<TodayBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    // Every stay touching today, then classified locally by hotel semantics.
    const { rows } = await source.intents({ overlaps: { from: today, to: today }, limit: 200, sort: 'check_in' });
    const departing = await source.intents({ checkInFrom: null, checkInTo: today, limit: 200, sort: 'check_out' });
    const all = new Map<string, IntentRow>();
    for (const r of [...rows, ...departing.rows]) all.set(r.id, r);
    const items = Array.from(all.values()).filter((r) => isExpected(r.status)).map((r) => toSummary(r, names));
    return {
      today,
      arrivals: items.filter((b) => b.checkIn === today),
      departures: items.filter((b) => b.checkOut === today),
      inHouse: items.filter((b) => b.checkIn < today && b.checkOut > today),
    };
  });
}

export async function loadUpcoming(today: string, limit = 8): Promise<QueryResult<BookingSummaryDto[]>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    const { rows } = await source.intents({ checkInFrom: today, sort: 'check_in', dir: 'asc', limit: 60 });
    return rows.filter((r) => isExpected(r.status)).slice(0, limit).map((r) => toSummary(r, names));
  });
}

/* ── Calendar ──────────────────────────────────────────────────────────── */

export async function loadCalendar(windowStart: string, windowEnd: string, today: string): Promise<QueryResult<CalendarDto>> {
  return guard(async () => {
    const source = await rowSource();
    const units = await source.units();
    const names = new Map(units.map((u) => [u.id, u.display_name]));
    const [{ rows }, closed] = await Promise.all([
      source.intents({ overlaps: { from: windowStart, to: windowEnd }, limit: 200, sort: 'check_in' }),
      source.inventoryClosed(windowStart, windowEnd).catch(() => []),
    ]);

    // Only reserving states are drawn as stays. A draft or a released
    // attempt does not occupy a night and would only clutter the grid.
    const reserving = rows.filter((r) => isBookingState(r.status) && reservesInventory(r.status));
    const reservations = reserving.map((r) => {
      const s = toSummary(r, names);
      return {
        reference: s.reference,
        unitSlug: s.unitSlug,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        nights: s.nights,
        status: s.status,
        paymentStatus: s.paymentStatus,
        source: s.source,
        guestLabel: s.guestLabel,
        adults: s.adults,
        children: s.children,
      };
    });

    const closures: CalendarDto['closures'] = [];
    let oldestSync: string | null = null;
    for (const unit of units) {
      const unitClosed = closed.filter((c) => c.unit_id === unit.id);
      if (unitClosed.length === 0) continue;
      const covered = nightsCovered(reservations.filter((r) => r.unitSlug === unit.slug));
      const syncedAt = unitClosed.reduce<string | null>((o, c) => (!o || c.synced_at < o ? c.synced_at : o), null);
      if (syncedAt && (!oldestSync || syncedAt < oldestSync)) oldestSync = syncedAt;
      for (const span of closedRanges(unitClosed.map((c) => c.date), covered)) {
        closures.push({ unitSlug: unit.slug, from: span.checkIn, to: span.checkOut, syncedAt });
      }
    }

    return {
      windowStart,
      windowEnd,
      today,
      units: units.map((u) => ({
        slug: u.slug,
        displayName: u.display_name || getRentalUnit(u.slug)?.name.de || u.slug,
        isBookable: u.is_bookable,
        contentStatus: getRentalUnit(u.slug)?.status ?? null,
      })),
      reservations,
      closures,
      inventorySyncedAt: oldestSync,
    };
  });
}

/* ── Attention ─────────────────────────────────────────────────────────── */

export interface AttentionBoard {
  items: AttentionItem[];
  /** Subsystems that could not be read; their items are absent, not zero. */
  degraded: string[];
}

export async function loadAttention(now: Date = new Date()): Promise<QueryResult<AttentionBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    const degraded: string[] = [];
    const settle = async <T,>(label: string, p: Promise<T>, empty: T): Promise<T> => {
      try {
        return await p;
      } catch {
        degraded.push(label);
        return empty;
      }
    };

    const [bookings, operations, jobs, paymentEvents, outbox] = await Promise.all([
      settle('bookings', source.intents({ attentionOnly: true, sort: 'updated_at', dir: 'desc', limit: 200 }), { rows: [], total: 0 }),
      settle('external operations', source.operations({ outcomes: ['outcome_unknown', 'in_flight'], limit: 100 }), []),
      settle('reconciliation queue', source.jobs({ statuses: ['pending', 'claimed', 'failed', 'exhausted'], limit: 100 }), []),
      settle('payment inbox', source.paymentEvents({ limit: 100 }), []),
      settle('outbox', source.outbox({ statuses: ['pending', 'claimed', 'failed', 'exhausted'], limit: 100 }), []),
    ]);

    const items = collectAttention(
      {
        bookings: bookings.rows.map((r) => toSummary(r, names)),
        operations: operations.map(toOperation),
        jobs: jobs.map(toJob),
        paymentEvents: paymentEvents.map(toPaymentEvent),
        outbox: outbox.map(toOutbox),
      },
      now
    );
    // An open job on a booking that is already listed is the same problem
    // seen from the queue. Keep the booking item — it carries the fuller
    // explanation and links onward; the job stays visible on the detail page.
    const listed = new Set(items.filter((i) => i.category === 'booking').map((i) => i.reference));
    const deduped = items.filter((i) => !(i.category === 'reconciliation' && i.reference && listed.has(i.reference)));
    return { items: deduped, degraded };
  });
}

/* ── Payments ──────────────────────────────────────────────────────────── */

export interface PaymentsBoard {
  bookings: BookingSummaryDto[];
  total: number;
  events: PaymentEventDto[];
}

export async function loadPayments(page: number, search: string | null): Promise<QueryResult<PaymentsBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    const [{ rows, total }, events] = await Promise.all([
      source.intents({ paymentActivity: true, search, sort: 'updated_at', dir: 'desc', offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
      source.paymentEvents({ limit: 30 }),
    ]);
    return { bookings: rows.map((r) => toSummary(r, names)), total, events: events.map(toPaymentEvent) };
  });
}

/* ── Queues, health, audit ─────────────────────────────────────────────── */

export async function loadQueues(): Promise<QueryResult<QueueCountDto[]>> {
  return guard(async () => {
    const source = await rowSource();
    return source.queues();
  });
}

export async function loadRecentOutbox(limit = 20): Promise<QueryResult<OutboxEventDto[]>> {
  return guard(async () => (await rowSource()).outbox({ limit }).then((r) => r.map(toOutbox)));
}

export async function loadRecentOperations(limit = 20): Promise<QueryResult<ExternalOperationDto[]>> {
  return guard(async () => (await rowSource()).operations({ limit }).then((r) => r.map(toOperation)));
}

export async function loadRecentJobs(limit = 20): Promise<QueryResult<ReconciliationJobDto[]>> {
  return guard(async () => (await rowSource()).jobs({ limit }).then((r) => r.map(toJob)));
}

export async function loadAudit(limit = 20) {
  return guard(async () => (await rowSource()).audit(limit));
}

function sum(queues: QueueCountDto[], queue: string, states: string[]): number {
  return queues.filter((q) => q.queue === queue && states.includes(q.state)).reduce((n, q) => n + q.items, 0);
}

function oldest(queues: QueueCountDto[], queue: string, states: string[]): string | null {
  return queues
    .filter((q) => q.queue === queue && states.includes(q.state) && q.oldest)
    .reduce<string | null>((o, q) => (!o || (q.oldest as string) < o ? (q.oldest as string) : o), null);
}

/**
 * The System page. Every status is derived from something measured; a
 * subsystem with nothing to measure is reported as `not_instrumented`, never
 * as healthy.
 */
export async function loadSystemHealth(now: Date = new Date()): Promise<QueryResult<HealthSectionDto[]>> {
  const posture = adminPosture();
  return guard(async () => {
    let source;
    try {
      source = await rowSource();
    } catch (cause) {
      if (cause instanceof AdminUnconfiguredError) {
        return [
          { key: 'database', title: 'Database', status: 'unavailable', summary: 'Supabase is not configured on this deployment.', facts: [] },
          ...postureSections(posture),
        ];
      }
      throw cause;
    }

    const [reachable, queues, meta, units] = await Promise.all([
      source.ping().catch(() => false),
      source.queues().catch(() => null),
      source.inventoryMeta().catch(() => null),
      source.units().catch(() => null),
    ]);

    const sections: HealthSectionDto[] = [];

    sections.push(
      reachable
        ? { key: 'database', title: 'Database', status: 'healthy', summary: 'Supabase answered. Booking tables are reachable with the service role.', facts: [{ label: 'Checked', value: 'just now', tone: 'muted' }] }
        : { key: 'database', title: 'Database', status: 'degraded', summary: 'Supabase did not answer, or the booking tables are missing.', facts: [] }
    );

    // Booking core: measured by the presence of the tables and the migrations
    // that create the queues. If queues cannot be read, the hardening
    // migration is not applied.
    sections.push(
      queues
        ? { key: 'booking_core', title: 'Booking core', status: 'healthy', summary: 'Transactional core present: state machine, outbox, payment inbox and reconciliation queue are all readable.', facts: [{ label: 'Direct booking', value: posture.directBookingEnabled ? 'Enabled' : 'Disabled', tone: posture.directBookingEnabled ? 'caution' : 'muted' }] }
        : { key: 'booking_core', title: 'Booking core', status: 'degraded', summary: 'The operations views could not be read. The booking-core migrations may not be applied.', facts: [] }
    );

    // Channel manager: configuration plus cache freshness. No live call is
    // made from here — reading Beds24 on every page view would be a cost
    // without a question behind it.
    {
      const mapped = (units ?? []).filter((u) => u.integration?.enabled);
      const stale = (meta ?? []).filter((m) => m.oldest_sync && ageMs(m.oldest_sync, now) > 6 * 60 * 60_000);
      const facts = [
        { label: 'Mode', value: posture.beds24Mode === 'live' ? 'Live' : 'Mock fixtures', tone: posture.beds24Mode === 'live' ? 'neutral' : 'caution' },
        { label: 'API token', value: posture.beds24TokenConfigured ? 'Configured' : 'Missing', tone: posture.beds24TokenConfigured ? 'positive' : 'critical' },
        { label: 'Webhook secret', value: posture.beds24WebhookSecretConfigured ? 'Configured' : 'Missing', tone: posture.beds24WebhookSecretConfigured ? 'positive' : 'caution' },
        { label: 'Units mapped', value: `${mapped.length} of ${(units ?? []).length}` },
      ] as HealthSectionDto['facts'];
      let status: HealthSectionDto['status'] = 'healthy';
      let summary = 'Mapping present and the availability cache is fresh.';
      if (!meta || meta.length === 0) {
        status = 'not_instrumented';
        summary = 'No inventory has been synchronised yet, so cache freshness cannot be measured.';
      } else if (stale.length > 0) {
        status = 'attention';
        summary = `The availability cache for ${stale.length} unit${stale.length === 1 ? '' : 's'} is older than six hours. The sync schedule may not be running.`;
      }
      if (!posture.beds24TokenConfigured && posture.beds24Mode === 'live') {
        status = 'degraded';
        summary = 'Live mode without an API token: every channel-manager call will fail.';
      }
      sections.push({ key: 'beds24', title: 'Channel manager (Beds24)', status, summary, facts });
    }

    // Payments: configuration only. Whether a capture actually settles is
    // proven by the payment inbox, below, not by a green dot here.
    {
      const facts = [
        { label: 'Mode', value: posture.paypalMode === 'unconfigured' ? 'Not configured' : posture.paypalMode === 'live' ? 'Live' : 'Sandbox', tone: posture.paypalMode === 'live' ? 'neutral' : posture.paypalMode === 'sandbox' ? 'caution' : 'critical' },
        { label: 'Credentials', value: posture.paypalCredentialsConfigured ? 'Configured' : 'Missing', tone: posture.paypalCredentialsConfigured ? 'positive' : 'critical' },
        { label: 'Webhook id', value: posture.paypalWebhookConfigured ? 'Configured' : 'Missing', tone: posture.paypalWebhookConfigured ? 'positive' : 'critical' },
      ] as HealthSectionDto['facts'];
      const status: HealthSectionDto['status'] =
        posture.paypalMode === 'unconfigured' || !posture.paypalCredentialsConfigured || !posture.paypalWebhookConfigured ? 'degraded' : 'healthy';
      sections.push({
        key: 'paypal',
        title: 'Payments (PayPal)',
        status,
        summary:
          status === 'healthy'
            ? `Configured in ${posture.paypalMode} mode. Settlement is proven by verified events in the payment inbox, not by this line.`
            : 'Payment configuration is incomplete. The payment path fails closed: no order can be created.',
        facts,
      });
    }

    if (queues) {
      const failedEvents = sum(queues, 'payment_events', ['failed', 'exhausted']);
      const pendingEvents = sum(queues, 'payment_events', ['pending', 'claimed']);
      const oldestPending = oldest(queues, 'payment_events', ['pending', 'claimed']);
      const stuck = oldestPending ? ageMs(oldestPending, now) > PAYMENT_EVENT_STUCK_MS : false;
      sections.push({
        key: 'payment_inbox',
        title: 'Payment webhook inbox',
        status: failedEvents > 0 ? 'attention' : stuck ? 'attention' : 'healthy',
        summary:
          failedEvents > 0
            ? `${failedEvents} event${failedEvents === 1 ? '' : 's'} failed processing or verification.`
            : stuck
              ? 'A verified event has been waiting longer than a reconciliation cycle.'
              : pendingEvents > 0
                ? `${pendingEvents} verified event${pendingEvents === 1 ? '' : 's'} waiting for the next pass.`
                : 'Every received event has been processed.',
        facts: [
          { label: 'Processed', value: String(sum(queues, 'payment_events', ['succeeded'])) },
          { label: 'Waiting', value: String(pendingEvents), tone: stuck ? 'caution' : undefined },
          { label: 'Failed', value: String(failedEvents), tone: failedEvents > 0 ? 'critical' : undefined },
        ],
      });

      const exhausted = sum(queues, 'outbox', ['exhausted']);
      const backlog = sum(queues, 'outbox', ['pending', 'claimed']);
      const oldestBacklog = oldest(queues, 'outbox', ['pending', 'claimed']);
      const backlogStale = oldestBacklog ? ageMs(oldestBacklog, now) > OUTBOX_BACKLOG_MS : false;
      sections.push({
        key: 'outbox',
        title: 'Automation outbox (n8n)',
        status: exhausted > 0 ? 'attention' : backlogStale ? 'attention' : 'healthy',
        summary:
          exhausted > 0
            ? `${exhausted} event${exhausted === 1 ? '' : 's'} dead-lettered. The bookings are unaffected; the messages did not go.`
            : backlogStale
              ? 'Events have been waiting longer than thirty minutes. The automation pump is not claiming.'
              : backlog > 0
                ? `${backlog} event${backlog === 1 ? '' : 's'} waiting to be claimed.`
                : 'Every event has been delivered.',
        facts: [
          { label: 'Delivered', value: String(sum(queues, 'outbox', ['succeeded'])) },
          { label: 'Waiting', value: String(backlog), tone: backlogStale ? 'caution' : undefined },
          { label: 'Dead-lettered', value: String(exhausted), tone: exhausted > 0 ? 'critical' : undefined },
          { label: 'Signing secret', value: posture.n8nSecretConfigured ? 'Configured' : 'Missing', tone: posture.n8nSecretConfigured ? 'positive' : 'caution' },
        ],
      });

      const openJobs = sum(queues, 'reconciliation', ['pending', 'claimed', 'failed']);
      const exhaustedJobs = sum(queues, 'reconciliation', ['exhausted']);
      const unknownOps = sum(queues, 'external_operations', ['outcome_unknown']);
      sections.push({
        key: 'reconciliation',
        title: 'Reconciliation',
        status: exhaustedJobs > 0 || unknownOps > 0 ? 'attention' : 'healthy',
        summary:
          exhaustedJobs > 0
            ? `${exhaustedJobs} job${exhaustedJobs === 1 ? '' : 's'} exhausted every automatic attempt.`
            : unknownOps > 0
              ? `${unknownOps} external operation${unknownOps === 1 ? '' : 's'} with an unknown outcome await a read of the provider.`
              : openJobs > 0
                ? `${openJobs} job${openJobs === 1 ? '' : 's'} open. Whether the schedule is running is not measured here.`
                : 'No open jobs. Whether the schedule is running is not measured here — a pass leaves no heartbeat.',
        facts: [
          { label: 'Open jobs', value: String(openJobs) },
          { label: 'Exhausted', value: String(exhaustedJobs), tone: exhaustedJobs > 0 ? 'critical' : undefined },
          { label: 'Unknown outcomes', value: String(unknownOps), tone: unknownOps > 0 ? 'critical' : undefined },
          { label: 'Scheduler secret', value: posture.schedulerSecretConfigured ? 'Configured' : 'Missing', tone: posture.schedulerSecretConfigured ? 'positive' : 'caution' },
        ],
      });
    } else {
      sections.push({ key: 'queues', title: 'Queues', status: 'unavailable', summary: 'The operations queues could not be read.', facts: [] });
    }

    sections.push(...postureSections(posture));
    return sections;
  });
}

function postureSections(posture: ReturnType<typeof adminPosture>): HealthSectionDto[] {
  return [
    {
      key: 'control',
      title: 'BoLaGio Control',
      status:
        posture.mode === 'preview'
          ? 'healthy'
          : posture.sessionSecretConfigured && (posture.mode === 'fixture' || posture.supabaseAuthConfigured)
            ? 'healthy'
            : 'degraded',
      summary:
        posture.mode === 'preview'
          ? 'Preview demo. Synthetic data, read-only, no production booking data and no external provider reachable from this deployment.'
          : posture.mode === 'fixture'
            ? 'Development fixtures. Nothing on these screens is real.'
            : posture.sessionSecretConfigured && posture.supabaseAuthConfigured
              ? 'Operator sessions are signed and identity is verified by Supabase Auth.'
              : 'Sign-in is refused until the session secret and Supabase Auth are configured.',
      facts: [
        {
          label: 'Data',
          value: posture.mode === 'preview' ? 'Preview fixtures' : posture.mode === 'fixture' ? 'Fixtures' : posture.mode === 'supabase' ? 'Supabase' : 'Unconfigured',
          tone: posture.mode === 'fixture' || posture.mode === 'preview' ? 'caution' : undefined,
        },
        { label: 'Deployment', value: posture.appEnv === 'preview' ? 'Preview' : 'Production', tone: posture.appEnv === 'preview' ? 'caution' : undefined },
        posture.mode === 'preview'
          ? { label: 'Writes', value: 'Disabled', tone: 'muted' as const }
          : { label: 'Session secret', value: posture.sessionSecretConfigured ? 'Configured' : 'Missing', tone: posture.sessionSecretConfigured ? 'positive' : 'critical' },
        {
          label: 'Identity',
          value:
            posture.mode === 'preview'
              ? 'Preview credentials'
              : posture.supabaseAuthConfigured
                ? 'Supabase Auth'
                : posture.mode === 'fixture'
                  ? 'Fixture operator'
                  : 'Missing',
          tone: posture.supabaseAuthConfigured ? 'positive' : posture.mode === 'fixture' || posture.mode === 'preview' ? 'caution' : 'critical',
        },
      ],
    },
  ];
}
