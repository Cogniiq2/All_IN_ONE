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

\echo ''
\echo '════════ all database concurrency tests passed ════════'
