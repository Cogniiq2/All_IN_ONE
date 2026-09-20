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
  job: 'reconcile' | 'inventory_sync' | 'operations';
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
