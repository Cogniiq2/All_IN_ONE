/**
 * ══════════════════════════════════════════════════════════════════════════
 * DEVELOPMENT FIXTURES — never production truth.
 *
 * Reached only through `adminMode() === 'fixture'`, which is a constant false
 * in a production build. Everything here is synthetic: RFC 2606 example.com
 * addresses, canonical placeholder names, invented ids. It exists so the
 * operations interface can be seen, exercised and QA'd — every state, every
 * exception, every empty case — without a live project.
 *
 * The rows are the same snake_case shapes Supabase returns, so the mapping in
 * `queries.ts` is exercised by fixtures exactly as it is by production.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type {
  AuditRow,
  IntentEventRow,
  IntentQuery,
  IntentRow,
  InventoryClosedRow,
  InventoryMetaRow,
  JobRow,
  OperationRow,
  OutboxRow,
  PaymentEventRow,
  QueueRow,
  RowSource,
  UnitRow,
} from '@/lib/admin/rows';
import { ATTENTION_STATUSES } from '@/lib/admin/rows';
import { addDays, propertyToday } from '@/lib/booking/stay-rules';

const today = propertyToday();
const day = (offset: number) => addDays(today, offset);
const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(`${day(dayOffset)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+02:00`);
  return d.toISOString();
};

const UNITS: UnitRow[] = [
  { id: 'u-s1', slug: 'schulstrasse-i', display_name: 'Schulstraße I', max_guests: null, min_nights: null, currency: 'EUR', is_bookable: true, created_at: at(-120, 9), updated_at: at(-3, 9), integration: { provider: 'beds24', external_property_id: '354659', external_room_id: '731147', enabled: true } },
  { id: 'u-s2', slug: 'schulstrasse-ii', display_name: 'Schulstraße II', max_guests: null, min_nights: null, currency: 'EUR', is_bookable: true, created_at: at(-120, 9), updated_at: at(-3, 9), integration: { provider: 'beds24', external_property_id: '354658', external_room_id: '731146', enabled: true } },
  { id: 'u-o1', slug: 'opernstrasse-i', display_name: 'Opernstraße I', max_guests: null, min_nights: null, currency: 'EUR', is_bookable: false, created_at: at(-120, 9), updated_at: at(-120, 9), integration: null },
  { id: 'u-o2', slug: 'opernstrasse-ii', display_name: 'Opernstraße II', max_guests: null, min_nights: null, currency: 'EUR', is_bookable: false, created_at: at(-120, 9), updated_at: at(-120, 9), integration: null },
  { id: 'u-o3', slug: 'opernstrasse-iii', display_name: 'Opernstraße III', max_guests: null, min_nights: null, currency: 'EUR', is_bookable: false, created_at: at(-120, 9), updated_at: at(-120, 9), integration: null },
];

interface Seed {
  id: string;
  ref: string;
  unit: 'u-s1' | 'u-s2';
  in: number;
  out: number;
  adults?: number;
  children?: number;
  first: string;
  last: string;
  country?: string;
  total: number;
  status: string;
  payment: string;
  source?: string;
  beds24?: string;
  beds24Status?: string;
  order?: string;
  capture?: string;
  paidAt?: string;
  confirmedAt?: string;
  code?: string;
  reason?: string;
  recon?: string;
  hold?: string;
  created: string;
  updated: string;
}

const SEEDS: Seed[] = [
  { id: 'i-01', ref: 'BLG-7K2M9P', unit: 'u-s1', in: -4, out: 0, first: 'Anna', last: 'Mustermann', country: 'DE', total: 58000, status: 'confirmed', payment: 'paid', beds24: '78120441', beds24Status: 'confirmed', order: '5O190127TN364715T', capture: '3C679366HH908993F', paidAt: at(-9, 10, 12), confirmedAt: at(-9, 10, 14), created: at(-9, 10, 4), updated: at(-9, 10, 14) },
  { id: 'i-02', ref: 'BLG-QX4T8W', unit: 'u-s2', in: 0, out: 3, adults: 2, children: 1, first: 'Erika', last: 'Musterfrau', country: 'AT', total: 43500, status: 'confirmed', payment: 'paid', beds24: '78120502', beds24Status: 'confirmed', order: '8XK52193WD720231L', capture: '9AB13366HH908001Q', paidAt: at(-6, 18, 40), confirmedAt: at(-6, 18, 41), created: at(-6, 18, 31), updated: at(-6, 18, 41) },
  { id: 'i-03', ref: 'BLG-N3H6VD', unit: 'u-s1', in: 0, out: 5, first: 'Max', last: 'Beispiel', country: 'DE', total: 72500, status: 'paid_unfinalized', payment: 'paid', beds24: '78120633', beds24Status: 'new', order: '1QW23412KD001883N', capture: '6TR90127HH551002Z', paidAt: at(0, 7, 52), code: 'BEDS24_FINALIZATION_FAILED', reason: 'expected status confirmed, read back new', recon: 'pending', created: at(0, 7, 44), updated: at(0, 7, 55) },
  { id: 'i-04', ref: 'BLG-J8R2CF', unit: 'u-s2', in: 3, out: 7, first: 'Lena', last: 'Schmidt-Beispielhausen', country: 'CH', total: 61000, status: 'release_failed', payment: 'cancelled', beds24: '78119977', beds24Status: 'new', order: '2AA10011KD777883N', code: 'BEDS24_RELEASE_FAILED', reason: 'cancel request timed out', recon: 'failed', created: at(-1, 21, 2), updated: at(-1, 22, 30) },
  { id: 'i-05', ref: 'BLG-W5P7ZK', unit: 'u-s1', in: 9, out: 12, first: 'Jonas', last: 'Fischer', country: 'DE', total: 45000, status: 'manual_review', payment: 'unknown', beds24: '78120710', beds24Status: 'new', order: '4ZZ88811KD222883P', capture: '1MM19127HH551444K', code: 'PAYMENT_AMOUNT_MISMATCH', reason: 'payment capture did not match the authoritative quote', recon: 'manual', created: at(-2, 11, 5), updated: at(-2, 11, 9) },
  { id: 'i-06', ref: 'BLG-D9M4XQ', unit: 'u-s2', in: 12, out: 16, first: 'Sophie', last: 'Weber', country: 'DE', total: 60000, status: 'hold_created', payment: 'order_created', beds24: '78120802', beds24Status: 'new', order: '7PP11133KD990123R', hold: at(0, 14, 25), created: at(0, 14, 10), updated: at(0, 14, 12) },
  { id: 'i-07', ref: 'BLG-F2V8HN', unit: 'u-s1', in: 15, out: 19, first: 'Tom', last: 'Becker', country: 'NL', total: 59000, status: 'confirmed', payment: 'paid', beds24: '78120555', beds24Status: 'confirmed', order: '9LL33322KD555123T', capture: '2NN55127HH551777V', paidAt: at(-3, 16, 20), confirmedAt: at(-3, 16, 22), created: at(-3, 16, 11), updated: at(-3, 16, 22) },
  { id: 'i-08', ref: 'BLG-T6K3RB', unit: 'u-s2', in: 20, out: 27, first: 'Clara', last: 'Hoffmann', country: 'DE', total: 105000, status: 'confirmed', payment: 'paid', beds24: '78120590', beds24Status: 'confirmed', order: '3RR44455KD666123U', capture: '4SS66127HH551888W', paidAt: at(-5, 9, 2), confirmedAt: at(-5, 9, 3), created: at(-5, 8, 50), updated: at(-5, 9, 3) },
  { id: 'i-09', ref: 'BLG-C4N7WG', unit: 'u-s1', in: 6, out: 8, first: 'Paul', last: 'Meyer', country: 'DE', total: 30000, status: 'payment_failed', payment: 'denied', beds24: '78120820', beds24Status: 'new', order: '6TT77788KD888123X', hold: at(0, 16, 40), code: 'BEDS24_HOLD_REJECTED', created: at(0, 16, 25), updated: at(0, 16, 33) },
  { id: 'i-10', ref: 'BLG-M8X2PL', unit: 'u-s2', in: -10, out: -7, first: 'Julia', last: 'Koch', country: 'DE', total: 43500, status: 'confirmed', payment: 'paid', beds24: '78119001', beds24Status: 'confirmed', order: '5UU99900KD111123Y', capture: '7VV11127HH551999A', paidAt: at(-14, 12, 0), confirmedAt: at(-14, 12, 1), created: at(-14, 11, 50), updated: at(-14, 12, 1) },
  { id: 'i-11', ref: 'BLG-R3G9TC', unit: 'u-s1', in: 30, out: 33, first: 'Felix', last: 'Wagner', country: 'DE', total: 45000, status: 'expired', payment: 'cancelled', beds24: '78120901', beds24Status: 'new', order: '8WW22211KD333123B', code: 'BOOKING_LEASE_EXPIRED', created: at(-1, 13, 0), updated: at(-1, 13, 40) },
  { id: 'i-12', ref: 'BLG-H7B4KD', unit: 'u-s2', in: 40, out: 44, first: 'Marie', last: 'Schulz', country: 'FR', total: 61000, status: 'released', payment: 'cancelled', beds24: '78120930', beds24Status: 'cancelled', order: '1XX33322KD444123C', created: at(-2, 9, 15), updated: at(-2, 9, 50) },
  { id: 'i-13', ref: 'BLG-V2Q6NM', unit: 'u-s1', in: 22, out: 25, first: 'Nina', last: 'Zimmermann', country: 'DE', total: 45000, status: 'cancelled', payment: 'not_created', created: at(-8, 20, 0), updated: at(-8, 20, 3) },
  { id: 'i-14', ref: 'BLG-P9W3FT', unit: 'u-s2', in: 60, out: 65, adults: 3, first: 'Lukas', last: 'Braun', country: 'DE', total: 76000, status: 'confirmed', payment: 'paid', source: 'manual', beds24: '78120111', beds24Status: 'confirmed', paidAt: at(-1, 15, 0), confirmedAt: at(-1, 15, 5), created: at(-1, 14, 55), updated: at(-1, 15, 5) },
  { id: 'i-15', ref: 'BLG-K5D8JR', unit: 'u-s1', in: 1, out: 2, first: 'Ben', last: 'Lange', country: 'DE', total: 15000, status: 'quote_expired', payment: 'not_created', created: at(-3, 23, 10), updated: at(-3, 23, 35) },
];

const INTENTS: IntentRow[] = SEEDS.map((s) => {
  const unit = UNITS.find((u) => u.id === s.unit)!;
  return {
    id: s.id,
    reference: s.ref,
    unit_id: s.unit,
    unit_slug: unit.slug,
    check_in: day(s.in),
    check_out: day(s.out),
    adults: s.adults ?? 2,
    children: s.children ?? 0,
    guest_first_name: s.first,
    guest_last_name: s.last,
    guest_email: `${s.first.toLowerCase()}.${s.last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
    guest_phone: '+49 170 0000000',
    country: s.country ?? null,
    locale: 'de',
    currency: 'EUR',
    quoted_total_cents: s.total,
    quote_components: [
      { code: 'accommodation', label: { de: 'Unterkunft', en: 'Accommodation' }, amountCents: s.total - 5000, mandatory: true, taxCategory: 'accommodation' },
      { code: 'cleaning', label: { de: 'Endreinigung', en: 'Final cleaning' }, amountCents: 5000, mandatory: true, taxCategory: 'service' },
    ],
    quote_expires_at: null,
    status: s.status,
    source: s.source ?? 'direct',
    beds24_booking_id: s.beds24 ?? null,
    beds24_property_id: s.beds24 ? unit.integration!.external_property_id : null,
    beds24_room_id: s.beds24 ? unit.integration!.external_room_id : null,
    beds24_status: s.beds24Status ?? null,
    beds24_verified_at: s.beds24Status === 'confirmed' ? s.confirmedAt ?? null : s.beds24 ? s.created : null,
    payment_provider: s.order ? 'paypal' : null,
    payment_status: s.payment,
    payment_order_id: s.order ?? null,
    payment_capture_id: s.capture ?? null,
    paid_amount_cents: s.capture ? (s.code === 'PAYMENT_AMOUNT_MISMATCH' ? s.total - 1500 : s.total) : null,
    paid_currency: s.capture ? 'EUR' : null,
    refunded_amount_cents: 0,
    hold_expires_at: s.hold ?? null,
    lock_expires_at: null,
    last_failure_code: s.code ?? null,
    last_failure_reason: s.reason ?? null,
    last_failure_at: s.code ? s.updated : null,
    reconciliation_state: s.recon ?? 'ok',
    confirmed_at: s.confirmedAt ?? null,
    paid_at: s.paidAt ?? null,
    released_at: s.status === 'released' ? s.updated : null,
    created_at: s.created,
    updated_at: s.updated,
  };
});

function lifecycle(id: string, steps: Array<[string | null, string, string, number]>): IntentEventRow[] {
  const intent = INTENTS.find((i) => i.id === id)!;
  const base = new Date(intent.created_at).getTime();
  return steps.map(([from, to, reason, minutes], n) => ({
    id: `${id}-e${n}`,
    intent_id: id,
    from_status: from,
    to_status: to,
    reason,
    correlation_id: `corr-${id}-${Math.floor(n / 3)}`,
    detail:
      to === 'paid'
        ? { payment_status: 'paid', payment_order_id: intent.payment_order_id, paid_amount_cents: intent.paid_amount_cents, paid_currency: 'EUR' }
        : to === 'hold_created'
          ? { beds24_booking_id: intent.beds24_booking_id, beds24_status: 'new' }
          : to === 'confirmed'
            ? { beds24_status: 'confirmed' }
            : intent.last_failure_code && to === intent.status
              ? { last_failure_code: intent.last_failure_code, last_failure_reason: intent.last_failure_reason }
              : null,
    created_at: new Date(base + minutes * 60_000).toISOString(),
  }));
}

const HAPPY: Array<[string | null, string, string, number]> = [
  [null, 'draft', 'intent_created', 0],
  ['draft', 'quoted', 'quote_attached', 1],
  ['quoted', 'locking', 'lock_acquired', 2],
  ['locking', 'hold_created', 'hold_created', 3],
  ['hold_created', 'payment_session_created', 'order_created', 4],
  ['payment_session_created', 'awaiting_payment', 'guest_at_provider', 5],
  ['awaiting_payment', 'paid', 'payment_captured', 8],
  ['paid', 'finalizing', 'finalize_started', 9],
  ['finalizing', 'confirmed', 'finalize_verified', 10],
];

const EVENTS: IntentEventRow[] = [
  ...['i-01', 'i-02', 'i-07', 'i-08', 'i-10'].flatMap((id) => lifecycle(id, HAPPY)),
  ...lifecycle('i-14', [[null, 'draft', 'intent_created', 0], ['draft', 'quoted', 'quote_attached', 1], ['quoted', 'locking', 'lock_acquired', 2], ['locking', 'hold_created', 'hold_created', 3], ['hold_created', 'paid', 'manual: bank transfer received by L. Cogniiq', 5], ['paid', 'finalizing', 'finalize_started', 6], ['finalizing', 'confirmed', 'finalize_verified', 10]]),
  ...lifecycle('i-03', [...HAPPY.slice(0, 8), ['finalizing', 'paid_unfinalized', 'BEDS24_FINALIZATION_FAILED', 11]]),
  ...lifecycle('i-04', [...HAPPY.slice(0, 6), ['awaiting_payment', 'payment_cancelled', 'guest_cancelled', 20], ['payment_cancelled', 'releasing', 'lease_expired', 85], ['releasing', 'release_failed', 'BEDS24_RELEASE_FAILED', 88]]),
  ...lifecycle('i-05', [...HAPPY.slice(0, 6), ['awaiting_payment', 'manual_review', 'PAYMENT_AMOUNT_MISMATCH', 4]]),
  ...lifecycle('i-06', HAPPY.slice(0, 5)),
  ...lifecycle('i-09', [...HAPPY.slice(0, 6), ['awaiting_payment', 'payment_failed', 'capture_denied', 8]]),
  ...lifecycle('i-11', [...HAPPY.slice(0, 6), ['awaiting_payment', 'expired', 'lease_expired', 40]]),
  ...lifecycle('i-12', [...HAPPY.slice(0, 6), ['awaiting_payment', 'payment_cancelled', 'guest_cancelled', 12], ['payment_cancelled', 'releasing', 'lease_expired', 30], ['releasing', 'released', 'release_verified', 35]]),
  ...lifecycle('i-13', [[null, 'draft', 'intent_created', 0], ['draft', 'quoted', 'quote_attached', 1], ['quoted', 'cancelled', 'guest_abandoned', 3]]),
  ...lifecycle('i-15', [[null, 'draft', 'intent_created', 0], ['draft', 'quoted', 'quote_attached', 1], ['quoted', 'quote_expired', 'quote_aged_out', 25]]),
];

const OPERATIONS: OperationRow[] = [
  { id: 'op-1', provider: 'beds24', operation_type: 'create_hold', intent_id: 'i-03', resource_id: '78120633', outcome: 'succeeded', attempts: 1, started_at: at(0, 7, 46), completed_at: at(0, 7, 46), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-N3H6VD' },
  { id: 'op-2', provider: 'paypal', operation_type: 'capture', intent_id: 'i-03', resource_id: '6TR90127HH551002Z', outcome: 'succeeded', attempts: 1, started_at: at(0, 7, 52), completed_at: at(0, 7, 52), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-N3H6VD' },
  { id: 'op-3', provider: 'beds24', operation_type: 'finalize', intent_id: 'i-03', resource_id: '78120633', outcome: 'failed', attempts: 3, started_at: at(0, 7, 53), completed_at: at(0, 8, 20), uncertain_at: null, reconciled_at: null, last_error: 'Beds24Error: status confirmed not accepted for property (HTTP 400)', reference: 'BLG-N3H6VD' },
  { id: 'op-4', provider: 'beds24', operation_type: 'release', intent_id: 'i-04', resource_id: '78119977', outcome: 'outcome_unknown', attempts: 1, started_at: at(-1, 22, 28), completed_at: null, uncertain_at: at(-1, 22, 30), reconciled_at: null, last_error: 'TimeoutError: request to Beds24 exceeded 8000ms', reference: 'BLG-J8R2CF' },
  { id: 'op-5', provider: 'beds24', operation_type: 'create_hold', intent_id: 'i-06', resource_id: '78120802', outcome: 'succeeded', attempts: 1, started_at: at(0, 14, 11), completed_at: at(0, 14, 11), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-D9M4XQ' },
  { id: 'op-6', provider: 'paypal', operation_type: 'create_order', intent_id: 'i-06', resource_id: '7PP11133KD990123R', outcome: 'succeeded', attempts: 1, started_at: at(0, 14, 12), completed_at: at(0, 14, 12), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-D9M4XQ' },
  { id: 'op-7', provider: 'beds24', operation_type: 'create_hold', intent_id: 'i-02', resource_id: '78120502', outcome: 'succeeded', attempts: 1, started_at: at(-6, 18, 34), completed_at: at(-6, 18, 34), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-QX4T8W' },
  { id: 'op-8', provider: 'paypal', operation_type: 'capture', intent_id: 'i-02', resource_id: '9AB13366HH908001Q', outcome: 'succeeded', attempts: 1, started_at: at(-6, 18, 40), completed_at: at(-6, 18, 40), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-QX4T8W' },
  { id: 'op-9', provider: 'beds24', operation_type: 'finalize', intent_id: 'i-02', resource_id: '78120502', outcome: 'succeeded', attempts: 1, started_at: at(-6, 18, 41), completed_at: at(-6, 18, 41), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-QX4T8W' },
  { id: 'op-10', provider: 'paypal', operation_type: 'capture', intent_id: 'i-05', resource_id: '1MM19127HH551444K', outcome: 'succeeded', attempts: 1, started_at: at(-2, 11, 8), completed_at: at(-2, 11, 8), uncertain_at: null, reconciled_at: null, last_error: null, reference: 'BLG-W5P7ZK' },
];

const PAYMENT_EVENTS: PaymentEventRow[] = [
  { id: 'pe-1', provider: 'paypal', provider_event_id: 'WH-2WR32451HC0233532-67976317FL4543714', event_type: 'PAYMENT.CAPTURE.COMPLETED', verification: 'verified', status: 'succeeded', attempts: 1, amount_cents: 43500, currency: 'EUR', order_id: '8XK52193WD720231L', capture_id: '9AB13366HH908001Q', reference: 'BLG-QX4T8W', received_at: at(-6, 18, 40), processed_at: at(-6, 18, 42), last_error: null },
  { id: 'pe-2', provider: 'paypal', provider_event_id: 'WH-5RT98811HC0233532-11976317FL4543001', event_type: 'PAYMENT.CAPTURE.COMPLETED', verification: 'verified', status: 'succeeded', attempts: 1, amount_cents: 72500, currency: 'EUR', order_id: '1QW23412KD001883N', capture_id: '6TR90127HH551002Z', reference: 'BLG-N3H6VD', received_at: at(0, 7, 52), processed_at: at(0, 7, 53), last_error: null },
  { id: 'pe-3', provider: 'paypal', provider_event_id: 'WH-9AA11122HC0233532-22976317FL4543002', event_type: 'PAYMENT.CAPTURE.COMPLETED', verification: 'verified', status: 'succeeded', attempts: 1, amount_cents: 43500, currency: 'EUR', order_id: '4ZZ88811KD222883P', capture_id: '1MM19127HH551444K', reference: 'BLG-W5P7ZK', received_at: at(-2, 11, 8), processed_at: at(-2, 11, 9), last_error: null },
  { id: 'pe-4', provider: 'paypal', provider_event_id: 'WH-7BB33344HC0233532-33976317FL4543003', event_type: 'CHECKOUT.ORDER.APPROVED', verification: 'failed', status: 'failed', attempts: 0, amount_cents: null, currency: null, order_id: null, capture_id: null, reference: null, received_at: at(0, 9, 14), processed_at: null, last_error: null },
  { id: 'pe-5', provider: 'paypal', provider_event_id: 'WH-1CC55566HC0233532-44976317FL4543004', event_type: 'PAYMENT.CAPTURE.DENIED', verification: 'verified', status: 'succeeded', attempts: 1, amount_cents: 30000, currency: 'EUR', order_id: '6TT77788KD888123X', capture_id: null, reference: 'BLG-C4N7WG', received_at: at(0, 16, 33), processed_at: at(0, 16, 34), last_error: null },
];

const OUTBOX: OutboxRow[] = [
  { id: 'ob-1', event_type: 'booking.confirmed', status: 'succeeded', attempts: 1, reference: 'BLG-QX4T8W', created_at: at(-6, 18, 41), available_at: at(-6, 18, 41), processed_at: at(-6, 18, 43), last_error: null },
  { id: 'ob-2', event_type: 'payment.completed', status: 'succeeded', attempts: 1, reference: 'BLG-N3H6VD', created_at: at(0, 7, 52), available_at: at(0, 7, 52), processed_at: at(0, 7, 54), last_error: null },
  { id: 'ob-3', event_type: 'booking.manual_review_required', status: 'exhausted', attempts: 8, reference: 'BLG-W5P7ZK', created_at: at(-2, 11, 9), available_at: at(-1, 3, 0), processed_at: null, last_error: 'HTTP 502 from automation endpoint' },
  { id: 'ob-4', event_type: 'booking.confirmed', status: 'succeeded', attempts: 1, reference: 'BLG-P9W3FT', created_at: at(-1, 15, 5), available_at: at(-1, 15, 5), processed_at: at(-1, 15, 6), last_error: null },
  { id: 'ob-5', event_type: 'booking.expired', status: 'pending', attempts: 2, reference: 'BLG-R3G9TC', created_at: at(-1, 13, 40), available_at: at(0, 8, 0), processed_at: null, last_error: 'ECONNREFUSED' },
  { id: 'ob-6', event_type: 'booking.confirmed', status: 'succeeded', attempts: 1, reference: 'BLG-T6K3RB', created_at: at(-5, 9, 3), available_at: at(-5, 9, 3), processed_at: at(-5, 9, 4), last_error: null },
];

const JOBS: JobRow[] = [
  { id: 'job-1', intent_id: 'i-03', reference: 'BLG-N3H6VD', reason: 'PAID_BOOKING_UNFINALIZED', severity: 1, status: 'failed', attempts: 3, next_attempt_at: at(0, 9, 30), created_at: at(0, 7, 55), updated_at: at(0, 8, 20), resolved_at: null, resolution: null, last_error: 'not yet resolvable' },
  { id: 'job-2', intent_id: 'i-04', reference: 'BLG-J8R2CF', reason: 'BEDS24_RELEASE_FAILED', severity: 2, status: 'pending', attempts: 2, next_attempt_at: at(0, 10, 0), created_at: at(-1, 22, 30), updated_at: at(0, 6, 0), resolved_at: null, resolution: null, last_error: 'not yet resolvable' },
  { id: 'job-3', intent_id: 'i-05', reference: 'BLG-W5P7ZK', reason: 'PAYMENT_AMOUNT_MISMATCH', severity: 1, status: 'failed', attempts: 1, next_attempt_at: at(5, 0, 0), created_at: at(-2, 11, 9), updated_at: at(-2, 11, 12), resolved_at: null, resolution: null, last_error: 'escalated to manual review' },
  { id: 'job-4', intent_id: 'i-12', reference: 'BLG-H7B4KD', reason: 'BEDS24_RELEASE_FAILED', severity: 2, status: 'resolved', attempts: 2, next_attempt_at: at(-2, 9, 45), created_at: at(-2, 9, 30), updated_at: at(-2, 9, 50), resolved_at: at(-2, 9, 50), resolution: 'resolved', last_error: null },
  { id: 'job-5', intent_id: 'i-11', reference: 'BLG-R3G9TC', reason: 'BOOKING_HOLD_STALE', severity: 3, status: 'resolved', attempts: 1, next_attempt_at: at(-1, 13, 30), created_at: at(-1, 13, 30), updated_at: at(-1, 13, 40), resolved_at: at(-1, 13, 40), resolution: 'resolved', last_error: null },
];

/** Nights the cached channel availability marks closed beyond local reservations. */
const CLOSED: InventoryClosedRow[] = [
  ...Array.from({ length: 4 }, (_, n) => ({ unit_id: 'u-s2', date: day(7 + n), synced_at: at(0, 6, 5) })),
  ...Array.from({ length: 3 }, (_, n) => ({ unit_id: 'u-s1', date: day(26 + n), synced_at: at(0, 6, 5) })),
  ...Array.from({ length: 2 }, (_, n) => ({ unit_id: 'u-s1', date: day(-2 + n), synced_at: at(0, 6, 5) })),
];

const AUDIT: AuditRow[] = [
  { id: 'a-1', operator_email: 'fixture@example.com', action: 'auth.sign_in', target_type: null, target_ref: null, outcome: 'ok', created_at: at(0, 8, 2) },
  { id: 'a-2', operator_email: 'fixture@example.com', action: 'booking.reconcile', target_type: 'booking', target_ref: 'BLG-N3H6VD', outcome: 'retry', created_at: at(0, 8, 21) },
];

function matchesSearch(row: IntentRow, search: string): boolean {
  const s = search.toLowerCase();
  return (
    row.reference.toLowerCase().includes(s) ||
    (row.guest_last_name ?? '').toLowerCase().includes(s) ||
    (row.guest_email ?? '').toLowerCase().includes(s) ||
    row.beds24_booking_id === search ||
    row.payment_order_id === search ||
    row.payment_capture_id === search
  );
}

function isAttention(row: IntentRow): boolean {
  return (
    (ATTENTION_STATUSES as readonly string[]).includes(row.status) ||
    row.payment_status === 'unknown' ||
    row.reconciliation_state !== 'ok'
  );
}

export function fixtureRowSource(): RowSource {
  return {
    async ping() {
      return true;
    },
    async units() {
      return UNITS.map((u) => ({ ...u }));
    },
    async intents(query: IntentQuery) {
      let rows = INTENTS.filter((row) => {
        if (query.statuses && query.statuses.length > 0 && !(query.statuses as readonly string[]).includes(row.status)) return false;
        if (query.paymentStatuses && query.paymentStatuses.length > 0 && !(query.paymentStatuses as readonly string[]).includes(row.payment_status)) return false;
        if (query.unitId && row.unit_id !== query.unitId) return false;
        if (query.source && row.source !== query.source) return false;
        if (query.checkInFrom && row.check_in < query.checkInFrom) return false;
        if (query.checkInTo && row.check_in >= query.checkInTo) return false;
        if (query.overlaps && !(row.check_in < query.overlaps.to && row.check_out > query.overlaps.from)) return false;
        if (query.attentionOnly && !isAttention(row)) return false;
        if (query.paymentActivity && row.payment_status === 'not_created' && !row.payment_order_id) return false;
        if (query.search && !matchesSearch(row, query.search.trim())) return false;
        return true;
      });
      const sort = query.sort ?? 'check_in';
      const dir = query.dir === 'desc' ? -1 : 1;
      rows = rows.sort((a, b) => {
        const av = a[sort] ?? '';
        const bv = b[sort] ?? '';
        if (av === bv) return b.created_at.localeCompare(a.created_at);
        return (av > bv ? 1 : -1) * dir;
      });
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 40;
      return { rows: rows.slice(offset, offset + limit).map((r) => ({ ...r })), total: rows.length };
    },
    async intentByReference(reference) {
      const row = INTENTS.find((r) => r.reference === reference);
      return row ? { ...row } : null;
    },
    async intentEvents(intentId) {
      return EVENTS.filter((e) => e.intent_id === intentId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async operations(query) {
      return OPERATIONS.filter(
        (o) => (!query.intentId || o.intent_id === query.intentId) && (!query.outcomes || query.outcomes.includes(o.outcome))
      ).slice(0, query.limit ?? 50);
    },
    async paymentEvents(query) {
      return PAYMENT_EVENTS.filter(
        (e) =>
          (!query.reference || e.reference === query.reference) &&
          (!query.statuses || query.statuses.includes(e.status)) &&
          (!query.verifications || query.verifications.includes(e.verification))
      ).slice(0, query.limit ?? 50);
    },
    async outbox(query) {
      return OUTBOX.filter(
        (e) => (!query.reference || e.reference === query.reference) && (!query.statuses || query.statuses.includes(e.status))
      ).slice(0, query.limit ?? 50);
    },
    async jobs(query) {
      return JOBS.filter(
        (j) => (!query.intentId || j.intent_id === query.intentId) && (!query.statuses || query.statuses.includes(j.status))
      ).slice(0, query.limit ?? 50);
    },
    async queues() {
      const count = (rows: Array<{ status?: string; outcome?: string; created_at?: string; received_at?: string; started_at?: string }>, queue: string, key: 'status' | 'outcome') => {
        const map = new Map<string, QueueRow>();
        for (const r of rows) {
          const state = String(r[key]);
          const when = r.created_at ?? r.received_at ?? r.started_at ?? null;
          const entry = map.get(state) ?? { queue, state, items: 0, oldest: null };
          entry.items += 1;
          if (when && (!entry.oldest || when < entry.oldest)) entry.oldest = when;
          map.set(state, entry);
        }
        return Array.from(map.values());
      };
      return [
        ...count(OUTBOX, 'outbox', 'status'),
        ...count(PAYMENT_EVENTS, 'payment_events', 'status'),
        ...count(JOBS, 'reconciliation', 'status'),
        ...count(OPERATIONS, 'external_operations', 'outcome'),
      ];
    },
    async inventoryClosed(from, to) {
      return CLOSED.filter((c) => c.date >= from && c.date < to);
    },
    async inventoryMeta() {
      return [
        { unit_id: 'u-s1', days_cached: 548, oldest_sync: at(0, 6, 5) },
        { unit_id: 'u-s2', days_cached: 548, oldest_sync: at(0, 6, 5) },
      ];
    },
    async audit(limit) {
      return AUDIT.slice(0, limit);
    },
    async schedulerStatus() {
      // Synthetic heartbeats: a healthy reconcile a minute ago, an inventory
      // sync that last ran within its interval, and an operations pass.
      const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
      return [
        { job: 'reconcile', started_at: minutesAgo(1.2), finished_at: minutesAgo(1), ok: true, report: { scanned: 2, resolved: 1, failed: 0, escalated: 1, paymentEvents: 0, queued: 0 }, error: null, worker: 'fixture' },
        { job: 'operations', started_at: minutesAgo(1), finished_at: minutesAgo(1), ok: true, report: { created: 0, updated: 0, voided: 0 }, error: null, worker: 'fixture' },
        { job: 'inventory_sync', started_at: minutesAgo(22), finished_at: minutesAgo(21), ok: true, report: { units: 2, days: 1096, failed: 0, holdsReleased: 0, heldForPayment: 0 }, error: null, worker: 'fixture' },
      ];
    },
  };
}
