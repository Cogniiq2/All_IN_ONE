import 'server-only';

/**
 * The production row source: Supabase, read with the service role.
 *
 * Column lists are explicit everywhere. `provider_snapshot`, `idempotency_key`
 * and the raw webhook `payload` are never selected, so they cannot reach a
 * DTO by accident. Free-text search is reduced to a safe character set before
 * it is placed in a PostgREST filter.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type {
  AuditRow,
  IntegrationHealthRow,
  IntentEventRow,
  MessageDeliveryRow,
  TurnoverEventRow,
  TurnoverRow,
  IntentQuery,
  IntentRow,
  InventoryClosedRow,
  InventoryMetaRow,
  JobRow,
  OperationRow,
  OutboxRow,
  PaymentEventRow,
  QueueRow,
  ReservationQuery,
  ReservationRow,
  RowSource,
  SchedulerStatusRow,
  UnitRow,
} from '@/lib/admin/rows';
import { ATTENTION_STATUSES } from '@/lib/admin/rows';

/**
 * Canonical reservation columns, explicit and short of two things on purpose.
 *
 * `raw_provider_snapshot` is never selected: it is the provider's full
 * payload and has no business leaving the server. Guest email and phone are
 * never selected either — the boards show who is arriving, and a list of
 * contact details is a bigger disclosure than any screen here needs.
 */
const RESERVATION_COLUMNS =
  'id, unit_id, provider, external_booking_id, external_property_id, external_room_id,' +
  ' source, source_raw, external_source_id, channel_reference, provider_status, status_class, check_in, check_out,' +
  ' adults, children, number_of_guests, guest_first_name, guest_last_name, guest_country,' +
  ' currency, total_amount_cents, booked_at, provider_modified_at, provider_cancelled_at,' +
  ' direct_intent_id, imported_at, last_synced_at, last_seen_at,' +
  ' bolagio_units(slug), bolagio_booking_intents(reference)';

type RawReservation = Omit<ReservationRow, 'unit_slug' | 'direct_reference'> & {
  bolagio_units?: { slug: string } | { slug: string }[] | null;
  bolagio_booking_intents?: { reference: string } | { reference: string }[] | null;
};

function toReservationRow(raw: RawReservation): ReservationRow {
  const unit = Array.isArray(raw.bolagio_units) ? raw.bolagio_units[0] : raw.bolagio_units;
  const intent = Array.isArray(raw.bolagio_booking_intents) ? raw.bolagio_booking_intents[0] : raw.bolagio_booking_intents;
  const { bolagio_units: _u, bolagio_booking_intents: _i, ...rest } = raw;
  return { ...rest, unit_slug: unit?.slug ?? '', direct_reference: intent?.reference ?? null };
}

const INTENT_COLUMNS =
  'id, reference, unit_id, check_in, check_out, adults, children,' +
  ' guest_first_name, guest_last_name, guest_email, guest_phone, country, locale,' +
  ' currency, quoted_total_cents, quote_components, quote_expires_at, status, source,' +
  ' beds24_booking_id, beds24_property_id, beds24_room_id, beds24_status, beds24_verified_at,' +
  ' payment_provider, payment_status, payment_order_id, payment_capture_id,' +
  ' paid_amount_cents, paid_currency, refunded_amount_cents, hold_expires_at, lock_expires_at,' +
  ' cancellation_requested_at, cancellation_requested_by, cancellation_reason, cancellation_authorized_by, cancellation_completed_at,' +
  ' refund_state, refund_required_cents, refund_id, refund_last_error,' +
  ' last_failure_code, last_failure_reason, last_failure_at, reconciliation_state,' +
  ' confirmed_at, paid_at, released_at, created_at, updated_at, bolagio_units(slug)';

type RawIntent = Omit<IntentRow, 'unit_slug'> & { bolagio_units?: { slug: string } | { slug: string }[] | null };

function toIntentRow(raw: RawIntent): IntentRow {
  const unit = Array.isArray(raw.bolagio_units) ? raw.bolagio_units[0] : raw.bolagio_units;
  const { bolagio_units: _units, ...rest } = raw;
  return { ...rest, unit_slug: unit?.slug ?? '' };
}

/** Letters, digits and the few punctuation marks a reference, an email or an id can contain. */
function safeSearch(text: string): string {
  return text.replace(/[^A-Za-z0-9@._\- ]/g, '').trim().slice(0, 80);
}

export function supabaseRowSource(): RowSource {
  return {
    async ping() {
      const { error } = await supabaseAdmin().from('bolagio_units').select('id', { head: true, count: 'exact' });
      return !error;
    },

    async units() {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_units')
        .select(
          'id, slug, display_name, max_guests, min_nights, currency, is_bookable, timezone, check_in_time, check_out_time, created_at, updated_at,' +
            ' bolagio_unit_integrations(provider, external_property_id, external_room_id, enabled)'
        )
        .order('display_name');
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Omit<UnitRow, 'integration'> & { bolagio_unit_integrations?: UnitRow['integration'][] | null }>).map(
        (row) => {
          const { bolagio_unit_integrations, ...rest } = row;
          const mapping = (bolagio_unit_integrations ?? []).find((m) => m?.enabled) ?? bolagio_unit_integrations?.[0] ?? null;
          return { ...rest, integration: mapping };
        }
      );
    },

    async intents(query) {
      let q = supabaseAdmin().from('bolagio_booking_intents').select(INTENT_COLUMNS, { count: 'exact' });

      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      if (query.paymentStatuses && query.paymentStatuses.length > 0) q = q.in('payment_status', query.paymentStatuses as string[]);
      if (query.unitId) q = q.eq('unit_id', query.unitId);
      if (query.source) q = q.eq('source', query.source);
      if (query.checkInFrom) q = q.gte('check_in', query.checkInFrom);
      if (query.checkInTo) q = q.lt('check_in', query.checkInTo);
      if (query.overlaps) q = q.lt('check_in', query.overlaps.to).gt('check_out', query.overlaps.from);
      if (query.attentionOnly) {
        q = q.or(`status.in.(${ATTENTION_STATUSES.join(',')}),payment_status.eq.unknown,reconciliation_state.neq.ok`);
      }
      if (query.paymentActivity) {
        q = q.or('payment_status.neq.not_created,payment_order_id.not.is.null');
      }
      if (query.refundStates && query.refundStates.length > 0) q = q.in('refund_state', [...query.refundStates]);
      const search = query.search ? safeSearch(query.search) : '';
      if (search) {
        const like = `%${search}%`;
        q = q.or(
          `reference.ilike.${like},guest_last_name.ilike.${like},guest_email.ilike.${like},beds24_booking_id.eq.${search},payment_order_id.eq.${search},payment_capture_id.eq.${search}`
        );
      }

      const sort = query.sort ?? 'check_in';
      q = q.order(sort, { ascending: query.dir !== 'desc', nullsFirst: false });
      if (sort !== 'created_at') q = q.order('created_at', { ascending: false });

      const limit = Math.min(200, Math.max(1, query.limit ?? 40));
      const offset = Math.max(0, query.offset ?? 0);
      q = q.range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: ((data ?? []) as unknown as RawIntent[]).map(toIntentRow), total: count ?? 0 };
    },

    async intentByReference(reference) {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_booking_intents')
        .select(INTENT_COLUMNS)
        .eq('reference', reference)
        .maybeSingle();
      if (error) throw error;
      return data ? toIntentRow(data as unknown as RawIntent) : null;
    },

    async intentEvents(intentId) {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_booking_intent_events')
        .select('id, intent_id, from_status, to_status, reason, correlation_id, detail, created_at')
        .eq('intent_id', intentId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as IntentEventRow[];
    },

    async reservations(query: ReservationQuery) {
      let q = supabaseAdmin().from('bolagio_reservations').select(RESERVATION_COLUMNS, { count: 'exact' });

      if (query.unitId) q = q.eq('unit_id', query.unitId);
      if (query.sources && query.sources.length > 0) q = q.in('source', query.sources as string[]);
      if (query.statusClasses && query.statusClasses.length > 0) q = q.in('status_class', query.statusClasses as string[]);
      if (query.checkInFrom) q = q.gte('check_in', query.checkInFrom);
      if (query.checkInTo) q = q.lt('check_in', query.checkInTo);
      if (query.checkOutFrom) q = q.gte('check_out', query.checkOutFrom);
      if (query.checkOutTo) q = q.lt('check_out', query.checkOutTo);
      // Half-open overlap: a stay touches the window when it starts before the
      // window ends and ends after the window starts. A departure on the first
      // day of the window is not an occupied night and does not overlap.
      if (query.overlaps) q = q.lt('check_in', query.overlaps.to).gt('check_out', query.overlaps.from);

      const sort = query.sort ?? 'check_in';
      q = q.order(sort, { ascending: query.dir !== 'desc', nullsFirst: false });
      const limit = Math.min(400, Math.max(1, query.limit ?? 200));
      const offset = Math.max(0, query.offset ?? 0);
      q = q.range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: ((data ?? []) as unknown as RawReservation[]).map(toReservationRow), total: count ?? 0 };
    },

    async operations(query) {
      let q = supabaseAdmin()
        .from('bolagio_external_operations')
        .select(
          'id, provider, operation_type, intent_id, resource_id, outcome, attempts, started_at, completed_at,' +
            ' uncertain_at, reconciled_at, last_error, bolagio_booking_intents(reference)'
        )
        .order('started_at', { ascending: false })
        .limit(Math.min(200, query.limit ?? 50));
      if (query.intentId) q = q.eq('intent_id', query.intentId);
      if (query.outcomes && query.outcomes.length > 0) q = q.in('outcome', query.outcomes as string[]);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Omit<OperationRow, 'reference'> & { bolagio_booking_intents?: { reference: string } | { reference: string }[] | null }>).map(
        (row) => {
          const { bolagio_booking_intents, ...rest } = row;
          const joined = Array.isArray(bolagio_booking_intents) ? bolagio_booking_intents[0] : bolagio_booking_intents;
          return { ...rest, reference: joined?.reference ?? null };
        }
      );
    },

    async paymentEvents(query) {
      let q = supabaseAdmin()
        .from('bolagio_payment_events')
        .select(
          'id, provider, provider_event_id, event_type, verification, status, attempts, amount_cents, currency,' +
            ' order_id, capture_id, reference, received_at, processed_at, last_error'
        )
        .order('received_at', { ascending: false })
        .limit(Math.min(200, query.limit ?? 50));
      if (query.reference) q = q.eq('reference', query.reference);
      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      if (query.verifications && query.verifications.length > 0) q = q.in('verification', query.verifications as string[]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PaymentEventRow[];
    },

    async outbox(query) {
      let q = supabaseAdmin()
        .from('bolagio_outbox_events')
        .select('id, event_type, status, attempts, reference, created_at, available_at, processed_at, last_error')
        .order('created_at', { ascending: false })
        .limit(Math.min(200, query.limit ?? 50));
      if (query.reference) q = q.eq('reference', query.reference);
      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OutboxRow[];
    },

    async jobs(query) {
      let q = supabaseAdmin()
        .from('bolagio_reconciliation_jobs')
        .select(
          'id, intent_id, reference, reason, severity, status, attempts, next_attempt_at, created_at, updated_at,' +
            ' resolved_at, resolution, last_error'
        )
        .order('severity', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(Math.min(200, query.limit ?? 50));
      if (query.intentId) q = q.eq('intent_id', query.intentId);
      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as JobRow[];
    },

    async queues() {
      const { data, error } = await supabaseAdmin().from('bolagio_ops_queues').select('queue, state, items, oldest');
      if (error) throw error;
      return ((data ?? []) as Array<{ queue: string; state: string; items: number | string; oldest: string | null }>).map((r) => ({
        queue: r.queue,
        state: r.state,
        items: Number(r.items),
        oldest: r.oldest,
      }));
    },

    async inventoryClosed(from, to) {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_unit_inventory_days')
        .select('unit_id, date, synced_at')
        .eq('is_available', false)
        .gte('date', from)
        .lt('date', to)
        .order('date', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryClosedRow[];
    },

    async inventoryMeta() {
      // One row per unit: how many days are cached and the oldest sync among them.
      // PostgREST cannot aggregate without an RPC, so this reads the two ends
      // of each unit's window instead — cheap, and enough to judge staleness.
      const { data, error } = await supabaseAdmin()
        .from('bolagio_unit_inventory_days')
        .select('unit_id, synced_at')
        .order('synced_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      const byUnit = new Map<string, InventoryMetaRow>();
      for (const row of (data ?? []) as Array<{ unit_id: string; synced_at: string }>) {
        const entry = byUnit.get(row.unit_id) ?? { unit_id: row.unit_id, days_cached: 0, oldest_sync: null };
        entry.days_cached += 1;
        if (!entry.oldest_sync || row.synced_at < entry.oldest_sync) entry.oldest_sync = row.synced_at;
        byUnit.set(row.unit_id, entry);
      }
      return Array.from(byUnit.values());
    },

    async schedulerStatus() {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_scheduler_status')
        .select('job, started_at, finished_at, ok, report, error, worker');
      if (error) throw error;
      return (data ?? []) as unknown as SchedulerStatusRow[];
    },

    async turnovers(query) {
      let q = supabaseAdmin()
        .from('bolagio_turnovers')
        .select(
          'id, unit_id, intent_id, departure, window_start, window_end, next_arrival, same_day, status, assigned_to, note,' +
            ' started_at, done_at, done_by, created_at, updated_at, bolagio_booking_intents(reference), bolagio_units(slug)'
        )
        .order('departure', { ascending: true })
        .limit(Math.min(400, query.limit ?? 200));
      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      if (query.departureFrom) q = q.gte('departure', query.departureFrom);
      if (query.departureTo) q = q.lt('departure', query.departureTo);
      if (query.intentId) q = q.eq('intent_id', query.intentId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Omit<TurnoverRow, 'reference' | 'unit_slug'> & { bolagio_booking_intents?: { reference: string } | { reference: string }[] | null; bolagio_units?: { slug: string } | { slug: string }[] | null }>).map((row) => {
        const { bolagio_booking_intents, bolagio_units, ...rest } = row;
        const intent = Array.isArray(bolagio_booking_intents) ? bolagio_booking_intents[0] : bolagio_booking_intents;
        const unit = Array.isArray(bolagio_units) ? bolagio_units[0] : bolagio_units;
        return { ...rest, reference: intent?.reference ?? null, unit_slug: unit?.slug ?? '' };
      });
    },

    async turnoverEvents(turnoverId) {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_turnover_events')
        .select('id, turnover_id, from_status, to_status, actor, note, created_at')
        .eq('turnover_id', turnoverId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as TurnoverEventRow[];
    },

    async messageDeliveries(query) {
      let q = supabaseAdmin()
        .from('bolagio_message_deliveries')
        .select(
          'id, reference, kind, sequence, channel, locale, template_id, template_version, destination_masked, status, retryable,' +
            ' attempts, max_attempts, next_attempt_at, provider, provider_message_id, last_error, sent_at, failed_at, created_at, updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(Math.min(400, query.limit ?? 100));
      if (query.reference) q = q.eq('reference', query.reference);
      if (query.statuses && query.statuses.length > 0) q = q.in('status', query.statuses as string[]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as MessageDeliveryRow[];
    },

    async integrationHealth() {
      const { data, error } = await supabaseAdmin().from('bolagio_integration_health').select('provider, signal, observed_at, detail');
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationHealthRow[];
    },

    async audit(limit) {
      const { data, error } = await supabaseAdmin()
        .from('bolagio_admin_audit_log')
        .select('id, operator_email, action, target_type, target_ref, outcome, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(200, limit));
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  };
}
