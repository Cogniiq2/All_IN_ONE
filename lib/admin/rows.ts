/**
 * Row shapes and the read interface behind BoLaGio Control.
 *
 * `RowSource` is the one seam between the interface and where its data comes
 * from. Production reads Supabase (`source-supabase.ts`); `next dev` with an
 * explicit flag reads synthetic fixtures (`dev/fixtures.ts`). Both return the
 * same snake_case rows, so the mapping to DTOs in `queries.ts` exists once.
 *
 * Reads only. There is no write on this interface, deliberately: the only
 * writes the operations interface makes go through the booking domain's own
 * commands, from `actions.ts`.
 */

import type { BookingState, PaymentState } from '@/lib/booking/states';

export interface UnitRow {
  id: string;
  slug: string;
  display_name: string;
  max_guests: number | null;
  min_nights: number | null;
  currency: string;
  is_bookable: boolean;
  /** The unit's operational clock. Present once the production-hardening migration is applied; null before. */
  timezone: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  created_at: string;
  updated_at: string;
  integration: {
    provider: string;
    external_property_id: string;
    external_room_id: string;
    enabled: boolean;
  } | null;
}

export interface IntentRow {
  id: string;
  reference: string;
  unit_id: string;
  unit_slug: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  country: string | null;
  locale: string | null;
  currency: string;
  quoted_total_cents: number | null;
  quote_components: unknown;
  quote_expires_at: string | null;
  status: string;
  source: string;
  beds24_booking_id: string | null;
  beds24_property_id: string | null;
  beds24_room_id: string | null;
  beds24_status: string | null;
  beds24_verified_at: string | null;
  payment_provider: string | null;
  payment_status: string;
  payment_order_id: string | null;
  payment_capture_id: string | null;
  paid_amount_cents: number | null;
  paid_currency: string | null;
  refunded_amount_cents: number | null;
  /** Cancellation and refund columns (platform-completion migration). Absent on older schemas. */
  cancellation_requested_at?: string | null;
  cancellation_requested_by?: string | null;
  cancellation_reason?: string | null;
  cancellation_authorized_by?: string | null;
  cancellation_completed_at?: string | null;
  refund_state?: string | null;
  refund_required_cents?: number | null;
  refund_id?: string | null;
  refund_last_error?: string | null;
  hold_expires_at: string | null;
  lock_expires_at: string | null;
  last_failure_code: string | null;
  last_failure_reason: string | null;
  last_failure_at: string | null;
  reconciliation_state: string;
  confirmed_at: string | null;
  paid_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One canonical reservation — a stay that EXISTS at the channel manager.
 *
 * Distinct from `IntentRow`, which is a direct-booking attempt this website
 * made. A Booking.com reservation has no BLG reference, no payment state and
 * no lease; it has a provider booking id and a channel. The two are never
 * merged into one shape, because every place that treats them as the same
 * thing has to invent a fact for one of them.
 *
 * `raw_provider_snapshot` is deliberately ABSENT. It holds the provider's
 * full payload, it is server-side only, and it has no way into a DTO because
 * it has no way into this interface.
 */
export interface ReservationRow {
  id: string;
  unit_id: string;
  unit_slug: string;
  provider: string;
  external_booking_id: string;
  external_property_id: string | null;
  external_room_id: string | null;
  source: string;
  source_raw: string | null;
  /** Beds24's own numeric channel id. Not personal data; the input to widening the mapping. */
  external_source_id: number | null;
  channel_reference: string | null;
  provider_status: string;
  /** active | provisional | cancelled | blocked | unknown. */
  status_class: string;
  check_in: string;
  check_out: string;
  adults: number | null;
  children: number | null;
  number_of_guests: number | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_country: string | null;
  currency: string | null;
  total_amount_cents: number | null;
  booked_at: string | null;
  provider_modified_at: string | null;
  provider_cancelled_at: string | null;
  direct_intent_id: string | null;
  /** Joined for display when the reservation is one of ours. */
  direct_reference: string | null;
  imported_at: string;
  last_synced_at: string;
  last_seen_at: string;
}

export interface ReservationQuery {
  /** Stays overlapping a half-open window. */
  overlaps?: { from: string; to: string } | null;
  checkInFrom?: string | null;
  checkInTo?: string | null;
  checkOutFrom?: string | null;
  checkOutTo?: string | null;
  unitId?: string | null;
  sources?: readonly string[] | null;
  statusClasses?: readonly string[] | null;
  sort?: 'check_in' | 'check_out' | 'last_synced_at';
  dir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface IntentEventRow {
  id: string;
  intent_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  correlation_id: string | null;
  detail: unknown;
  created_at: string;
}

export interface OperationRow {
  id: string;
  provider: string;
  operation_type: string;
  intent_id: string | null;
  resource_id: string | null;
  outcome: string;
  attempts: number;
  started_at: string;
  completed_at: string | null;
  uncertain_at: string | null;
  reconciled_at: string | null;
  last_error: string | null;
  /** Joined for display; null when the operation has no intent. */
  reference: string | null;
}

export interface PaymentEventRow {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  verification: string;
  status: string;
  attempts: number;
  amount_cents: number | null;
  currency: string | null;
  order_id: string | null;
  capture_id: string | null;
  reference: string | null;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
}

export interface OutboxRow {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  reference: string | null;
  created_at: string;
  available_at: string;
  processed_at: string | null;
  last_error: string | null;
}

export interface JobRow {
  id: string;
  intent_id: string | null;
  reference: string | null;
  reason: string;
  severity: number;
  status: string;
  attempts: number;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution: string | null;
  last_error: string | null;
}

export interface QueueRow {
  queue: string;
  state: string;
  items: number;
  oldest: string | null;
}

export interface InventoryClosedRow {
  unit_id: string;
  date: string;
  synced_at: string;
}

export interface InventoryMetaRow {
  unit_id: string;
  days_cached: number;
  oldest_sync: string | null;
}

export interface SchedulerStatusRow {
  job: 'reconcile' | 'inventory_sync' | 'operations' | 'reservation_sync';
  started_at: string;
  finished_at: string;
  ok: boolean;
  report: Record<string, unknown> | null;
  error: string | null;
  worker: string | null;
}

export interface AuditRow {
  id: string;
  operator_email: string | null;
  action: string;
  target_type: string | null;
  target_ref: string | null;
  outcome: string;
  created_at: string;
}

export interface TurnoverRow {
  id: string;
  unit_id: string;
  intent_id: string;
  departure: string;
  window_start: string;
  window_end: string;
  next_arrival: string | null;
  same_day: boolean;
  status: string;
  assigned_to: string | null;
  note: string | null;
  started_at: string | null;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined for display. */
  reference: string | null;
  unit_slug: string;
}

export interface TurnoverEventRow {
  id: string;
  turnover_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  note: string | null;
  created_at: string;
}

export interface MessageDeliveryRow {
  id: string;
  reference: string;
  kind: string;
  sequence: number;
  channel: string;
  locale: string;
  template_id: string | null;
  template_version: string | null;
  destination_masked: string | null;
  status: string;
  retryable: boolean;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationHealthRow {
  provider: string;
  signal: string;
  observed_at: string;
  detail: string | null;
}

export interface IntentQuery {
  statuses?: readonly BookingState[] | null;
  paymentStatuses?: readonly PaymentState[] | null;
  unitId?: string | null;
  source?: string | null;
  /** Free text: reference, guest surname, guest email, external ids. */
  search?: string | null;
  checkInFrom?: string | null;
  checkInTo?: string | null;
  /** Stays overlapping a half-open window. */
  overlaps?: { from: string; to: string } | null;
  /** Restrict to rows `bolagio_ops_attention` would list. */
  attentionOnly?: boolean;
  /** Restrict to rows with any payment activity. */
  paymentActivity?: boolean;
  /** Restrict to rows whose refund saga is in one of these states. */
  refundStates?: readonly string[] | null;
  sort?: 'check_in' | 'check_out' | 'updated_at' | 'created_at' | 'quoted_total_cents' | 'paid_at';
  dir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface RowSource {
  ping(): Promise<boolean>;
  units(): Promise<UnitRow[]>;
  intents(query: IntentQuery): Promise<{ rows: IntentRow[]; total: number }>;
  intentByReference(reference: string): Promise<IntentRow | null>;
  intentEvents(intentId: string): Promise<IntentEventRow[]>;
  /**
   * Canonical reservations — what is actually booked, from every channel.
   * Guest email and phone are not selected: the board shows who is arriving,
   * not how to contact them, and contact details belong on a record page
   * behind a permission rather than in a list.
   */
  reservations(query: ReservationQuery): Promise<{ rows: ReservationRow[]; total: number }>;
  operations(query: { intentId?: string; outcomes?: readonly string[]; limit?: number }): Promise<OperationRow[]>;
  paymentEvents(query: {
    reference?: string;
    statuses?: readonly string[];
    verifications?: readonly string[];
    limit?: number;
  }): Promise<PaymentEventRow[]>;
  outbox(query: { reference?: string; statuses?: readonly string[]; limit?: number }): Promise<OutboxRow[]>;
  jobs(query: { intentId?: string; statuses?: readonly string[]; limit?: number }): Promise<JobRow[]>;
  queues(): Promise<QueueRow[]>;
  inventoryClosed(from: string, to: string): Promise<InventoryClosedRow[]>;
  inventoryMeta(): Promise<InventoryMetaRow[]>;
  audit(limit: number): Promise<AuditRow[]>;
  /** The last run per scheduled job, from the heartbeat table. Empty when nothing has ever run. */
  schedulerStatus(): Promise<SchedulerStatusRow[]>;
  turnovers(query: { statuses?: readonly string[]; departureFrom?: string; departureTo?: string; intentId?: string; limit?: number }): Promise<TurnoverRow[]>;
  turnoverEvents(turnoverId: string): Promise<TurnoverEventRow[]>;
  messageDeliveries(query: { reference?: string; statuses?: readonly string[]; limit?: number }): Promise<MessageDeliveryRow[]>;
  /** Last observation per (provider, signal). Empty rows mean "never observed", never "healthy". */
  integrationHealth(): Promise<IntegrationHealthRow[]>;
}

/** The statuses `bolagio_ops_attention` lists, mirrored for the list filter. */
export const ATTENTION_STATUSES: readonly BookingState[] = [
  'locking',
  'paid',
  'paid_unfinalized',
  'finalization_failed',
  'releasing',
  'release_failed',
  'manual_review',
];
