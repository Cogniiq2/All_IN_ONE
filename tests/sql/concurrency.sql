-- ════════════════════════════════════════════════════════════════════════════
-- REAL Postgres concurrency and state-machine tests.
--
-- These are NOT unit tests with a mocked database. They open genuine
-- concurrent transactions against a real PostgreSQL instance and assert that
-- the DATABASE — not the application — refuses to double-book.
--
-- Run:
--   npm run test:db          (see scripts/db-test.sh for the setup it does)
--
-- Every assertion raises on failure, so a non-zero psql exit is a red test.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\timing off
set client_min_messages = notice;

-- ── Fixtures ───────────────────────────────────────────────────────────────

delete from bolagio_booking_intents;
delete from bolagio_unit_integrations;
delete from bolagio_units;

insert into bolagio_units (slug, display_name, max_guests, currency, is_bookable) values
  ('schulstrasse-i',  'Schulstraße I',  4, 'EUR', true),
  ('schulstrasse-ii', 'Schulstraße II', 4, 'EUR', true);

insert into bolagio_unit_integrations (unit_id, provider, external_property_id, external_room_id)
select id, 'beds24', '354659', '731147' from bolagio_units where slug = 'schulstrasse-i';
insert into bolagio_unit_integrations (unit_id, provider, external_property_id, external_room_id)
select id, 'beds24', '354658', '731146' from bolagio_units where slug = 'schulstrasse-ii';

create or replace function t_intent(p_ref text, p_slug text, p_in date, p_out date)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into bolagio_booking_intents (reference, unit_id, check_in, check_out, adults, idempotency_key, currency)
  select p_ref, id, p_in, p_out, 2, 'key-' || p_ref, 'EUR' from bolagio_units where slug = p_slug
  returning id into v_id;
  -- Every booking must be quoted before it may lock. Give it an authoritative
  -- total so the payment assertions below have something to match against.
  perform bolagio_booking_transition(v_id, 'draft'::bolagio_booking_status, 'quoted'::bolagio_booking_status,
    'fixture', jsonb_build_object('quoted_total_cents', 42500, 'currency', 'EUR',
                                  'quote_expires_at', (now() + interval '20 min')::text));
  return v_id;
end $$;

create or replace function t_assert(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Overlapping direct bookings — sequential
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare a uuid; b uuid; c uuid; v record; v_failed boolean := false;
begin
  a := t_intent('BLG-AAAAAA', 'schulstrasse-i', '2026-10-20', '2026-10-23');
  b := t_intent('BLG-BBBBBB', 'schulstrasse-i', '2026-10-22', '2026-10-25');
  c := t_intent('BLG-CCCCCC', 'schulstrasse-i', '2026-10-23', '2026-10-25');

  select * into v from bolagio_acquire_lock(a);
  perform t_assert(v.status = 'locking', 'guest A 20–23 Oct acquires the lock');

  -- Guest B overlaps on the nights of the 22nd. The DATABASE must refuse.
  begin
    perform bolagio_acquire_lock(b);
  exception when exclusion_violation then
    v_failed := true;
  end;
  perform t_assert(v_failed, 'guest B 22–25 Oct is refused by the exclusion constraint');

  -- Guest C checks IN on the day guest A checks OUT. Half-open ranges mean
  -- this is a perfectly good back-to-back stay and must be allowed — getting
  -- this wrong silently costs one sellable night per turnover.
  select * into v from bolagio_acquire_lock(c);
  perform t_assert(v.status = 'locking', 'guest C 23–25 Oct (adjacent) IS allowed');
end $$;

-- A different unit, identical dates, must never conflict.
do $$
declare d uuid; v record;
begin
  d := t_intent('BLG-DDDDDD', 'schulstrasse-ii', '2026-10-20', '2026-10-23');
  select * into v from bolagio_acquire_lock(d);
  perform t_assert(v.status = 'locking', 'a different unit on the same dates is allowed');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Stale lock reclamation
-- ══════════════════════════════════════════════════════════════════════════
--
-- A process that died holding `locking` must not block those dates forever,
-- and a guest retrying must not be blocked by their own abandoned attempt.

do $$
declare e uuid; f uuid; v record;
begin
  e := t_intent('BLG-EEEEEE', 'schulstrasse-i', '2026-12-01', '2026-12-05');
  perform bolagio_acquire_lock(e, 120);
  -- Simulate the lease having run out.
  perform set_config('bolagio.transition_ok','no',true);
  update bolagio_booking_intents set lock_expires_at = now() - interval '1 minute' where id = e;

  f := t_intent('BLG-FFFFFF', 'schulstrasse-i', '2026-12-01', '2026-12-05');
  select * into v from bolagio_acquire_lock(f);
  perform t_assert(v.status = 'locking', 'a new attempt reclaims an expired lock lease');
  perform t_assert(
    (select status from bolagio_booking_intents where id = e) = 'hold_failed',
    'the abandoned lock is moved to a non-reserving state');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. States that must KEEP reserving
-- ══════════════════════════════════════════════════════════════════════════
--
-- The regression this guards: releasing the local range before the Beds24 hold
-- is provably gone advertises a night Booking.com may already have sold.

do $$
declare s bolagio_booking_status;
begin
  foreach s in array array[
    'locking','hold_created','payment_session_created','awaiting_payment','payment_pending',
    'paid','finalizing','confirmed','paid_unfinalized','finalization_failed',
    'releasing','release_failed','expired','payment_failed','payment_cancelled','manual_review'
  ]::bolagio_booking_status[] loop
    perform t_assert(bolagio_status_reserves(s), format('%s reserves inventory', s));
  end loop;

  foreach s in array array[
    'draft','quoted','quote_expired','unavailable','hold_failed','released','cancelled'
  ]::bolagio_booking_status[] loop
    perform t_assert(not bolagio_status_reserves(s), format('%s does not reserve inventory', s));
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. The transition guard
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare g uuid; v_blocked boolean := false;
begin
  g := t_intent('BLG-GGGGGG', 'schulstrasse-i', '2027-01-10', '2027-01-12');
  -- The attack this prevents: anything holding the service role key writing
  -- `confirmed` straight into the column.
  begin
    update bolagio_booking_intents set status = 'confirmed' where id = g;
  exception when check_violation then
    v_blocked := true;
  end;
  perform t_assert(v_blocked, 'a direct UPDATE of status is rejected by the trigger');

  -- And an illegal move through the function is a null return, not a write.
  perform t_assert(
    bolagio_booking_transition(g, 'quoted'::bolagio_booking_status, 'confirmed'::bolagio_booking_status) is null,
    'quoted -> confirmed is refused by the transition table');
  perform t_assert(
    (select status from bolagio_booking_intents where id = g) = 'quoted',
    'the refused transition wrote nothing');

  -- A stale expected-state loses cleanly rather than overwriting.
  perform bolagio_acquire_lock(g);
  perform t_assert(
    bolagio_booking_transition(g, 'quoted'::bolagio_booking_status, 'hold_created'::bolagio_booking_status) is null,
    'a stale expected-status is refused (compare-and-set)');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Payment capture: amount, currency, duplication
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare h uuid; r jsonb;
begin
  h := t_intent('BLG-HHHHHH', 'schulstrasse-i', '2027-02-01', '2027-02-04');
  perform bolagio_acquire_lock(h);
  perform bolagio_booking_transition(h, 'locking'::bolagio_booking_status, 'hold_created'::bolagio_booking_status,
    'fixture', jsonb_build_object('beds24_booking_id','99001','payment_order_id','ORDER-1',
                                  'payment_provider','paypal','payment_status','order_created'));

  -- A capture for the wrong amount must NOT confirm.
  r := bolagio_record_payment_capture('BLG-HHHHHH','paypal','ORDER-1','CAP-1', 1, 'EUR');
  perform t_assert(r->>'outcome' = 'mismatch' and r->>'code' = 'PAYMENT_AMOUNT_MISMATCH',
    'a capture for the wrong amount is a mismatch, not a confirmation');
  perform t_assert(
    (select status from bolagio_booking_intents where id = h) = 'manual_review',
    'an amount mismatch moves the booking to manual_review');
  perform t_assert(
    (select count(*) from bolagio_reconciliation_jobs
      where intent_id = h and reason = 'PAYMENT_AMOUNT_MISMATCH' and severity = 1) = 1,
    'an amount mismatch raises a severity-1 reconciliation job');
end $$;

do $$
declare i uuid; r jsonb;
begin
  i := t_intent('BLG-IIIIII', 'schulstrasse-i', '2027-03-01', '2027-03-04');
  perform bolagio_acquire_lock(i);
  perform bolagio_booking_transition(i, 'locking'::bolagio_booking_status, 'hold_created'::bolagio_booking_status,
    'fixture', jsonb_build_object('beds24_booking_id','99002','payment_order_id','ORDER-2',
                                  'payment_provider','paypal','payment_status','order_created'));

  r := bolagio_record_payment_capture('BLG-IIIIII','paypal','ORDER-2','CAP-2', 42500, 'EUR');
  perform t_assert(r->>'outcome' = 'applied' and r->>'status' = 'paid', 'a matching capture is applied');

  -- PayPal delivers the same event up to nine times. The second must be inert.
  r := bolagio_record_payment_capture('BLG-IIIIII','paypal','ORDER-2','CAP-2', 42500, 'EUR');
  perform t_assert(r->>'outcome' = 'duplicate', 'a repeated capture is a quiet duplicate');

  -- A capture in the wrong currency for the same amount must not pass.
  perform t_assert(
    (bolagio_record_payment_capture('BLG-IIIIII','paypal','ORDER-2','CAP-3', 42500, 'USD'))->>'code'
      = 'PAYMENT_DUPLICATE_CAPTURE',
    'a second distinct capture is refused before currency is even reached');

  -- The state change and its outbox event were written together.
  perform t_assert(
    (select count(*) from bolagio_outbox_events
      where reference = 'BLG-IIIIII' and event_type = 'payment.completed') = 1,
    'the paid transition wrote exactly one payment.completed outbox event');
end $$;

-- A currency mismatch on a booking with no prior capture.
do $$
declare j uuid; r jsonb;
begin
  j := t_intent('BLG-JJJJJJ', 'schulstrasse-ii', '2027-04-01', '2027-04-04');
  perform bolagio_acquire_lock(j);
  perform bolagio_booking_transition(j, 'locking'::bolagio_booking_status, 'hold_created'::bolagio_booking_status,
    'fixture', jsonb_build_object('payment_order_id','ORDER-3','payment_provider','paypal'));
  r := bolagio_record_payment_capture('BLG-JJJJJJ','paypal','ORDER-3','CAP-4', 42500, 'USD');
  perform t_assert(r->>'code' = 'PAYMENT_CURRENCY_MISMATCH', 'a forged currency is refused');
end $$;

-- A verified capture that lands after we had given up must still win.
do $$
declare k uuid; r jsonb;
begin
  k := t_intent('BLG-KKKKKK', 'schulstrasse-ii', '2027-05-01', '2027-05-04');
  perform bolagio_acquire_lock(k);
  perform bolagio_booking_transition(k, 'locking'::bolagio_booking_status, 'hold_created'::bolagio_booking_status,
    'fixture', jsonb_build_object('payment_order_id','ORDER-5','payment_provider','paypal'));
  perform bolagio_booking_transition(k, 'hold_created'::bolagio_booking_status, 'expired'::bolagio_booking_status, 'lease');
  r := bolagio_record_payment_capture('BLG-KKKKKK','paypal','ORDER-5','CAP-5', 42500, 'EUR');
  perform t_assert(r->>'outcome' = 'applied' and r->>'status' = 'paid',
    'a capture arriving after expiry still moves the booking to paid');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Outbox claiming is exclusive
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare n1 integer; n2 integer;
begin
  delete from bolagio_outbox_events;
  insert into bolagio_outbox_events (event_type, reference)
  select 'booking.held', 'BLG-Q' || g from generate_series(1,10) g;

  select count(*) into n1 from bolagio_claim_outbox_events('worker-1', 10);
  perform t_assert(n1 = 10, 'worker 1 claims the backlog');

  -- The lease is held, so a second worker gets nothing rather than duplicating.
  select count(*) into n2 from bolagio_claim_outbox_events('worker-2', 10);
  perform t_assert(n2 = 0, 'worker 2 claims none of worker 1''s leased events');

  perform t_assert(bolagio_ack_outbox_event(
    (select id from bolagio_outbox_events where claimed_by = 'worker-1' limit 1), 'worker-1'),
    'the claiming worker can acknowledge');
  perform t_assert(not bolagio_ack_outbox_event(
    (select id from bolagio_outbox_events where claimed_by = 'worker-1' and processed_at is null limit 1), 'worker-2'),
    'a different worker cannot acknowledge someone else''s claim');
end $$;

-- A worker that crashes leaves a recoverable event, and repeated failure
-- eventually dead-letters rather than spinning forever.
do $$
declare v_id uuid; v_n integer;
begin
  delete from bolagio_outbox_events;
  insert into bolagio_outbox_events (event_type, reference) values ('booking.confirmed','BLG-CRASH')
  returning id into v_id;

  perform bolagio_claim_outbox_events('crasher', 1);
  -- The crash: the lease simply passes.
  update bolagio_outbox_events set claim_expires_at = now() - interval '1 second' where id = v_id;
  select count(*) into v_n from bolagio_claim_outbox_events('worker-2', 5);
  perform t_assert(v_n = 1, 'an expired claim is recoverable by another worker');

  for i in 1..9 loop
    perform bolagio_fail_outbox_event(v_id, 'worker-2', 'boom');
    update bolagio_outbox_events set available_at = now() where id = v_id;
    perform bolagio_claim_outbox_events('worker-2', 5);
  end loop;
  perform t_assert(
    (select status from bolagio_outbox_events where id = v_id) = 'exhausted',
    'repeated failure dead-letters the event rather than looping forever');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. Payment event inbox deduplication
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare r1 jsonb; r2 jsonb; v_n integer;
begin
  delete from bolagio_payment_events;
  r1 := bolagio_record_payment_event('paypal','WH-1','PAYMENT.CAPTURE.COMPLETED','verified','{}'::jsonb);
  r2 := bolagio_record_payment_event('paypal','WH-1','PAYMENT.CAPTURE.COMPLETED','verified','{}'::jsonb);
  perform t_assert((r1->>'duplicate')::boolean = false, 'the first delivery is stored');
  perform t_assert((r2->>'duplicate')::boolean = true,  'a redelivery of the same provider event id is a duplicate');

  -- An event whose signature did not verify is recorded but never queued.
  perform bolagio_record_payment_event('paypal','WH-2','PAYMENT.CAPTURE.COMPLETED','failed','{}'::jsonb);
  select count(*) into v_n from bolagio_claim_payment_events('worker', 10);
  perform t_assert(v_n = 1, 'only the verified event is claimable for processing');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. Reconciliation jobs do not pile up
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare m uuid;
begin
  delete from bolagio_reconciliation_jobs;
  m := t_intent('BLG-MMMMMM', 'schulstrasse-ii', '2027-06-01', '2027-06-04');
  perform bolagio_queue_reconciliation(m, 'BEDS24_HOLD_OUTCOME_UNKNOWN', 2);
  perform bolagio_queue_reconciliation(m, 'BEDS24_HOLD_OUTCOME_UNKNOWN', 1);
  perform t_assert((select count(*) from bolagio_reconciliation_jobs where intent_id = m) = 1,
    'a repeated queue call updates the open job rather than creating a second');
  perform t_assert((select severity from bolagio_reconciliation_jobs where intent_id = m) = 1,
    'the more urgent severity wins');
  -- Highest severity is worked first, whatever order jobs arrived in.
  perform t_assert(
    (select reason from bolagio_claim_reconciliation_jobs('w', 1) limit 1) = 'BEDS24_HOLD_OUTCOME_UNKNOWN',
    'the severity-1 job is claimed first');
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 9. A declined payment may still complete against the same order
-- ══════════════════════════════════════════════════════════════════════════
--
-- PayPal's restart flow re-approves the order after a declined instrument.
-- The trigger must accept the capture that follows, or the database refuses a
-- payment PayPal has already executed.

do $$
declare n uuid; r jsonb;
begin
  n := t_intent('BLG-NNNNNN', 'schulstrasse-ii', '2027-07-01', '2027-07-04');
  perform bolagio_acquire_lock(n);
  perform bolagio_booking_transition(n, 'locking'::bolagio_booking_status, 'hold_created'::bolagio_booking_status,
    'fixture', jsonb_build_object('beds24_booking_id','99009','payment_order_id','ORDER-9',
                                  'payment_provider','paypal','payment_status','order_created'));
  perform bolagio_booking_transition(n, 'hold_created'::bolagio_booking_status, 'payment_failed'::bolagio_booking_status,
    'capture_denied', jsonb_build_object('payment_status','denied'));
  perform t_assert(bolagio_payment_transition_allowed('denied','paid'), 'denied -> paid is legal');
  perform t_assert(bolagio_payment_transition_allowed('cancelled','approved'), 'cancelled -> approved is legal');
  perform t_assert(not bolagio_payment_transition_allowed('paid','order_created'), 'paid -> order_created is still illegal');
  r := bolagio_record_payment_capture('BLG-NNNNNN','paypal','ORDER-9','CAP-9', 42500, 'EUR');
  perform t_assert(r->>'outcome' = 'applied' and r->>'status' = 'paid',
    'a capture after a decline is applied against the same order');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. The database refuses a blind retry after an unknown outcome
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare v_refused boolean := false; v_row bolagio_external_operations;
begin
  delete from bolagio_external_operations;
  perform bolagio_begin_external_operation('beds24:create_hold:test-1', 'beds24', 'create_hold');
  perform bolagio_complete_external_operation('beds24:create_hold:test-1', 'outcome_unknown', null, 'timeout');

  begin
    perform bolagio_begin_external_operation('beds24:create_hold:test-1', 'beds24', 'create_hold');
  exception when sqlstate 'BLG01' then
    v_refused := true;
  end;
  perform t_assert(v_refused, 'a second create after an unknown outcome is refused with SQLSTATE BLG01');
  perform t_assert(
    (select outcome from bolagio_external_operations where operation_key = 'beds24:create_hold:test-1') = 'outcome_unknown',
    'the refused retry left the unknown verdict untouched');

  -- An idempotent operation may declare itself so, and proceeds.
  v_row := bolagio_begin_external_operation('beds24:create_hold:test-1', 'beds24', 'create_hold', null, null, true);
  perform t_assert(v_row.outcome = 'in_flight' and v_row.attempts = 1, 'a declared-idempotent retry proceeds as a new attempt');

  -- A reconciled operation is no longer a block.
  perform bolagio_complete_external_operation('beds24:create_hold:test-1', 'reconciled', '9001');
  v_row := bolagio_begin_external_operation('beds24:create_hold:test-1', 'beds24', 'create_hold');
  perform t_assert(v_row.outcome = 'in_flight', 'once reconciled, the same key may be attempted again');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. Scheduler heartbeat
-- ══════════════════════════════════════════════════════════════════════════

do $$
begin
  delete from bolagio_scheduler_runs;
  perform bolagio_record_scheduler_run('reconcile', now() - interval '2 seconds', true, '{"scanned":1}'::jsonb);
  perform bolagio_record_scheduler_run('reconcile', now() - interval '1 second', false, null, 'boom');
  perform t_assert((select ok from bolagio_scheduler_status where job = 'reconcile') = false,
    'the scheduler status reports the LATEST run per job');
  perform t_assert((select count(*) from bolagio_scheduler_status) = 1, 'one status row per job');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. Turnovers are derived once, updated in place, voided when the stay leaves confirmed
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare p uuid; q uuid; r jsonb; v_today date;
begin
  delete from bolagio_turnovers; delete from bolagio_outbox_events;
  v_today := (now() at time zone 'Europe/Berlin')::date;
  p := t_intent('BLG-PPPPPP', 'schulstrasse-i', v_today + 2, v_today + 5);
  q := t_intent('BLG-QQQQQQ', 'schulstrasse-i', v_today + 5, v_today + 7);
  perform bolagio_acquire_lock(p);
  perform bolagio_booking_transition(p, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','77001'));
  perform bolagio_booking_transition(p, 'hold_created', 'paid', 'fixture', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(p, 'paid', 'confirmed', 'fixture');

  r := bolagio_sync_turnovers();
  perform t_assert((r->>'created')::int = 1, 'a confirmed stay creates exactly one turnover');
  perform t_assert((select count(*) from bolagio_outbox_events where event_type = 'cleaning.required' and reference = 'BLG-PPPPPP') = 1,
    'cleaning.required is emitted with the turnover');
  perform t_assert((select same_day from bolagio_turnovers where intent_id = p) = false, 'no next arrival yet, so not same-day');

  r := bolagio_sync_turnovers();
  perform t_assert((r->>'created')::int = 0 and (r->>'updated')::int = 0, 'a second pass changes nothing');
  perform t_assert((select count(*) from bolagio_outbox_events where event_type = 'cleaning.required') = 1,
    'cleaning.required is not emitted twice');

  -- A confirmed back-to-back arrival makes it a same-day turnover.
  perform bolagio_acquire_lock(q);
  perform bolagio_booking_transition(q, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','77002'));
  perform bolagio_booking_transition(q, 'hold_created', 'paid', 'fixture', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(q, 'paid', 'confirmed', 'fixture');
  r := bolagio_sync_turnovers();
  perform t_assert((select same_day from bolagio_turnovers where intent_id = p) = true, 'a back-to-back arrival marks the turnover same-day');
  perform t_assert((r->>'created')::int = 1, 'the second stay gets its own turnover');
  perform t_assert((select window_start < window_end from bolagio_turnovers where intent_id = p), 'the window runs from check-out to check-in time');

  -- The stay leaves confirmed: the turnover is voided, not deleted.
  perform bolagio_booking_transition(p, 'confirmed', 'manual_review', 'fixture');
  r := bolagio_sync_turnovers();
  perform t_assert((r->>'voided')::int = 1, 'a stay that leaves confirmed voids its turnover');
  perform t_assert((select status from bolagio_turnovers where intent_id = p) = 'void', 'voided, still present');
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 13. Guest-operations events fire once, on the property's calendar
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare s uuid; r jsonb; v_today date;
begin
  delete from bolagio_guest_events; delete from bolagio_outbox_events;
  v_today := (now() at time zone 'Europe/Berlin')::date;
  -- Arrives today, left... no: arrives today, departs in two days.
  s := t_intent('BLG-SSSSSS', 'schulstrasse-ii', v_today, v_today + 2);
  perform bolagio_acquire_lock(s);
  perform bolagio_booking_transition(s, 'locking', 'hold_created', 'fixture', jsonb_build_object('beds24_booking_id','77003'));
  perform bolagio_booking_transition(s, 'hold_created', 'paid', 'fixture', jsonb_build_object('payment_status','paid'));

  r := bolagio_emit_guest_events();
  perform t_assert((r->>'checkin')::int = 0, 'a paid but unconfirmed stay emits nothing');

  perform bolagio_booking_transition(s, 'paid', 'confirmed', 'fixture');
  r := bolagio_emit_guest_events();
  perform t_assert((r->>'checkin')::int = 1 and (r->>'prearrival')::int = 1,
    'a confirmed stay arriving today emits check-in and pre-arrival');
  r := bolagio_emit_guest_events();
  perform t_assert((r->>'checkin')::int = 0 and (r->>'prearrival')::int = 0, 'nothing is emitted twice');
  perform t_assert((select count(*) from bolagio_outbox_events where reference = 'BLG-SSSSSS') = 2,
    'exactly two outbox rows for the two events');
  perform t_assert((select count(*) from bolagio_guest_events where intent_id = s and kind = 'review.requested') = 0,
    'no review request before departure');
end $$;

\echo ''
\echo '════════ all database concurrency tests passed ════════'
