-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — FINANCE INGESTION PIPELINE (2026-09-27)
--
-- Booking and payment facts already live durably in the booking core
-- (`bolagio_booking_intents`, `bolagio_payment_events`). The finance
-- subledger CONSUMES them through `ingestBookingFacts()`. Until now that
-- consumption was a periodic scan of the 500 most recently updated intents,
-- which (a) never reached an older intent once 500 newer ones existed, (b)
-- cost several database round trips per intent on every three-minute pass,
-- and (c) could not say how far behind the ledger was.
--
-- ── What is added ─────────────────────────────────────────────────────────
--   bolagio_finance_ingestion_queue   one row per intent whose finance facts
--                                     need (re)deriving. Written by a trigger
--                                     IN THE SAME TRANSACTION as the booking
--                                     or payment state change, so a change
--                                     cannot be committed without its
--                                     finance work being queued.
--   bolagio_finance_refund_events     view: verified PayPal refund/reversal
--                                     events, attributed to an intent by
--                                     reference, order id or capture id.
--                                     Covers refunds made OUTSIDE the refund
--                                     saga (the PayPal dashboard), which the
--                                     intent row never carries.
--   bolagio_finance_ingestion_gaps    view: per intent, which expected finance
--                                     fact does not exist yet.
--   bolagio_finance_pipeline_status   view: one row — queue depth, ledger
--                                     lag, unprocessed payment events,
--                                     statement files awaiting import,
--                                     scheduler recency. What the Finance
--                                     health card reads.
--   bolagio_finance_enqueue_missing(boolean, integer)
--                                     catch-up and BACKFILL: queue every
--                                     intent with a gap. Idempotent.
--   bolagio_finance_claim_ingestion(text, integer)
--   bolagio_finance_settle_ingestion(uuid, timestamptz, boolean, text)
--
-- ── What is NOT changed ───────────────────────────────────────────────────
-- No booking or payment row is written. The triggers only INSERT into the
-- queue, inside an exception block: a queue failure is a WARNING, never a
-- failed booking or payment transaction. The finance posting functions and
-- their idempotency keys (`booking:<intent>`, capture id, refund id) are
-- unchanged, so a queue replay, the scheduled catch-up and a manual run all
-- collapse onto the same rows.
--
-- ── Backfill ──────────────────────────────────────────────────────────────
-- The last statement queues every historical intent that has a gap. The
-- scheduled reconcile pass then drains the queue in bounded batches. Re-run
-- at any time with:  select bolagio_finance_enqueue_missing(true);
--
-- Additive: one table, three views, five functions, two triggers. Re-runnable.
-- Rollback: supabase/ops/rollback_20260927.sql (run it BEFORE the rollbacks
-- of 20260926, 20260923, 20260922 and 20260920: the views read their tables).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The queue ───────────────────────────────────────────────────────────
create table if not exists bolagio_finance_ingestion_queue (
  intent_id        uuid primary key references bolagio_booking_intents(id) on delete cascade,
  -- pending: work to do · done: derived after the last change · failed: the
  -- last attempt raised; retried with backoff (next_attempt_at).
  state            text not null default 'pending' check (state in ('pending', 'done', 'failed')),
  -- Why it was queued: 'intent:UPDATE', 'refund_event', 'catch_up', 'backfill'.
  reason           text not null,
  -- The LAST time something asked for this intent to be derived. Compared
  -- with the enqueued_at a worker claimed, so a change that lands while a
  -- worker is busy is never marked done by that worker.
  enqueued_at      timestamptz not null default now(),
  next_attempt_at  timestamptz not null default now(),
  attempts         integer not null default 0,
  claimed_at       timestamptz,
  claimed_by       text,
  processed_at     timestamptz,
  last_error       text,
  updated_at       timestamptz not null default now()
);

create index if not exists bolagio_finance_ingestion_queue_due_idx
  on bolagio_finance_ingestion_queue (next_attempt_at) where state <> 'done';

comment on table bolagio_finance_ingestion_queue is
  'Finance work queued by booking/payment state changes, in the same transaction. Intent ids only; no guest data, no amounts.';

-- ── 2. Enqueue ─────────────────────────────────────────────────────────────
create or replace function bolagio_finance_enqueue(p_intent_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  -- clock_timestamp(), not now(): two enqueues inside one transaction (or a
  -- re-arm inside the transaction that claimed the row) must still order.
  insert into bolagio_finance_ingestion_queue (intent_id, reason, enqueued_at)
  values (p_intent_id, left(coalesce(p_reason, 'unknown'), 80), clock_timestamp())
  on conflict (intent_id) do update
    set state = 'pending', reason = excluded.reason, enqueued_at = clock_timestamp(), next_attempt_at = now(),
        attempts = 0, last_error = null, updated_at = now();
$$;

-- ── 3. Refund evidence from the payment inbox ─────────────────────────────
-- PAYMENT.CAPTURE.REFUNDED: the resource IS the refund, so `capture_id` holds
-- the refund id — the same key the refund saga stores on the intent, which
-- is what makes a saga refund and its webhook collapse onto one cash fact.
-- PAYMENT.CAPTURE.REVERSED: the resource is the reversed CAPTURE; its id is
-- the capture's own, which the incoming payment already uses as its key, so
-- the reversal is keyed `reversal:<capture id>`.
create or replace view bolagio_finance_refund_events with (security_invoker = true) as
select e.id                                   as event_id,
       e.event_type,
       e.received_at,
       coalesce(e.event_time, e.received_at)  as occurred_at,
       case when e.event_type = 'PAYMENT.CAPTURE.REVERSED' then 'reversal:' || e.capture_id else e.capture_id end
                                              as provider_reference,
       e.amount_cents,
       e.currency,
       (select i.id from bolagio_booking_intents i
         where (e.reference is not null and i.reference = e.reference)
            or (e.order_id is not null and i.payment_order_id = e.order_id)
            or (e.event_type = 'PAYMENT.CAPTURE.REVERSED' and i.payment_capture_id = e.capture_id)
         order by (i.reference = e.reference) desc nulls last
         limit 1)                             as intent_id
from bolagio_payment_events e
where e.verification = 'verified'
  and e.event_type in ('PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED')
  and e.capture_id is not null
  and coalesce(e.amount_cents, 0) > 0;

-- ── 4. Triggers: queue in the same transaction as the fact ────────────────
create or replace function bolagio_finance_enqueue_on_intent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status::text in ('confirmed', 'paid', 'paid_unfinalized', 'finalizing', 'finalization_failed')
     or new.payment_capture_id is not null
     or new.refund_state = 'completed'
     or new.payment_status::text in ('refunded', 'partially_refunded') then
    begin
      perform bolagio_finance_enqueue(new.id, 'intent:' || tg_op);
    exception when others then
      -- The booking transaction must never fail because finance could not be
      -- queued. The scheduled catch-up finds the gap from the facts.
      raise warning 'bolagio finance enqueue failed for intent %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists bolagio_booking_intents_finance_enqueue on bolagio_booking_intents;
create trigger bolagio_booking_intents_finance_enqueue
  after insert or update of status, payment_status, payment_capture_id, paid_amount_cents, refund_state, refund_id, refunded_amount_cents
  on bolagio_booking_intents
  for each row execute function bolagio_finance_enqueue_on_intent();

create or replace function bolagio_finance_enqueue_on_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_intent uuid;
begin
  if new.verification = 'verified'
     and new.event_type in ('PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED')
     and new.capture_id is not null then
    begin
      select r.intent_id into v_intent from bolagio_finance_refund_events r where r.event_id = new.id;
      if v_intent is not null then
        perform bolagio_finance_enqueue(v_intent, 'refund_event');
      end if;
    exception when others then
      raise warning 'bolagio finance enqueue failed for payment event %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists bolagio_payment_events_finance_enqueue on bolagio_payment_events;
create trigger bolagio_payment_events_finance_enqueue
  after insert or update of verification on bolagio_payment_events
  for each row execute function bolagio_finance_enqueue_on_payment_event();

-- ── 5. Gaps: which expected fact does not exist yet ────────────────────────
-- Mirrors lib/finance/ingestion-rules.ts. A gap the rules then decline to
-- post (a stay whose components are all optional, say) is processed once and
-- marked done; the pipeline status counts only gaps not processed since the
-- intent last changed.
create or replace view bolagio_finance_ingestion_gaps with (security_invoker = true) as
select i.id as intent_id,
       i.reference,
       i.updated_at,
       (i.status::text in ('confirmed', 'paid', 'paid_unfinalized', 'finalizing', 'finalization_failed')
         and coalesce(i.quoted_total_cents, 0) > 0
         and not exists (select 1 from bolagio_finance_transactions t
                          where t.source_system = 'booking' and t.source_reference = 'booking:' || i.id::text))
         as revenue_missing,
       (i.payment_capture_id is not null and coalesce(i.paid_amount_cents, 0) > 0
         and i.payment_status::text in ('paid', 'partially_refunded', 'refunded', 'disputed')
         and not exists (select 1 from bolagio_finance_payments p
                          where p.source in ('paypal', 'other') and p.provider_reference = i.payment_capture_id))
         as capture_missing,
       (i.refund_state = 'completed' and i.refund_id is not null and coalesce(i.refunded_amount_cents, 0) > 0
         and not exists (select 1 from bolagio_finance_payments p
                          where p.source in ('paypal', 'other') and p.provider_reference = i.refund_id))
         as refund_missing,
       exists (select 1 from bolagio_finance_refund_events r
                where r.intent_id = i.id
                  and not exists (select 1 from bolagio_finance_payments p
                                   where p.source in ('paypal', 'other') and p.provider_reference = r.provider_reference))
         as refund_event_missing
from bolagio_booking_intents i;

-- ── 6. Catch-up and backfill ───────────────────────────────────────────────
-- p_force = false (every scheduled pass): queue intents with a gap and no
--   queue row at all — facts that predate this migration or whose trigger
--   could not queue them.
-- p_force = true (backfill): also re-queue gaps already marked done or
--   failed. Pending rows are left alone.
create or replace function bolagio_finance_enqueue_missing(p_force boolean default false, p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  with gaps as (
    select g.intent_id
    from bolagio_finance_ingestion_gaps g
    left join bolagio_finance_ingestion_queue q on q.intent_id = g.intent_id
    where (g.revenue_missing or g.capture_missing or g.refund_missing or g.refund_event_missing)
      and (q.intent_id is null or (p_force and q.state <> 'pending'))
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  )
  insert into bolagio_finance_ingestion_queue (intent_id, reason, enqueued_at)
  select intent_id, case when p_force then 'backfill' else 'catch_up' end, clock_timestamp() from gaps
  on conflict (intent_id) do update
    set state = 'pending', reason = excluded.reason, enqueued_at = clock_timestamp(), next_attempt_at = now(),
        attempts = 0, last_error = null, updated_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── 7. Claim and settle ────────────────────────────────────────────────────
-- A claim leases the row for ten minutes (a worker that dies is retried
-- then). Processing is idempotent per fact, so a lease that expires under a
-- slow worker costs a repeat, never a duplicate.
create or replace function bolagio_finance_claim_ingestion(p_worker text, p_limit integer default 10)
returns table (intent_id uuid, enqueued_at timestamptz, attempts integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  with c as (
    select q.intent_id from bolagio_finance_ingestion_queue q
    where q.state <> 'done' and q.next_attempt_at <= now()
    order by q.next_attempt_at, q.enqueued_at
    limit greatest(1, least(coalesce(p_limit, 10), 200))
    for update skip locked
  )
  update bolagio_finance_ingestion_queue q
     set claimed_at = now(), claimed_by = left(p_worker, 100), attempts = q.attempts + 1,
         next_attempt_at = now() + interval '10 minutes', updated_at = now()
    from c
   where q.intent_id = c.intent_id
  returning q.intent_id, q.enqueued_at, q.attempts;
$$;

create or replace function bolagio_finance_settle_ingestion(p_intent_id uuid, p_enqueued_at timestamptz, p_ok boolean, p_error text default null)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  update bolagio_finance_ingestion_queue q
     set state = case when not p_ok then 'failed'
                      when q.enqueued_at > p_enqueued_at then 'pending'   -- changed again while we worked
                      else 'done' end,
         processed_at = case when p_ok then now() else q.processed_at end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'unknown'), 500) end,
         next_attempt_at = case when not p_ok
                                  then now() + least(interval '6 hours', interval '1 minute' * power(2, least(q.attempts, 9)))
                                when q.enqueued_at > p_enqueued_at then now()
                                else q.next_attempt_at end,
         claimed_at = null, claimed_by = null, updated_at = now()
   where q.intent_id = p_intent_id
  returning q.state;
$$;

-- ── 8. Pipeline status: one row, one round trip ───────────────────────────
create or replace view bolagio_finance_pipeline_status with (security_invoker = true) as
select
  now()                                                                                   as observed_at,
  (select count(*) from bolagio_finance_ingestion_queue where state = 'pending')::int     as queue_pending,
  (select count(*) from bolagio_finance_ingestion_queue where state = 'failed')::int      as queue_failed,
  (select min(enqueued_at) from bolagio_finance_ingestion_queue where state <> 'done')    as queue_oldest_at,
  (select left(last_error, 200) from bolagio_finance_ingestion_queue
    where state = 'failed' order by updated_at desc limit 1)                              as queue_last_error,
  (select count(*) from bolagio_finance_ingestion_gaps g
     left join bolagio_finance_ingestion_queue q on q.intent_id = g.intent_id
    where (g.revenue_missing or g.capture_missing or g.refund_missing or g.refund_event_missing)
      and not (q.state is not distinct from 'done' and q.processed_at >= g.updated_at))::int
                                                                                          as ledger_gaps,
  (select count(*) from bolagio_booking_intents
    where status::text in ('confirmed', 'paid', 'paid_unfinalized', 'finalizing', 'finalization_failed'))::int
                                                                                          as revenue_intents,
  (select count(*) from bolagio_finance_transactions
    where source_system = 'booking' and kind = 'revenue')::int                            as booking_revenue_posted,
  (select count(*) from bolagio_payment_events
    where verification = 'verified' and status in ('pending', 'claimed', 'failed'))::int  as payment_events_unprocessed,
  (select min(received_at) from bolagio_payment_events
    where verification = 'verified' and status in ('pending', 'claimed', 'failed'))       as payment_events_oldest_at,
  (select max(received_at) from bolagio_payment_events where verification = 'verified')  as payment_event_last_verified_at,
  (select count(*) from bolagio_finance_refund_events where intent_id is null)::int      as refund_events_unattributed,
  (select count(*) from bolagio_finance_import_batches where status = 'validated')::int  as import_batches_awaiting_commit,
  (select coalesce(sum(valid_rows), 0) from bolagio_finance_import_batches
    where status = 'validated')::int                                                      as import_rows_awaiting_commit,
  (select count(*) from bolagio_finance_ota_settlements
    where amendment_state = 'current' and ledger_state = 'pending')::int                  as settlements_ledger_pending,
  (select count(*) from bolagio_finance_ota_settlements
    where amendment_state = 'current' and match_state <> 'matched')::int                  as settlements_unmatched,
  (select count(*) from bolagio_reservations)::int                                        as reservations,
  (select max(last_synced_at) from bolagio_reservations)                                  as reservations_last_synced_at,
  (select max(finished_at) from bolagio_scheduler_runs where job = 'reconcile' and ok)    as reconcile_last_ok_at,
  (select max(finished_at) from bolagio_scheduler_runs where job = 'reservation_sync' and ok)
                                                                                          as reservation_sync_last_ok_at,
  (select max(finished_at) from bolagio_scheduler_runs where job = 'reservation_sync' and not ok)
                                                                                          as reservation_sync_last_failed_at;

-- ── 9. Security: deny the browser everything ───────────────────────────────
-- The views run with the CALLER's rights (security_invoker): only the service
-- role, which bypasses RLS, can read through them — never the view owner's.
alter table bolagio_finance_ingestion_queue enable row level security;
revoke all on bolagio_finance_ingestion_queue from anon, authenticated;
revoke all on bolagio_finance_refund_events from anon, authenticated;
revoke all on bolagio_finance_ingestion_gaps from anon, authenticated;
revoke all on bolagio_finance_pipeline_status from anon, authenticated;

do $$ declare fn text; begin
  foreach fn in array array[
    'bolagio_finance_enqueue_missing(boolean,integer)',
    'bolagio_finance_claim_ingestion(text,integer)',
    'bolagio_finance_settle_ingestion(uuid,timestamptz,boolean,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  foreach fn in array array[
    'bolagio_finance_enqueue(uuid,text)',
    'bolagio_finance_enqueue_on_intent()',
    'bolagio_finance_enqueue_on_payment_event()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

-- ── 10. Backfill: queue every historical intent with a gap ────────────────
-- Writes queue rows only. The next reconcile pass starts draining them.
select bolagio_finance_enqueue_missing(true);
