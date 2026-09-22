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
  type IntegrationSignalDto,
  type MessageDeliveryDto,
  type TurnoverDto,
  type TurnoverEventDto,
  type ReservationDto,
  type ReservationBoard,
} from '@/lib/admin/dto';
import { collectAttention, LEVEL_ORDER, OUTBOX_BACKLOG_MS, PAYMENT_EVENT_STUCK_MS } from '@/lib/admin/attention';
import { deriveAlerts, SCHEDULER_INTERVAL_MS, type AlertReport } from '@/lib/ops/alerts';
import { closedRanges, nightsCovered } from '@/lib/admin/calendar';
import { buildPerformance, type PerformanceReport } from '@/lib/admin/performance';
import type { DateRange } from '@/lib/finance/periods';
import { ageMs, guestListLabel } from '@/lib/admin/format';
import { PAGE_SIZE, statesFor, type BookingListFilter } from '@/lib/admin/filters';
import { AdminUnconfiguredError, rowSource } from '@/lib/admin/source';
import type { IntentRow, JobRow, OperationRow, OutboxRow, PaymentEventRow, ReservationQuery, ReservationRow, SchedulerStatusRow, UnitRow } from '@/lib/admin/rows';
import { buildCleaningBoard, OPEN_TURNOVER_STATUSES, toTurnoverDto, toTurnoverEventDto, type CleaningBoard } from '@/lib/admin/cleaning';
import { buildAutomationsBoard, integrationSignals, type AutomationsBoard } from '@/lib/admin/automations';
import { propertyTodayIso } from '@/lib/admin/format';
import { reservesInventory } from '@/lib/booking/states';
import { isBookingState, reservationOccupies } from '@/lib/admin/presentation';

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
    clock:
      row.timezone && row.check_in_time && row.check_out_time
        ? { timezone: row.timezone, checkInTime: row.check_in_time.slice(0, 5), checkOutTime: row.check_out_time.slice(0, 5) }
        : null,
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

/* ── Canonical reservations ────────────────────────────────────────────── */

/**
 * One imported reservation → the shape a board shows.
 *
 * Nothing is interpreted beyond `occupies`, which is the single rule every
 * count on every screen depends on: a cancelled or merely requested stay does
 * not occupy the unit. The provider's own status word travels alongside, so
 * an operator can always see what Beds24 actually said.
 */
function toReservationDto(row: ReservationRow, unitNames: Map<string, string>): ReservationDto {
  return {
    id: row.id,
    externalBookingId: row.external_booking_id,
    provider: row.provider,
    unitSlug: row.unit_slug,
    unitName: unitName(row.unit_slug, unitNames.get(row.unit_id) ?? ''),
    source: row.source,
    sourceRaw: row.source_raw,
    sourceApiId: row.external_source_id,
    channelReference: row.channel_reference,
    providerStatus: row.provider_status,
    statusClass: row.status_class,
    occupies: reservationOccupies(row.status_class),
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: nightsBetween(row.check_in, row.check_out),
    guestLabel: guestListLabel(row.guest_first_name, row.guest_last_name),
    guestCountry: row.guest_country,
    adults: row.adults,
    children: row.children,
    guests: row.number_of_guests ?? (row.adults === null && row.children === null ? null : (row.adults ?? 0) + (row.children ?? 0)),
    currency: row.currency,
    totalCents: row.total_amount_cents,
    bookedAt: row.booked_at,
    modifiedAt: row.provider_modified_at,
    cancelledAt: row.provider_cancelled_at,
    directReference: row.direct_reference,
    lastSyncedAt: row.last_synced_at,
  };
}

/**
 * The reservation board: what is actually booked, from every channel.
 *
 * Cancelled stays are INCLUDED and counted separately. Leaving them out would
 * make the board disagree with Beds24 the moment a guest cancels, and a
 * cancellation an operator cannot see is a cancellation they act on too late.
 */
export async function loadReservations(query: ReservationQuery = {}): Promise<QueryResult<ReservationBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const names = await unitNameMap();
    const { rows, total } = await source.reservations({ sort: 'check_in', limit: 200, ...query });
    const items = rows.map((r) => toReservationDto(r, names));
    const bySource: Record<string, number> = {};
    for (const item of items) bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    return {
      items,
      total,
      counts: {
        active: items.filter((i) => i.statusClass === 'active').length,
        cancelled: items.filter((i) => i.statusClass === 'cancelled').length,
        other: items.filter((i) => i.statusClass !== 'active' && i.statusClass !== 'cancelled').length,
        bySource,
      },
    };
  });
}

/**
 * Operational performance over a window.
 *
 * Reads every reservation OVERLAPPING the range — not merely those arriving
 * in it — because a stay that began last month still occupies nights this
 * month, and an occupancy figure that ignored it would be wrong in exactly
 * the months that matter.
 *
 * The provider row cap is 400 per read, so this pages until the window is
 * exhausted. A bounded number of passes: a window wide enough to need more
 * than twenty of them is a window nobody is reading on a screen.
 */
export async function loadPerformance(range: DateRange): Promise<QueryResult<PerformanceReport>> {
  return guard(async () => {
    const source = await rowSource();
    const units = await source.units();

    const rows: ReservationRow[] = [];
    const PAGE = 400;
    for (let page = 0; page < 20; page += 1) {
      const result = await source.reservations({
        overlaps: { from: range.from, to: range.to },
        sort: 'check_in',
        limit: PAGE,
        offset: page * PAGE,
      });
      rows.push(...result.rows);
      if (result.rows.length < PAGE || rows.length >= result.total) break;
    }

    const names = new Map(units.map((u) => [u.id, u.display_name] as const));
    /*
     * Only units with an ENABLED provider mapping count towards available
     * room nights. An apartment that is not sold anywhere cannot depress
     * occupancy — the Opernstraße units have no mapping and must not make the
     * estate look half empty.
     */
    const measured = units.filter((u) => u.integration?.enabled);
    return buildPerformance(
      rows.map((r) => ({
        unit_slug: r.unit_slug,
        source: r.source,
        status_class: r.status_class,
        check_in: r.check_in,
        check_out: r.check_out,
        total_amount_cents: r.total_amount_cents,
        currency: r.currency,
        booked_at: r.booked_at,
      })),
      (measured.length > 0 ? measured : units).map((u) => ({
        slug: u.slug,
        display_name: unitName(u.slug, names.get(u.id) ?? ''),
      })),
      range
    );
  });
}

/**
 * Reservations as calendar stays.
 *
 * A channel reservation has no BoLaGio record page, so `href` is null and the
 * grid draws a span rather than a link. Its `reference` is the provider
 * booking id, which is what an operator quotes when they open Beds24.
 */
function toCalendarReservation(dto: ReservationDto): CalendarDto['reservations'][number] {
  return {
    reference: dto.externalBookingId,
    kind: 'reservation',
    // A channel reservation is not a BoLaGio record; there is nothing to open.
    href: null,
    unitSlug: dto.unitSlug,
    checkIn: dto.checkIn,
    checkOut: dto.checkOut,
    nights: dto.nights,
    status: dto.statusClass,
    // Money for a channel reservation is settled between the guest, the
    // channel and BoLaGio's payout — never through this system's payment
    // saga. Saying "not created" would imply a direct payment is pending.
    paymentStatus: 'not_applicable',
    source: dto.source,
    guestLabel: dto.guestLabel,
    adults: dto.adults ?? 0,
    children: dto.children ?? 0,
    providerStatus: dto.providerStatus,
    channelReference: dto.channelReference,
    occupies: dto.occupies,
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
      id: row.id,
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
      cancellation: {
        requestedAt: row.cancellation_requested_at ?? null,
        requestedBy: row.cancellation_requested_by ?? null,
        reason: row.cancellation_reason ? row.cancellation_reason.slice(0, 400) : null,
        authorizedBy: row.cancellation_authorized_by ?? null,
        completedAt: row.cancellation_completed_at ?? null,
        refundState: row.refund_state ?? 'none',
        refundRequiredCents: row.refund_required_cents ?? null,
        refundId: row.refund_id ?? null,
        refundLastError: row.refund_last_error ? row.refund_last_error.slice(0, 400) : null,
      },
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
  /** Direct bookings: this website's own, with a payment record and a detail page. */
  arrivals: BookingSummaryDto[];
  departures: BookingSummaryDto[];
  inHouse: BookingSummaryDto[];
  /**
   * Channel reservations: Booking.com, Airbnb, manual. Kept in their own
   * lists rather than merged, because they have no payment state and no
   * BoLaGio reference, and a board that pretends otherwise invents one.
   */
  channelArrivals: ReservationDto[];
  channelDepartures: ReservationDto[];
  channelInHouse: ReservationDto[];
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

    /*
     * The channel side of the door.
     *
     * Today's window is widened by one day at each end so a departure today
     * and an arrival today are both caught by one overlap query. Only
     * OCCUPYING stays reach the board: a cancelled Booking.com reservation is
     * not someone arriving, and a requested one is not someone who booked.
     */
    const canonical = await source
      .reservations({ overlaps: { from: addDaysIso(today, -1), to: addDaysIso(today, 2) }, limit: 200, sort: 'check_in' })
      .catch(() => ({ rows: [] as ReservationRow[], total: 0 }));
    const direct = new Set(Array.from(all.values()).map((r) => r.beds24_booking_id).filter((id): id is string => Boolean(id)));
    const channel = canonical.rows
      .filter((r) => !direct.has(r.external_booking_id))
      .map((r) => toReservationDto(r, names))
      .filter((r) => r.occupies);

    return {
      today,
      arrivals: items.filter((b) => b.checkIn === today),
      departures: items.filter((b) => b.checkOut === today),
      inHouse: items.filter((b) => b.checkIn < today && b.checkOut > today),
      channelArrivals: channel.filter((r) => r.checkIn === today),
      channelDepartures: channel.filter((r) => r.checkOut === today),
      channelInHouse: channel.filter((r) => r.checkIn < today && r.checkOut > today),
    };
  });
}

/** One calendar day, without pulling the whole calendar module into this file. */
function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    const [{ rows }, closed, canonical] = await Promise.all([
      source.intents({ overlaps: { from: windowStart, to: windowEnd }, limit: 200, sort: 'check_in' }),
      source.inventoryClosed(windowStart, windowEnd).catch(() => []),
      // A database without the reservation migration applied must not take
      // the calendar down with it: the channel stays are absent, the direct
      // ones still draw, and the closures still show what is taken.
      source.reservations({ overlaps: { from: windowStart, to: windowEnd }, limit: 400, sort: 'check_in' }).catch(() => ({ rows: [], total: 0 })),
    ]);

    // Only reserving states are drawn as stays. A draft or a released
    // attempt does not occupy a night and would only clutter the grid.
    const reserving = rows.filter((r) => isBookingState(r.status) && reservesInventory(r.status));
    const direct: CalendarDto['reservations'] = reserving.map((r) => {
      const s = toSummary(r, names);
      return {
        reference: s.reference,
        kind: 'intent' as const,
        href: `/admin/bookings/${encodeURIComponent(s.reference)}`,
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
        occupies: true,
      };
    });

    /*
     * The two records, merged without double counting.
     *
     * A BoLaGio direct booking that has been confirmed exists in BOTH: as the
     * intent that created it, and as the reservation Beds24 imported back. The
     * intent is the richer record — it has the payment state and a detail page
     * — so it wins, and the canonical row for the same provider booking is
     * dropped rather than drawn as a second bar on the same nights.
     *
     * Everything else — Booking.com, Airbnb, manual, unidentified — has no
     * intent and draws from the canonical record alone. That is the whole
     * point of the import: those stays used to be anonymous hatched bands.
     */
    const directProviderIds = new Set(rows.map((r) => r.beds24_booking_id).filter((id): id is string => Boolean(id)));
    const channel = canonical.rows
      .filter((r) => !directProviderIds.has(r.external_booking_id))
      .filter((r) => !r.direct_intent_id || !reserving.some((i) => i.id === r.direct_intent_id))
      .map((r) => toCalendarReservation(toReservationDto(r, names)));

    const reservations = [...direct, ...channel];

    const closures: CalendarDto['closures'] = [];
    let oldestSync: string | null = null;
    for (const unit of units) {
      const unitClosed = closed.filter((c) => c.unit_id === unit.id);
      if (unitClosed.length === 0) continue;
      // Only occupying stays EXPLAIN a closed night. A cancelled reservation
      // drawn on the grid explains nothing — if its nights are still closed at
      // the channel, that is exactly what an operator needs to see.
      const covered = nightsCovered(reservations.filter((r) => r.unitSlug === unit.slug && r.occupies));
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
    // Finance crosses over with its critical/high items only (mismatches,
    // unreconciled refunds, overdue tax deadlines, failed imports). A finance
    // read failure degrades the list; it never fails the operations screens.
    const { loadFinanceAttention } = await import('@/lib/finance/attention');
    const finance = await loadFinanceAttention(now);
    if (finance.degraded) degraded.push('finance');
    const merged = [...deduped, ...finance.items].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    return { items: merged, degraded };
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

    const [reachable, queues, meta, units, schedulers, health] = await Promise.all([
      source.ping().catch(() => false),
      source.queues().catch(() => null),
      source.inventoryMeta().catch(() => null),
      source.units().catch(() => null),
      source.schedulerStatus().catch(() => null),
      source.integrationHealth().catch(() => null),
    ]);
    const signals = health ? integrationSignals(health) : null;

    const sections: HealthSectionDto[] = [];

    // Schedulers: measured from the heartbeat each scheduled route writes.
    // A job that has never run is "not instrumented", never healthy.
    {
      const facts: HealthSectionDto['facts'] = [];
      let status: HealthSectionDto['status'] = 'healthy';
      let overdue = 0;
      let never = 0;
      for (const job of ['reconcile', 'inventory_sync', 'operations', 'reservation_sync'] as const) {
        const last = schedulers?.find((r) => r.job === job);
        if (!last) {
          never += 1;
          facts.push({ label: job.replace('_', ' '), value: 'never run', tone: 'caution' });
          continue;
        }
        const late = ageMs(last.finished_at, now) > SCHEDULER_INTERVAL_MS[job];
        if (late) overdue += 1;
        facts.push({
          label: job.replace('_', ' '),
          value: `${last.ok ? 'ok' : 'failed'} · ${Math.round(ageMs(last.finished_at, now) / 60_000)} min ago`,
          tone: late ? 'critical' : last.ok ? 'positive' : 'caution',
        });
      }
      let summary: string;
      if (schedulers === null) {
        status = 'unavailable';
        summary = 'The heartbeat table could not be read. The production-hardening migration may not be applied.';
      } else if (never === 3) {
        status = 'not_instrumented';
        summary = 'No scheduled run has been recorded. Either no schedule is configured yet, or nothing has fired since the heartbeat was introduced.';
      } else if (overdue > 0) {
        status = 'attention';
        summary = `${overdue} job${overdue === 1 ? '' : 's'} overdue. The scheduler is not firing at its expected interval.`;
      } else if (never > 0) {
        status = 'attention';
        summary = `${never} job${never === 1 ? '' : 's'} never recorded a run.`;
      } else {
        summary = 'Every scheduled job has run within its expected interval.';
      }
      sections.push({ key: 'schedulers', title: 'Schedulers', status, summary, facts });
    }

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
        ? { key: 'booking_core', title: 'Booking core', status: 'healthy', summary: 'Transactional core present: state machine, outbox, payment inbox and reconciliation queue are all readable.', facts: [gateFact(posture)] }
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
                ? `${openJobs} job${openJobs === 1 ? '' : 's'} open. Whether the schedule is firing is under Schedulers.`
                : 'No open jobs. Whether the schedule is firing is under Schedulers.',
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

    sections.push(integrationSection(signals, now));

    if (queues) {
      const stuckDeliveries = sum(queues, 'message_deliveries', ['failed']);
      const waitingDeliveries = sum(queues, 'message_deliveries', ['pending', 'sending']);
      const sentDeliveries = sum(queues, 'message_deliveries', ['sent']);
      const measured = queues.some((q) => q.queue === 'message_deliveries');
      sections.push({
        key: 'messaging',
        title: 'Guest messaging',
        status: !measured && sentDeliveries === 0 ? 'not_instrumented' : stuckDeliveries > 0 ? 'attention' : 'healthy',
        summary:
          !measured && sentDeliveries === 0
            ? 'No guest message has been prepared yet. Delivery is proven by the ledger, not by configuration.'
            : stuckDeliveries > 0
              ? `${stuckDeliveries} deliver${stuckDeliveries === 1 ? 'y' : 'ies'} failed. See Automations.`
              : 'Every prepared message has a recorded outcome or is inside its retry budget.',
        facts: [
          { label: 'Sent', value: String(sentDeliveries) },
          { label: 'Waiting', value: String(waitingDeliveries) },
          { label: 'Failed', value: String(stuckDeliveries), tone: stuckDeliveries > 0 ? 'critical' : undefined },
          { label: 'Suppressed', value: String(sum(queues, 'message_deliveries', ['suppressed'])), tone: 'muted' },
        ],
      });

      const openTurnovers = sum(queues, 'turnovers', ['required', 'in_progress']);
      const turnoverMeasured = queues.some((q) => q.queue === 'turnovers');
      sections.push({
        key: 'cleaning',
        title: 'Cleaning',
        status: !turnoverMeasured ? 'not_instrumented' : 'healthy',
        summary: !turnoverMeasured
          ? 'No turnover has been derived yet. Turnovers appear once a confirmed departure is inside the sixty-day horizon.'
          : `${openTurnovers} open turnover${openTurnovers === 1 ? '' : 's'}. Overdue windows are alerted above and listed under Cleaning.`,
        facts: [
          { label: 'Open', value: String(openTurnovers) },
          { label: 'Done', value: String(sum(queues, 'turnovers', ['done'])) },
        ],
      });
    }

    sections.push(...postureSections(posture));
    return sections;
  });
}

/**
 * Integration signals as a health section. A provider none of our code has
 * heard from is "not instrumented"; a last failure newer than the last
 * success is "attention". There is no other way to become healthy.
 */
function integrationSection(signals: IntegrationSignalDto[] | null, now: Date): HealthSectionDto {
  if (!signals) {
    return { key: 'integrations', title: 'Integration signals', status: 'unavailable', summary: 'The integration health table could not be read. The platform-completion migration may not be applied.', facts: [] };
  }
  const facts: HealthSectionDto['facts'] = signals.map((s) => ({
    label: s.label,
    value: s.status === 'never' ? 'never observed' : `${Math.round(ageMs(s.observedAt, now) / 60_000)} min ago`,
    tone: s.status === 'never' ? 'muted' : s.signal.includes('fail') ? 'caution' : 'positive',
  }));
  const observed = signals.filter((s) => s.status === 'observed');
  let status: HealthSectionDto['status'] = 'healthy';
  let summary = 'Every provider has been heard from; no failure is newer than the last success.';
  if (observed.length === 0) {
    status = 'not_instrumented';
    summary = 'No provider signal has been observed on this deployment. Nothing here is green until a real call, webhook or claim is recorded.';
  } else {
    const degraded: string[] = [];
    for (const provider of ['beds24', 'paypal'] as const) {
      const ok = signals.find((s) => s.provider === provider && s.signal === 'last_success');
      const bad = signals.find((s) => s.provider === provider && s.signal === 'last_failure');
      if (bad?.observedAt && (!ok?.observedAt || bad.observedAt > ok.observedAt)) degraded.push(provider);
    }
    const missing = ['beds24', 'paypal', 'n8n'].filter((p) => !observed.some((s) => s.provider === p));
    if (degraded.length > 0) {
      status = 'attention';
      summary = `The last call to ${degraded.join(' and ')} failed and nothing has succeeded since.`;
    } else if (missing.length > 0) {
      status = 'attention';
      summary = `Never heard from: ${missing.join(', ')}. Those signals are not instrumented, not healthy.`;
    }
  }
  return { key: 'integrations', title: 'Integration signals', status, summary, facts };
}

function gateFact(posture: ReturnType<typeof adminPosture>): HealthSectionDto['facts'][number] {
  if (!posture.directBookingEnabled) return { label: 'Direct booking', value: 'Disabled', tone: 'muted' };
  if (posture.directBookingPermitted) return { label: 'Direct booking', value: 'Enabled', tone: 'caution' };
  return { label: 'Direct booking', value: 'Flag on, refused by configuration', tone: 'critical' };
}

/**
 * The environment verdict, as a health section. A `refuse` finding is a
 * configuration incident: the launch gate is shut whatever the flag says.
 */
function configurationSection(posture: ReturnType<typeof adminPosture>): HealthSectionDto {
  const refused = posture.configFindings.filter((f) => f.severity === 'refuse');
  const warned = posture.configFindings.filter((f) => f.severity === 'warn');
  const status: HealthSectionDto['status'] = refused.length > 0 ? 'degraded' : warned.length > 0 ? 'attention' : 'healthy';
  return {
    key: 'configuration',
    title: 'Configuration',
    status,
    summary:
      refused.length > 0
        ? `${refused.length} contradiction${refused.length === 1 ? '' : 's'}. Direct booking is refused until the environment is corrected: ${refused.map((f) => f.code).join(', ')}.`
        : warned.length > 0
          ? `${warned.length} warning${warned.length === 1 ? '' : 's'}: ${warned.map((f) => f.code).join(', ')}.`
          : `Declared ${posture.environment}; no contradictions.`,
    facts: [
      { label: 'Declared as', value: posture.environment, tone: posture.environment === 'production' ? 'neutral' : 'caution' },
      { label: 'Contradictions', value: String(refused.length), tone: refused.length > 0 ? 'critical' : 'positive' },
      { label: 'Warnings', value: String(warned.length), tone: warned.length > 0 ? 'caution' : undefined },
    ],
  };
}

function postureSections(posture: ReturnType<typeof adminPosture>): HealthSectionDto[] {
  return [
    configurationSection(posture),
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


/* ── Cleaning ──────────────────────────────────────────────────────────── */

/**
 * The turnover board. Reads open turnovers across the horizon plus what was
 * recently closed; the attention reason is derived from the property clock.
 */
export async function loadCleaningBoard(now: Date = new Date()): Promise<QueryResult<CleaningBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const today = propertyTodayIso(now);
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const horizonEnd = addDaysIso(today, 60);
    const [open, closed, canonical] = await Promise.all([
      source.turnovers({ statuses: OPEN_TURNOVER_STATUSES, limit: 200 }),
      source.turnovers({ statuses: ['done', 'void'], departureFrom: since, limit: 40 }),
      source
        .reservations({ checkOutFrom: today, checkOutTo: horizonEnd, sort: 'check_out', limit: 200 })
        .catch(() => ({ rows: [] as ReservationRow[], total: 0 })),
    ]);
    const names = await unitNameMap();
    const channelDepartures = canonical.rows.map((r) => toReservationDto(r, names));
    return buildCleaningBoard([...open, ...closed], today, now, channelDepartures);
  });
}

export async function loadTurnoversForBooking(intentId: string, now: Date = new Date()): Promise<QueryResult<TurnoverDto[]>> {
  return guard(async () => {
    const source = await rowSource();
    const rows = await source.turnovers({ intentId, limit: 10 });
    const today = propertyTodayIso(now);
    return rows.map((r) => toTurnoverDto(r, today, now));
  });
}

export async function loadTurnoverEvents(turnoverId: string): Promise<QueryResult<TurnoverEventDto[]>> {
  return guard(async () => (await rowSource()).turnoverEvents(turnoverId).then((r) => r.map(toTurnoverEventDto)));
}

/* ── Automations ───────────────────────────────────────────────────────── */

export async function loadAutomationsBoard(): Promise<QueryResult<AutomationsBoard>> {
  return guard(async () => {
    const source = await rowSource();
    const rows = await source.messageDeliveries({ limit: 300 });
    return buildAutomationsBoard(rows);
  });
}

export async function loadDeliveriesForBooking(reference: string): Promise<QueryResult<MessageDeliveryDto[]>> {
  return guard(async () => {
    const { toDeliveryDto } = await import('@/lib/admin/automations');
    return (await rowSource()).messageDeliveries({ reference, limit: 50 }).then((r) => r.map(toDeliveryDto));
  });
}

/** Every expected integration signal, observed or "never observed". */
export async function loadIntegrationSignals(): Promise<QueryResult<IntegrationSignalDto[]>> {
  return guard(async () => integrationSignals(await (await rowSource()).integrationHealth()));
}

/** Refund states across bookings with a cancellation in flight — the alert input. */
async function refundSummary(source: Awaited<ReturnType<typeof rowSource>>): Promise<{ required: number; pending: number; unknown: number; failed: number; references: string[] } | null> {
  try {
    const { rows } = await source.intents({ refundStates: ['required', 'pending', 'unknown', 'failed'], limit: 100 });
    const count = (state: string) => rows.filter((r) => r.refund_state === state).length;
    return {
      required: count('required'),
      pending: count('pending'),
      unknown: count('unknown'),
      failed: count('failed'),
      references: rows.filter((r) => r.refund_state === 'unknown' || r.refund_state === 'failed').map((r) => r.reference).slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** The completion-phase inputs `deriveAlerts` takes, each `null` when it could not be read. */
async function completionAlertInputs(source: Awaited<ReturnType<typeof rowSource>>, now: Date) {
  const today = propertyTodayIso(now);
  const [deliveryRows, turnoverRows, health, refunds] = await Promise.all([
    source.messageDeliveries({ statuses: ['pending', 'sending', 'failed'], limit: 300 }).catch(() => null),
    source.turnovers({ statuses: OPEN_TURNOVER_STATUSES, limit: 200 }).catch(() => null),
    source.integrationHealth().catch(() => null),
    refundSummary(source),
  ]);
  const board = deliveryRows ? buildAutomationsBoard(deliveryRows) : null;
  const cleaning = turnoverRows ? buildCleaningBoard(turnoverRows, today, now) : null;
  return {
    deliveries: board ? { stuck: board.counts.stuck, retrying: board.counts.retrying, waiting: board.counts.waiting, oldestWaiting: board.waiting[0]?.createdAt ?? null } : null,
    turnovers: cleaning ? { overdue: cleaning.counts.overdue, unassignedSoon: [...cleaning.dueToday, ...cleaning.upcoming].filter((t) => t.attention === 'unassigned').length } : null,
    integrations: health ? integrationSignals(health) : null,
    refunds,
  };
}

/* ── Alerts ────────────────────────────────────────────────────────────── */

/**
 * The alert list: the same derivation the signed health endpoint serves, so
 * the System page and an external monitor cannot disagree.
 */
export async function loadAlerts(now: Date = new Date()): Promise<QueryResult<AlertReport>> {
  const posture = adminPosture();
  return guard(async () => {
    const source = await rowSource();
    const [reachable, queues, schedulers, meta, units, attention, completion] = await Promise.all([
      source.ping().catch(() => false),
      source.queues().catch(() => null),
      source.schedulerStatus().catch(() => [] as SchedulerStatusRow[]),
      source.inventoryMeta().catch(() => []),
      source.units().catch(() => []),
      loadAttention(now),
      completionAlertInputs(source, now),
    ]);
    const { loadFinanceAttention } = await import('@/lib/finance/attention');
    const finance = await loadFinanceAttention(now);
    return deriveAlerts({
      finance: finance.alerts,
      now,
      queues,
      databaseReachable: reachable,
      schedulers,
      attention: attention.ok ? attention.data.items : [],
      configFindings: posture.configFindings,
      inventory: meta.map((m) => ({ unitSlug: units.find((u) => u.id === m.unit_id)?.slug ?? m.unit_id, oldestSync: m.oldest_sync })),
      ...completion,
    });
  });
}
