-- ════════════════════════════════════════════════════════════════════════════
-- REAL Postgres tests for the finance ingestion pipeline (20260927120000).
--
-- Runs after tests/sql/finance.sql on the same throwaway database (`t_assert`
-- and `t_intent` come from concurrency.sql).
--
-- What is proven here and nowhere else:
--   • a booking in a non-financial state queues nothing
--   • a capture queues the intent IN THE SAME STATEMENT, and a second change
--     re-arms the same row instead of adding one
--   • a queue failure never fails the booking write (exception-safe trigger)
--   • a verified refund event queues its booking; an unverified one does not
--   • claim leases; settle marks done, or keeps pending when the intent changed
--     while the worker was busy, or fails with backoff
--   • the catch-up queues a gap with no queue row, and a backfill re-queues a
--     done row only when it still has a gap
--   • the pipeline status view answers in one row
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from bolagio_finance_ingestion_queue;

do $$
declare
  a uuid; v_claim record; v_state text; v_n integer; v_status record;
begin
  a := t_intent('BLG-PIPE01', 'schulstrasse-ii', current_date + 200, current_date + 203);
  perform t_assert(not exists (select 1 from bolagio_finance_ingestion_queue where intent_id = a), 'a quoted booking queues no finance work');

  update bolagio_booking_intents set payment_capture_id = 'CAP-PIPE-1', paid_amount_cents = 42500 where id = a;
  perform t_assert((select state from bolagio_finance_ingestion_queue where intent_id = a) = 'pending', 'a capture queues the intent in the same statement');
  perform t_assert((select reason from bolagio_finance_ingestion_queue where intent_id = a) = 'intent:UPDATE', 'the queue row says what queued it');

  -- Claim, then the intent changes while the "worker" is busy.
  select * into v_claim from bolagio_finance_claim_ingestion('sql-test', 10) where intent_id = a;
  perform t_assert(v_claim.intent_id = a and v_claim.attempts = 1, 'claim returns the intent and counts the attempt');
  perform t_assert((select next_attempt_at > now() + interval '9 minutes' from bolagio_finance_ingestion_queue where intent_id = a), 'a claim leases the row for ten minutes');
  perform t_assert(not exists (select 1 from bolagio_finance_claim_ingestion('sql-test-2', 10) where intent_id = a), 'a leased row is not claimed twice');
  perform pg_sleep(0.01);
  update bolagio_booking_intents set paid_amount_cents = 42500 where id = a;
  perform t_assert((select count(*) from bolagio_finance_ingestion_queue where intent_id = a) = 1, 'a second change re-arms the same row, never a second one');
  v_state := bolagio_finance_settle_ingestion(a, v_claim.enqueued_at, true, null);
  perform t_assert(v_state = 'pending', 'a change that landed during the work keeps the row pending');

  select * into v_claim from bolagio_finance_claim_ingestion('sql-test', 10) where intent_id = a;
  v_state := bolagio_finance_settle_ingestion(a, v_claim.enqueued_at, false, 'BLG-PIPE01 (revenue): period locked');
  perform t_assert(v_state = 'failed', 'a failed derivation is recorded as failed');
  perform t_assert((select next_attempt_at > now() and last_error like '%period locked%' from bolagio_finance_ingestion_queue where intent_id = a), 'a failure keeps its error and backs off');
  perform t_assert(not exists (select 1 from bolagio_finance_claim_ingestion('sql-test', 10) where intent_id = a), 'a failed row is not claimed before its backoff');

  update bolagio_finance_ingestion_queue set next_attempt_at = now() where intent_id = a;
  select * into v_claim from bolagio_finance_claim_ingestion('sql-test', 10) where intent_id = a;
  v_state := bolagio_finance_settle_ingestion(a, v_claim.enqueued_at, true, null);
  perform t_assert(v_state = 'done', 'the retry that succeeds marks the row done');

  -- A capture with no finance payment is still a GAP (status not paid → not a gap by the rules).
  perform t_assert(not (select capture_missing from bolagio_finance_ingestion_gaps where intent_id = a), 'an unpaid payment status is not a capture gap');

  -- Exception safety: the queue is gone; the booking write still succeeds.
  alter table bolagio_finance_ingestion_queue rename to bolagio_finance_ingestion_queue_away;
  update bolagio_booking_intents set paid_amount_cents = 42500 where id = a;
  alter table bolagio_finance_ingestion_queue_away rename to bolagio_finance_ingestion_queue;
  perform t_assert(true, 'a booking write succeeds even when finance cannot be queued');

  -- Refund events.
  delete from bolagio_finance_ingestion_queue where intent_id = a;
  insert into bolagio_payment_events (provider, provider_event_id, event_type, verification, payload, capture_id, reference, amount_cents, currency)
  values ('paypal', 'WH-PIPE-UNVERIFIED', 'PAYMENT.CAPTURE.REFUNDED', 'failed', '{}'::jsonb, 'REF-PIPE-X', 'BLG-PIPE01', 1000, 'EUR');
  perform t_assert(not exists (select 1 from bolagio_finance_ingestion_queue where intent_id = a), 'an unverified refund event queues nothing');
  perform t_assert(not exists (select 1 from bolagio_finance_refund_events where provider_reference = 'REF-PIPE-X'), 'an unverified refund event is not refund evidence');

  insert into bolagio_payment_events (provider, provider_event_id, event_type, verification, payload, capture_id, reference, amount_cents, currency)
  values ('paypal', 'WH-PIPE-1', 'PAYMENT.CAPTURE.REFUNDED', 'verified', '{}'::jsonb, 'REF-PIPE-1', 'BLG-PIPE01', 5000, 'EUR');
  perform t_assert((select reason from bolagio_finance_ingestion_queue where intent_id = a) = 'refund_event', 'a verified refund event queues its booking');
  perform t_assert((select intent_id from bolagio_finance_refund_events where provider_reference = 'REF-PIPE-1') = a, 'the refund event is attributed by reference');

  insert into bolagio_payment_events (provider, provider_event_id, event_type, verification, payload, capture_id, amount_cents, currency)
  values ('paypal', 'WH-PIPE-2', 'PAYMENT.CAPTURE.REVERSED', 'verified', '{}'::jsonb, 'CAP-PIPE-1', 12000, 'EUR');
  perform t_assert((select intent_id from bolagio_finance_refund_events where provider_reference = 'reversal:CAP-PIPE-1') = a, 'a reversal is attributed by the capture it reverses, keyed apart from it');

  insert into bolagio_payment_events (provider, provider_event_id, event_type, verification, payload, capture_id, amount_cents, currency)
  values ('paypal', 'WH-PIPE-3', 'PAYMENT.CAPTURE.REFUNDED', 'verified', '{}'::jsonb, 'REF-ORPHAN', 700, 'EUR');
  perform t_assert((select intent_id is null from bolagio_finance_refund_events where provider_reference = 'REF-ORPHAN'), 'a refund for no known booking stays unattributed');

  -- Catch-up and backfill.
  delete from bolagio_finance_ingestion_queue where intent_id = a;
  perform t_assert((select refund_event_missing from bolagio_finance_ingestion_gaps where intent_id = a), 'a refund event without its cash fact is a gap');
  v_n := bolagio_finance_enqueue_missing(false);
  perform t_assert(v_n >= 1 and (select reason from bolagio_finance_ingestion_queue where intent_id = a) = 'catch_up', 'the catch-up queues a gap that has no queue row');
  v_n := bolagio_finance_enqueue_missing(false);
  perform t_assert(v_n = 0, 'the catch-up leaves a queued gap alone');
  update bolagio_finance_ingestion_queue set state = 'done', processed_at = now() where intent_id = a;
  perform t_assert(bolagio_finance_enqueue_missing(false) = 0, 'the catch-up does not loop on a gap already processed');
  v_n := bolagio_finance_enqueue_missing(true);
  perform t_assert(v_n >= 1 and (select reason from bolagio_finance_ingestion_queue where intent_id = a) = 'backfill', 'a backfill re-queues a processed row that still has a gap');

  select * into v_status from bolagio_finance_pipeline_status;
  perform t_assert(v_status.queue_pending >= 1 and v_status.refund_events_unattributed = 1, 'the pipeline status view answers in one row');

  delete from bolagio_finance_ingestion_queue;
  delete from bolagio_payment_events where provider_event_id like 'WH-PIPE-%';
end $$;

\echo '════════ finance pipeline tests passed ════════'
