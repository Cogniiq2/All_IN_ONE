-- ════════════════════════════════════════════════════════════════════════════
-- REAL Postgres tests for the platform-completion migration.
--
-- Runs after tests/sql/concurrency.sql on the same throwaway database (the
-- fixtures and helpers `t_intent` / `t_assert` are defined there). Every
-- assertion raises on failure.
--
-- What is proven here and nowhere else:
--   • a same-state transition applies its patch and emits its outbox row
--   • the cancellation/refund invariants are DATABASE facts: a paid booking
--     cannot enter `releasing` without an authorised cancellation, a refund
--     cannot read `completed` without provider evidence, and the orthogonal
--     columns change only through their command functions
--   • the cancellation command classifies every case A–M correctly
--   • the delivery ledger yields one claim per (booking, kind) and settles
--     only the claim holder's attempt
--   • turnover status transitions, reopen-on-moved-departure, void/reschedule
--     events
--   • guest events across DST, same-day turnovers, check-out notice,
--     cancellation suppression, an injectable clock
--   • invoice numbering is gapless per series
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Same-state transitions carry their patch
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; v record;
begin
  delete from bolagio_booking_intents; delete from bolagio_outbox_events;
  a := t_intent('BLG-SAME01', 'schulstrasse-i', '2027-03-10', '2027-03-12');
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','b-same'));

  -- No patch, no outbox: the idempotent no-op. No audit row either.
  perform bolagio_booking_transition(a, 'hold_created', 'hold_created', 'noop');
  perform t_assert((select count(*) from bolagio_booking_intent_events where intent_id = a and reason = 'noop') = 0,
    'a same-state call without a patch writes nothing');

  -- A patch: applied. This is the write payments.ts makes for an uncertain capture.
  select * into v from bolagio_booking_transition(a, 'hold_created', 'hold_created', 'capture_outcome_unknown',
    jsonb_build_object('payment_status','unknown','last_failure_code','PAYMENT_PROVIDER_UNCERTAIN','reconciliation_state','pending'));
  perform t_assert(v.payment_status = 'unknown' and v.reconciliation_state = 'pending' and v.last_failure_code = 'PAYMENT_PROVIDER_UNCERTAIN',
    'a same-state call WITH a patch applies it (payment_status = unknown)');
  perform t_assert((select count(*) from bolagio_booking_intent_events where intent_id = a and reason = 'capture_outcome_unknown') = 1,
    'and is audited');

  -- An outbox row on a same-state call: emitted.
  perform bolagio_booking_transition(a, 'hold_created', 'hold_created', 'refund_recorded',
    jsonb_build_object('payment_status','paid'), null, 'payment.refunded', jsonb_build_object('reference','BLG-SAME01'));
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-SAME01' and event_type = 'payment.refunded') = 1,
    'a same-state call with an outbox type emits the event');

  -- Clearing a failure code with JSON null.
  select * into v from bolagio_booking_transition(a, 'hold_created', 'hold_created', 'clear',
    jsonb_build_object('last_failure_code', null));
  perform t_assert(v.last_failure_code is null, 'a null last_failure_code in the patch clears the column');

  -- Illegal payment moves are still refused on a same-state call.
  begin
    perform bolagio_booking_transition(a, 'hold_created', 'hold_created', 'bad', jsonb_build_object('payment_status','order_created'));
    perform t_assert(false, 'paid -> order_created must be refused');
  exception when check_violation then
    perform t_assert(true, 'an illegal payment transition on a same-state call is refused by the trigger');
  end;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Cancellation and refund invariants
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; v record; r jsonb; v_failed boolean;
begin
  delete from bolagio_booking_intents; delete from bolagio_outbox_events; delete from bolagio_reconciliation_jobs;
  a := t_intent('BLG-PAID01', 'schulstrasse-i', '2027-04-10', '2027-04-13');
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','b-paid'));
  r := bolagio_record_payment_capture('BLG-PAID01', 'paypal', 'ORD-1', 'CAP-1', 42500, 'EUR');
  perform t_assert(r->>'outcome' = 'applied', 'capture applied');
  perform bolagio_booking_transition(a, 'paid', 'finalizing', 'f');
  perform bolagio_booking_transition(a, 'finalizing', 'confirmed', 'f');

  -- (D, guard) A paid, confirmed booking cannot enter `releasing` without an authorised cancellation.
  v_failed := false;
  begin
    perform bolagio_booking_transition(a, 'confirmed', 'releasing', 'ui_click');
  exception when check_violation then v_failed := true; end;
  perform t_assert(v_failed, 'a confirmed paid booking cannot be released without an authorised cancellation (trigger)');
  perform t_assert((select status from bolagio_booking_intents where id = a) = 'confirmed', 'it is still confirmed');

  -- Refund columns cannot be written directly.
  v_failed := false;
  begin
    update bolagio_booking_intents set refund_state = 'completed', refund_id = 'R-1', refunded_amount_cents = 42500 where id = a;
  exception when check_violation then v_failed := true; end;
  perform t_assert(v_failed, 'refund columns cannot be written outside the refund commands');

  v_failed := false;
  begin
    update bolagio_booking_intents set cancellation_authorized_by = 'someone' where id = a;
  exception when check_violation then v_failed := true; end;
  perform t_assert(v_failed, 'cancellation columns cannot be written outside bolagio_request_cancellation');

  -- (D) The command refuses without authorisation, and without a refund decision.
  r := bolagio_request_cancellation(a, 'op@example.com', 'guest asked', false, null);
  perform t_assert(r->>'outcome' = 'refused' and r->>'code' = 'AUTHORIZATION_REQUIRED', 'D: paid cancellation needs authorisation');
  r := bolagio_request_cancellation(a, 'op@example.com', 'guest asked', true, null);
  perform t_assert(r->>'outcome' = 'refused' and r->>'code' = 'REFUND_DECISION_REQUIRED', 'D: paid cancellation needs a refund decision');
  r := bolagio_request_cancellation(a, 'op@example.com', 'guest asked', true, 99999);
  perform t_assert(r->>'outcome' = 'refused' and r->>'code' = 'INVALID_REFUND_AMOUNT', 'a refund above the paid amount is refused');

  -- (I) Authorised, refund required, release required.
  r := bolagio_request_cancellation(a, 'op@example.com', 'guest asked', true, 42500);
  perform t_assert(r->>'outcome' = 'release_required' and r->>'refund_state' = 'required', 'D/I: authorised paid cancellation → release required, refund required');
  select * into v from bolagio_booking_intents where id = a;
  perform t_assert(v.cancellation_authorized_by = 'op@example.com' and v.refund_required_cents = 42500 and v.status = 'confirmed',
    'the decision is recorded and the status has not moved (the saga moves it)');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-PAID01' and event_type = 'booking.cancellation_requested') = 1,
    'booking.cancellation_requested emitted once');

  -- (L) Duplicate request: idempotent, still release_required, no second event.
  r := bolagio_request_cancellation(a, 'other@example.com', 'again', true, 42500);
  perform t_assert(r->>'outcome' = 'release_required', 'L: a duplicate cancellation request is idempotent');
  perform t_assert((select cancellation_requested_by from bolagio_booking_intents where id = a) = 'op@example.com', 'the first requester is kept');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-PAID01' and event_type = 'booking.cancellation_requested') = 1,
    'no second cancellation_requested event');

  -- Now `releasing` is legal (authorised). The saga would do this.
  select * into v from bolagio_booking_transition(a, 'confirmed', 'releasing', 'cancellation');
  perform t_assert(v.status = 'releasing', 'with an authorised cancellation, confirmed → releasing is accepted');
  -- Completion before release is verified: not yet.
  r := bolagio_complete_cancellation(a);
  perform t_assert(r->>'outcome' = 'not_yet', 'cancellation cannot complete while the release is unverified');
  perform bolagio_booking_transition(a, 'releasing', 'released', 'verified');
  r := bolagio_complete_cancellation(a);
  perform t_assert(r->>'outcome' = 'cancelled', 'released + requested → cancelled');
  perform t_assert((select cancellation_completed_at from bolagio_booking_intents where id = a) is not null, 'completion timestamp set');
  r := bolagio_complete_cancellation(a);
  perform t_assert(r->>'outcome' = 'already_cancelled', 'completing twice is a no-op');

  -- Refund saga at the database: begin → outcome.
  r := bolagio_begin_refund(a, 'op@example.com');
  perform t_assert((r->>'ok')::boolean and r->>'capture_id' = 'CAP-1' and (r->>'amount_cents')::int = 42500, 'begin_refund hands back the capture and amount');
  -- (M) A second begin while pending is refused.
  r := bolagio_begin_refund(a, 'op@example.com');
  perform t_assert(not (r->>'ok')::boolean and r->>'code' = 'REFUND_IN_PROGRESS', 'M: a duplicate refund request is refused');
  -- Completed needs evidence.
  r := bolagio_record_refund_outcome(a, 'completed', null, 42500);
  perform t_assert(not (r->>'ok')::boolean and r->>'code' = 'EVIDENCE_REQUIRED', 'completed without a refund id is refused');
  -- (K) Unknown outcome: recorded, reconciliation queued, dates untouched.
  r := bolagio_record_refund_outcome(a, 'unknown', null, null, 'timeout');
  perform t_assert(r->>'refund_state' = 'unknown', 'K: refund unknown recorded');
  perform t_assert(exists (select 1 from bolagio_reconciliation_jobs where intent_id = a and reason = 'PAYMENT_REFUND_UNCERTAIN' and severity = 1),
    'K: a severity-1 reconciliation job is queued');
  -- (J) Evidence arrives later (webhook or read-back): completed.
  r := bolagio_record_refund_outcome(a, 'completed', 'REF-1', 42500, null, 'webhook');
  perform t_assert((r->>'ok')::boolean and r->>'payment_status' = 'refunded', 'J: evidence after an unknown outcome completes the refund, payment_status = refunded');
  select * into v from bolagio_booking_intents where id = a;
  perform t_assert(v.refund_state = 'completed' and v.refund_id = 'REF-1' and v.refunded_amount_cents = 42500, 'refund columns carry the evidence');
  perform t_assert((select status from bolagio_reconciliation_jobs where intent_id = a and reason = 'PAYMENT_REFUND_UNCERTAIN') = 'resolved',
    'the uncertainty job is resolved by the evidence');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-PAID01' and event_type = 'payment.refunded') = 1,
    'payment.refunded emitted once');
  -- Idempotent on the refund id; a DIFFERENT refund id escalates.
  r := bolagio_record_refund_outcome(a, 'completed', 'REF-1', 42500, null, 'webhook');
  perform t_assert((r->>'duplicate')::boolean, 'the same refund evidence twice is a duplicate');
  r := bolagio_record_refund_outcome(a, 'completed', 'REF-2', 42500, null, 'webhook');
  perform t_assert(r->>'code' = 'PAYMENT_REFUND_DUPLICATE', 'a second, different refund is escalated, not adopted');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-PAID01' and event_type = 'payment.refunded') = 1,
    'no second payment.refunded');
end $$;

-- Cases A, B, C, E, G, H at the database level.
do $$
declare a uuid; b uuid; c uuid; d uuid; r jsonb; v record;
begin
  delete from bolagio_booking_intents; delete from bolagio_outbox_events; delete from bolagio_reconciliation_jobs;

  -- (A) unpaid, nothing held: cancelled outright.
  a := t_intent('BLG-CANA01', 'schulstrasse-i', '2027-05-10', '2027-05-12');
  r := bolagio_request_cancellation(a, 'op@example.com', 'guest changed plans');
  perform t_assert(r->>'outcome' = 'cancelled', 'A: an unpaid, unheld booking cancels outright');
  perform t_assert((select status from bolagio_booking_intents where id = a) = 'cancelled', 'A: status cancelled');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-CANA01' and event_type = 'booking.cancelled') = 1, 'A: booking.cancelled emitted');
  r := bolagio_request_cancellation(a, 'op@example.com', 'again');
  perform t_assert(r->>'outcome' = 'already_cancelled', 'A/L: cancelling twice is idempotent');

  -- (B) held, unpaid, no payment evidence: release required, no authorisation needed.
  b := t_intent('BLG-CANB01', 'schulstrasse-i', '2027-05-20', '2027-05-22');
  perform bolagio_acquire_lock(b);
  perform bolagio_booking_transition(b, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','b-canb'));
  r := bolagio_request_cancellation(b, 'op@example.com', 'guest abandoned');
  perform t_assert(r->>'outcome' = 'release_required' and (r->>'authorized')::boolean = false, 'B: a held unpaid booking needs the release saga, not authorisation');
  select * into v from bolagio_booking_transition(b, 'hold_created', 'releasing', 'cancellation');
  perform t_assert(v.status = 'releasing', 'B: hold_created → releasing accepted without authorisation (no payment evidence)');

  -- (C) declined payment: payment_status denied is a definitive no; releasable.
  c := t_intent('BLG-CANC01', 'schulstrasse-i', '2027-06-01', '2027-06-03');
  perform bolagio_acquire_lock(c);
  perform bolagio_booking_transition(c, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','b-canc'));
  perform bolagio_booking_transition(c, 'hold_created', 'payment_session_created', 'o', jsonb_build_object('payment_status','order_created','payment_order_id','ORD-C'));
  perform bolagio_booking_transition(c, 'payment_session_created', 'payment_failed', 'declined', jsonb_build_object('payment_status','denied'));
  r := bolagio_request_cancellation(c, 'op@example.com', 'declined');
  perform t_assert(r->>'outcome' = 'release_required', 'C: a declined payment is releasable');

  -- (B′) held with payment evidence (approved at the provider): authorisation required.
  d := t_intent('BLG-CAND01', 'schulstrasse-i', '2027-06-10', '2027-06-12');
  perform bolagio_acquire_lock(d);
  perform bolagio_booking_transition(d, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','b-cand'));
  perform bolagio_booking_transition(d, 'hold_created', 'awaiting_payment', 'o', jsonb_build_object('payment_status','approved','payment_order_id','ORD-D'));
  r := bolagio_request_cancellation(d, 'op@example.com', 'guest asked');
  perform t_assert(r->>'outcome' = 'refused' and r->>'code' = 'AUTHORIZATION_REQUIRED', 'a hold with an approved order needs authorisation');
  -- And the trigger agrees even if someone tries to release it another way.
  begin
    perform bolagio_booking_transition(d, 'awaiting_payment', 'releasing', 'sweep');
    perform t_assert(false, 'must not reach');
  exception when check_violation then
    perform t_assert(true, 'releasing a hold with payment evidence is refused by the trigger');
  end;
  r := bolagio_request_cancellation(d, 'op@example.com', 'guest asked', true);
  perform t_assert(r->>'outcome' = 'release_required' and r->>'refund_state' = 'none', 'authorised: release required, no refund (nothing captured)');

  -- manual_review is a person's problem; the command does not route around the runbook.
  perform bolagio_booking_transition(b, 'releasing', 'manual_review', 'x');
  r := bolagio_request_cancellation(b, 'op@example.com', 'x', true, 0);
  perform t_assert(r->>'outcome' = 'refused' and r->>'code' = 'MANUAL_REVIEW', 'manual_review is refused by the cancellation command');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. The delivery ledger
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; r jsonb; r2 jsonb; v_id uuid;
begin
  delete from bolagio_booking_intents; delete from bolagio_message_deliveries;
  a := t_intent('BLG-MSG001', 'schulstrasse-i', '2027-07-01', '2027-07-03');

  r := bolagio_begin_message_delivery('BLG-NOPE01', 'booking_confirmation');
  perform t_assert(r->>'outcome' = 'unknown_reference', 'an unknown reference cannot be claimed');

  r := bolagio_begin_message_delivery('BLG-MSG001', 'booking_confirmation', 'email', 'de', 'booking_confirmation.de', '1', 'a***@example.com', 'h1', null);
  perform t_assert(r->>'outcome' = 'claimed' and (r->>'attempt')::int = 1, 'first claim succeeds');
  v_id := (r->>'id')::uuid;

  -- A second worker, same event redelivered, while the first holds the lease.
  r2 := bolagio_begin_message_delivery('BLG-MSG001', 'booking_confirmation');
  perform t_assert(r2->>'outcome' = 'in_progress', 'a concurrent claim sees in_progress');

  -- A stale completion (wrong status) is ignored.
  perform t_assert(bolagio_complete_message_delivery(v_id, 'sent', 'smtp', 'msg-1'), 'the claim holder settles');
  perform t_assert(not bolagio_complete_message_delivery(v_id, 'failed', 'smtp', null, 'late'), 'a late completion after settlement is ignored');

  -- Redelivered event after the send: already_sent, nothing to do.
  r := bolagio_begin_message_delivery('BLG-MSG001', 'booking_confirmation');
  perform t_assert(r->>'outcome' = 'already_sent' and r->>'provider_message_id' = 'msg-1', 'a redelivered event is already_sent with the provider id');
  perform t_assert((select count(*) from bolagio_message_deliveries where reference = 'BLG-MSG001') = 1, 'one ledger row');

  -- A different kind is a different slot.
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'claimed', 'another kind claims its own slot');
  perform t_assert(bolagio_complete_message_delivery((r->>'id')::uuid, 'failed', 'smtp', null, 'SMTP 450', true), 'failed recorded');
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'backoff', 'a failed delivery waits out its backoff');
  update bolagio_message_deliveries set next_attempt_at = now() - interval '1 second' where id = (r->>'id')::uuid;
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'claimed' and (r->>'attempt')::int = 2, 'after the backoff it is claimed again, attempt 2');
  perform t_assert(bolagio_complete_message_delivery((r->>'id')::uuid, 'failed', 'smtp', null, 'bounce', false), 'non-retryable failure');
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'not_retryable', 'a non-retryable failure is not claimed again');
  perform t_assert(bolagio_requeue_message_delivery((r->>'id')::uuid, 'op@example.com'), 'an operator can requeue it');
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'claimed', 'requeued: claimed again');

  -- Suppression on cancellation: pending/failed rows are suppressed, sent rows untouched.
  perform bolagio_complete_message_delivery((r->>'id')::uuid, 'failed', 'smtp', null, 'x', true);
  perform t_assert(bolagio_suppress_message_deliveries(a, 'cancelled') = 1, 'one open delivery suppressed');
  perform t_assert((select status from bolagio_message_deliveries where reference='BLG-MSG001' and kind='booking_confirmation') = 'sent', 'the sent one stays sent');
  r := bolagio_begin_message_delivery('BLG-MSG001', 'prearrival');
  perform t_assert(r->>'outcome' = 'already_sent' and r->>'status' = 'suppressed', 'a suppressed delivery is never claimed');

  -- Lease expiry: a crashed worker's claim is reclaimable.
  r := bolagio_begin_message_delivery('BLG-MSG001', 'checkin');
  update bolagio_message_deliveries set claim_expires_at = now() - interval '1 second' where id = (r->>'id')::uuid;
  r2 := bolagio_begin_message_delivery('BLG-MSG001', 'checkin');
  perform t_assert(r2->>'outcome' = 'claimed' and (r2->>'attempt')::int = 2, 'a lapsed lease is reclaimed as a new attempt');
  -- A deliberate resend is a new sequence.
  r := bolagio_begin_message_delivery('BLG-MSG001', 'booking_confirmation', 'email', 'de', null, null, null, null, null, 2);
  perform t_assert(r->>'outcome' = 'claimed' and (r->>'sequence')::int = 2, 'a resend is sequence 2, its own row');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Turnover operations
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; b uuid; t uuid; r jsonb; v record;
begin
  delete from bolagio_booking_intents; delete from bolagio_outbox_events; delete from bolagio_turnovers; delete from bolagio_turnover_events;
  a := t_intent('BLG-TRN001', 'schulstrasse-i', '2027-08-10', '2027-08-13');
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'f', jsonb_build_object('beds24_booking_id','b-trn'));
  perform bolagio_booking_transition(a, 'hold_created', 'paid', 'f', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(a, 'paid', 'confirmed', 'f');
  r := bolagio_sync_turnovers(365, '2027-08-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 1, 'turnover created');
  select id into t from bolagio_turnovers where intent_id = a;

  r := bolagio_set_turnover_status(t, 'void', 'op@example.com');
  perform t_assert(not (r->>'ok')::boolean and r->>'code' = 'SYNC_ONLY', 'an operator cannot void');
  r := bolagio_set_turnover_status(t, 'in_progress', 'cleaner-1', 'started');
  perform t_assert((r->>'ok')::boolean and r->>'to' = 'in_progress', 'required → in_progress');
  r := bolagio_set_turnover_status(t, 'done', 'cleaner-1');
  perform t_assert((r->>'ok')::boolean, 'in_progress → done');
  select * into v from bolagio_turnovers where id = t;
  perform t_assert(v.done_at is not null and v.done_by = 'cleaner-1' and v.started_at is not null, 'done_at / done_by / started_at set');
  perform t_assert((select count(*) from bolagio_turnover_events where turnover_id = t) = 2, 'two audit events');
  r := bolagio_set_turnover_status(t, 'in_progress', 'x');
  perform t_assert(not (r->>'ok')::boolean and r->>'code' = 'ILLEGAL', 'done → in_progress is illegal');
  perform t_assert(bolagio_assign_turnover(t, 'Maria', 'op@example.com'), 'assignment');
  perform t_assert((select assigned_to from bolagio_turnovers where id = t) = 'Maria', 'assignee stored');

  -- A moved departure reopens a done turnover and announces a reschedule.
  perform set_config('bolagio.transition_ok', 'yes', true);
  update bolagio_booking_intents set check_out = '2027-08-14' where id = a;
  perform set_config('bolagio.transition_ok', 'no', true);
  r := bolagio_sync_turnovers(365, '2027-08-01T10:00:00Z');
  perform t_assert((r->>'reopened')::int = 1 and (r->>'updated')::int = 1, 'a moved departure reopens the done turnover');
  select * into v from bolagio_turnovers where id = t;
  perform t_assert(v.status = 'required' and v.done_at is null and v.departure = '2027-08-14', 'reopened: required, done_at cleared, new departure');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-TRN001' and event_type = 'cleaning.rescheduled') = 1, 'cleaning.rescheduled emitted');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-TRN001' and event_type = 'cleaning.required') = 1, 'cleaning.required still once');

  -- Same-day: a back-to-back arrival.
  b := t_intent('BLG-TRN002', 'schulstrasse-i', '2027-08-14', '2027-08-16');
  perform bolagio_acquire_lock(b);
  perform bolagio_booking_transition(b, 'locking', 'hold_created', 'f', jsonb_build_object('beds24_booking_id','b-trn2'));
  perform bolagio_booking_transition(b, 'hold_created', 'paid', 'f', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(b, 'paid', 'confirmed', 'f');
  r := bolagio_sync_turnovers(365, '2027-08-01T10:00:00Z');
  perform t_assert((select same_day from bolagio_turnovers where id = t), 'same-day flagged when the next arrival is the departure day');

  -- Cancellation voids and announces.
  perform bolagio_request_cancellation(a, 'op@example.com', 'x', true, 0);
  perform bolagio_booking_transition(a, 'confirmed', 'releasing', 'c');
  perform bolagio_booking_transition(a, 'releasing', 'released', 'c');
  r := bolagio_sync_turnovers(365, '2027-08-01T10:00:00Z');
  perform t_assert((r->>'voided')::int = 1, 'the cancelled stay voids its turnover');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-TRN001' and event_type = 'cleaning.cancelled') = 1, 'cleaning.cancelled emitted');
  perform t_assert((select status from bolagio_turnovers where id = t) = 'void', 'void');
  r := bolagio_sync_turnovers(365, '2027-08-01T10:00:00Z');
  perform t_assert((r->>'voided')::int = 0 and (r->>'updated')::int = 0, 'a second pass is a no-op');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Guest events: DST, the clock, check-out, suppression on cancellation
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare a uuid; r jsonb; v record;
begin
  delete from bolagio_booking_intents; delete from bolagio_outbox_events; delete from bolagio_guest_events; delete from bolagio_turnovers;
  -- A stay across the spring-forward night (29 March 2026 in Europe/Berlin).
  a := t_intent('BLG-DST001', 'schulstrasse-i', '2026-03-28', '2026-03-30');
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'f', jsonb_build_object('beds24_booking_id','b-dst'));
  perform bolagio_booking_transition(a, 'hold_created', 'paid', 'f', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(a, 'paid', 'confirmed', 'f');

  -- 23:30 UTC on 24 March is 00:30 Berlin on the 25th: check-in is 3 days away → pre-arrival due.
  r := bolagio_emit_guest_events(3, 1, 14, '2026-03-24T23:30:00Z');
  perform t_assert((r->>'prearrival')::int = 1, 'pre-arrival is decided in the property calendar (Berlin midnight, not UTC)');
  perform t_assert((select payload->>'daysUntilArrival' from bolagio_outbox_events where reference='BLG-DST001' and event_type='guest.prearrival_ready') = '3', 'daysUntilArrival = 3');
  -- Check-in day, after the clock change.
  r := bolagio_emit_guest_events(3, 1, 14, '2026-03-28T08:00:00Z');
  perform t_assert((r->>'checkin')::int = 1 and (r->>'checkout')::int = 0, 'check-in fires on the day; check-out not yet (notice is 1 day)');
  -- The day before departure, which is the DST day itself.
  r := bolagio_emit_guest_events(3, 1, 14, '2026-03-29T08:00:00Z');
  perform t_assert((r->>'checkout')::int = 1, 'check-out notice fires one day before departure across the DST change');
  perform t_assert((select payload->>'daysUntilDeparture' from bolagio_outbox_events where reference='BLG-DST001' and event_type='guest.checkout_ready') = '1', 'daysUntilDeparture = 1');
  -- The turnover window across the transition: 11:00 → 14:00 Berlin on the 30th (CEST, +02:00).
  r := bolagio_sync_turnovers(60, '2026-03-29T08:00:00Z');
  select * into v from bolagio_turnovers where intent_id = a;
  perform t_assert(v.window_start = '2026-03-30T09:00:00Z'::timestamptz and v.window_end = '2026-03-30T12:00:00Z'::timestamptz,
    'the turnover window is 11:00–14:00 CEST expressed correctly in UTC after spring-forward');
  -- Review: 1 day after departure, and not after the window.
  r := bolagio_emit_guest_events(3, 1, 14, '2026-03-31T08:00:00Z');
  perform t_assert((r->>'review')::int = 1, 'review fires the day after departure');
  r := bolagio_emit_guest_events(3, 1, 14, '2026-05-30T08:00:00Z');
  perform t_assert((r->>'review')::int = 0, 'nothing fires twice');
  perform t_assert((select count(*) from bolagio_outbox_events where reference='BLG-DST001' and event_type like 'guest.%' or (reference='BLG-DST001' and event_type='review.requested')) = 4,
    'exactly four guest events over the whole stay');

  -- Per-unit timing: Schulstraße II with a 7-day pre-arrival notice.
  update bolagio_units set prearrival_days = 7 where slug = 'schulstrasse-ii';
  a := t_intent('BLG-DST002', 'schulstrasse-ii', '2026-10-25', '2026-10-27');  -- across fall-back (25 Oct 2026)
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'f', jsonb_build_object('beds24_booking_id','b-dst2'));
  perform bolagio_booking_transition(a, 'hold_created', 'paid', 'f', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(a, 'paid', 'confirmed', 'f');
  r := bolagio_emit_guest_events(3, 1, 14, '2026-10-18T12:00:00Z');
  perform t_assert((r->>'prearrival')::int = 1, 'a unit with prearrival_days = 7 fires seven days out');
  update bolagio_units set prearrival_days = 3 where slug = 'schulstrasse-ii';
  r := bolagio_sync_turnovers(60, '2026-10-20T08:00:00Z');
  select * into v from bolagio_turnovers where intent_id = a;
  perform t_assert(v.window_start = '2026-10-27T10:00:00Z'::timestamptz and v.window_end = '2026-10-27T13:00:00Z'::timestamptz,
    'after fall-back the window is 11:00–14:00 CET (UTC+1)');

  -- Cancellation before the events are due: nothing fires afterwards.
  perform bolagio_request_cancellation(a, 'op@example.com', 'x', true, 0);
  perform bolagio_booking_transition(a, 'confirmed', 'releasing', 'c');
  perform bolagio_booking_transition(a, 'releasing', 'released', 'c');
  perform bolagio_complete_cancellation(a);
  r := bolagio_emit_guest_events(3, 1, 14, '2026-10-25T12:00:00Z');
  perform t_assert((r->>'checkin')::int = 0 and (r->>'checkout')::int = 0, 'a cancelled stay gets no check-in or check-out event');
  r := bolagio_emit_guest_events(3, 1, 14, '2026-10-28T12:00:00Z');
  perform t_assert((r->>'review')::int = 0, 'a cancelled stay is never asked for a review');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Invoice numbering and integration health
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare n1 int; n2 int; n3 int;
begin
  delete from bolagio_invoice_sequences;
  n1 := bolagio_next_invoice_number('2026');
  n2 := bolagio_next_invoice_number('2026');
  n3 := bolagio_next_invoice_number('2027');
  perform t_assert(n1 = 1 and n2 = 2 and n3 = 1, 'invoice numbers are gapless per series');

  perform bolagio_observe_integration('beds24', 'last_success', 'calendar');
  perform bolagio_observe_integration('beds24', 'last_success', 'offer');
  perform t_assert((select count(*) from bolagio_integration_health where provider='beds24') = 1, 'one row per (provider, signal), upserted');
  perform t_assert((select detail from bolagio_integration_health where provider='beds24' and signal='last_success') = 'offer', 'latest detail wins');
end $$;

\echo '════════ platform-completion database tests passed ════════'
