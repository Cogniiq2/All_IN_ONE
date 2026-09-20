-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — booking core, production hardening.
--
-- Depends on, in order:
--   20260916120000_booking_foundation.sql
--   20260917100000_booking_core_states.sql       (must have COMMITTED)
--   20260917110000_booking_core_hardening.sql
--   20260919120000_admin_operators.sql
--
-- Everything here is additive and idempotent: every statement can be re-run
-- against a database that already carries it. Nothing is dropped except a
-- function signature that is immediately recreated with one more parameter,
-- and one partial index that is recreated with a wider predicate.
--
-- ── What this migration is for ────────────────────────────────────────────
--   1. A payment that was declined or abandoned may complete AGAINST THE SAME
--      ORDER. The transition table now says so; before, a capture PayPal had
--      already executed after a decline was refused by the trigger.
--   2. A blind retry of a mutation whose earlier outcome is unknown is refused
--      BY THE DATABASE, not only by application discipline.
--   3. The hold-sweep index covers every state a guest can still pay from.
--   4. Units carry their operational clock: timezone, check-in, check-out.
--   5. A scheduler heartbeat, so "is the schedule running" is measurable.
--   6. The turnover and guest-operations foundation: deterministic,
--      idempotent derivation from CONFIRMED stays, emitted once each.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — payment transitions
-- ══════════════════════════════════════════════════════════════════════════
--
-- `denied → paid` and `cancelled → paid` are LEGAL. PayPal's restart flow
-- re-approves the order the guest already holds after a declined instrument,
-- and the next capture may complete. Refusing the edge would make the trigger
-- reject a capture that PayPal has already executed: money taken, row says
-- declined, and the webhook retrying into the same wall until it dead-letters.
-- Mirrored in lib/booking/states.ts and asserted by tests/state-machine.test.ts.

create or replace function bolagio_payment_transition_allowed(
  p_from bolagio_payment_status,
  p_to   bolagio_payment_status
) returns boolean language sql immutable parallel safe as $$
  select case
    when p_from = 'unknown' or p_to = 'unknown' then true
    when p_from = p_to then true
    else p_to::text = any (
      case p_from
        when 'not_created'        then array['order_created','approved','capture_pending','paid','denied','cancelled']
        when 'order_created'      then array['approved','capture_pending','paid','denied','cancelled']
        when 'approved'           then array['capture_pending','paid','denied','cancelled']
        when 'capture_pending'    then array['paid','denied','cancelled']
        when 'paid'               then array['refunded','partially_refunded','disputed']
        when 'denied'             then array['order_created','approved','capture_pending','paid']
        when 'cancelled'          then array['order_created','approved','capture_pending','paid']
        when 'refunded'           then array['disputed']
        when 'partially_refunded' then array['refunded','disputed']
        when 'disputed'           then array['refunded','partially_refunded','paid']
        else array[]::text[]
      end
    )
  end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — no blind retry after an unknown outcome
-- ══════════════════════════════════════════════════════════════════════════
--
-- `bolagio_begin_external_operation` is called BEFORE every external
-- mutation. If the same logical operation already has an `outcome_unknown`
-- row, the request may have taken effect the first time, and sending it again
-- is how a guest gets two reservations or two charges. The database now
-- refuses that, with its own SQLSTATE, unless the caller declares the
-- operation idempotent by nature (finalize and release: "this booking is
-- confirmed", "this booking holds nothing").

drop function if exists bolagio_begin_external_operation(text, bolagio_external_provider, text, uuid, jsonb);

create or replace function bolagio_begin_external_operation(
  p_key text, p_provider bolagio_external_provider, p_type text,
  p_intent_id uuid default null, p_request jsonb default null,
  p_allow_retry_after_unknown boolean default false
) returns bolagio_external_operations
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_external_operations;
begin
  select * into v_row from bolagio_external_operations where operation_key = p_key for update;

  if found and v_row.outcome in ('outcome_unknown', 'in_flight') and not p_allow_retry_after_unknown then
    -- `in_flight` is included: a second caller racing the first would also be
    -- a second request. The stale-in-flight case (a process that died before
    -- recording anything) is resolved by reconciliation, never by resending.
    raise exception 'bolagio: operation % has an unresolved unknown outcome; read the provider before retrying', p_key
      using errcode = 'BLG01';
  end if;

  insert into bolagio_external_operations (operation_key, provider, operation_type, intent_id, request_summary)
  values (p_key, p_provider, p_type, p_intent_id, p_request)
  on conflict (operation_key) do update set
    attempts = bolagio_external_operations.attempts + 1,
    -- A permitted retry is a new attempt in flight; the previous verdict is
    -- superseded by whatever this attempt learns.
    outcome  = 'in_flight',
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

comment on function bolagio_begin_external_operation is
  'Record the intent to make an external mutation. Refuses (SQLSTATE BLG01) while an earlier attempt of the same operation has an unknown outcome, unless the caller declares the operation idempotent.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — the hold sweep index covers every payable state
-- ══════════════════════════════════════════════════════════════════════════
--
-- The foundation's index covered two states. A declined (`payment_failed`) or
-- abandoned (`payment_cancelled`) attempt was never swept, so its Beds24 hold
-- blocked the nights on every channel until a person noticed.

drop index if exists bolagio_booking_intents_hold_idx;
create index if not exists bolagio_booking_intents_hold_idx
  on bolagio_booking_intents (hold_expires_at)
  where status in ('hold_created','payment_session_created','awaiting_payment',
                   'payment_pending','payment_failed','payment_cancelled');

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — the unit's operational clock
-- ══════════════════════════════════════════════════════════════════════════
--
-- A hotel night is a calendar day in the PROPERTY's timezone. Check-in and
-- check-out times are operational facts the guest-operations timing and the
-- turnover window are derived from. Defaults are BoLaGio's stated house rules
-- (14:00 / 11:00, Europe/Berlin); a future property elsewhere overrides them
-- per row rather than per deployment.

alter table bolagio_units
  add column if not exists timezone       text not null default 'Europe/Berlin',
  add column if not exists check_in_time  time not null default '14:00',
  add column if not exists check_out_time time not null default '11:00';

do $$ begin
  alter table bolagio_units
    add constraint bolagio_units_timezone_check check (timezone <> '' and timezone !~ '\s');
exception when duplicate_object then null; end $$;

comment on column bolagio_units.timezone is 'IANA zone the property keeps its calendar in. Nights, "today" and message timing are computed in it.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — scheduler heartbeat
-- ══════════════════════════════════════════════════════════════════════════
--
-- "Is reconciliation running?" was not measurable: a pass left no trace when
-- it found nothing to do. Every scheduled invocation now records itself, and
-- the System page reports the age of the last run per job rather than
-- "not instrumented". A job that has not run within its expected interval is
-- the MEDIUM "scheduler overdue" alert.

create table if not exists bolagio_scheduler_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null check (job in ('reconcile','inventory_sync','operations')),
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  ok          boolean not null,
  -- Counts only: scanned, resolved, failed, released, synced… never a
  -- reference, never guest data.
  report      jsonb,
  error       text,
  worker      text
);

create index if not exists bolagio_scheduler_runs_job_idx
  on bolagio_scheduler_runs (job, finished_at desc);

comment on table bolagio_scheduler_runs is
  'Heartbeat. One row per scheduled invocation. Counts only, no PII.';

create or replace function bolagio_record_scheduler_run(
  p_job text, p_started_at timestamptz, p_ok boolean,
  p_report jsonb default null, p_error text default null, p_worker text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into bolagio_scheduler_runs (job, started_at, ok, report, error, worker)
  values (p_job, p_started_at, p_ok, p_report, left(p_error, 500), left(p_worker, 100))
  returning id into v_id;
  -- Bounded: keep the last 2,000 rows per job so the table cannot grow
  -- without limit on a three-minute schedule.
  delete from bolagio_scheduler_runs
  where job = p_job
    and id in (
      select id from bolagio_scheduler_runs where job = p_job
      order by finished_at desc offset 2000
    );
  return v_id;
end $$;

create or replace view bolagio_scheduler_status as
select distinct on (job)
  job, started_at, finished_at, ok, report, error, worker
from bolagio_scheduler_runs
-- `started_at` breaks the tie between two rows written in one transaction,
-- whose `finished_at` defaults are identical.
order by job, finished_at desc, started_at desc;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — turnovers
-- ══════════════════════════════════════════════════════════════════════════
--
-- A CONFIRMED stay implies a departure, and a departure implies a turnover:
-- the window between check-out and the next possible check-in in which the
-- unit must be cleaned. Nothing here models WHO cleans or WHETHER it was done
-- from a device; that is a product decision recorded in docs/guest-operations.md.
-- What is modelled is the deterministic fact: this unit needs turning over
-- after this departure, exactly once, and not at all if the stay is no longer
-- confirmed.

create table if not exists bolagio_turnovers (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references bolagio_units(id) on delete cascade,
  -- One turnover per stay. The stay's departure moving (a future date change)
  -- updates this row rather than creating a second.
  intent_id     uuid not null unique references bolagio_booking_intents(id) on delete cascade,
  departure     date not null,
  -- Window in which cleaning has to happen: check-out time on the departure
  -- day until check-in time the same day. If the next confirmed arrival is
  -- later, `next_arrival` says when the room is actually needed; null means
  -- no confirmed arrival is known yet.
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  next_arrival  date,
  same_day      boolean not null default false,
  status        text not null default 'required'
    check (status in ('required','done','void')),
  done_at       timestamptz,
  done_by       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists bolagio_turnovers_unit_departure_idx
  on bolagio_turnovers (unit_id, departure) where status = 'required';

do $$ begin
  create trigger bolagio_turnovers_touch before update on bolagio_turnovers
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

comment on table bolagio_turnovers is
  'Cleaning work implied by confirmed stays. Derived, idempotent; voided when the stay leaves confirmed. No guest data.';

-- ── Derive turnovers from the confirmed stays ─────────────────────────────
--
-- Idempotent: safe to run every pass. Creates a `required` turnover for every
-- confirmed stay departing from yesterday onwards that lacks one, updates the
-- departure of one whose stay moved, and voids one whose stay is no longer
-- confirmed. A newly created turnover emits `cleaning.required` to the
-- outbox, in the same transaction, exactly once.

create or replace function bolagio_sync_turnovers(p_horizon_days integer default 60)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
  v_updated integer := 0;
  v_voided  integer := 0;
  r record;
  v_next date;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_exists boolean;
begin
  for r in
    select i.id as intent_id, i.unit_id, i.reference, i.check_in, i.check_out,
           u.slug, u.timezone, u.check_in_time, u.check_out_time
    from bolagio_booking_intents i
    join bolagio_units u on u.id = i.unit_id
    where i.status = 'confirmed'
      and i.check_out >= ((now() at time zone u.timezone)::date - 1)
      and i.check_out <= ((now() at time zone u.timezone)::date + greatest(1, least(365, p_horizon_days)))
  loop
    select min(n.check_in) into v_next
    from bolagio_booking_intents n
    where n.unit_id = r.unit_id and n.status = 'confirmed' and n.check_in >= r.check_out and n.id <> r.intent_id;

    v_window_start := (r.check_out::timestamp + r.check_out_time) at time zone r.timezone;
    v_window_end   := (r.check_out::timestamp + r.check_in_time)  at time zone r.timezone;

    -- Decided BEFORE the upsert: timestamps cannot tell an insert from an
    -- update inside one transaction, where now() is constant.
    v_exists := exists (select 1 from bolagio_turnovers where intent_id = r.intent_id);

    insert into bolagio_turnovers (unit_id, intent_id, departure, window_start, window_end, next_arrival, same_day)
    values (r.unit_id, r.intent_id, r.check_out, v_window_start, v_window_end, v_next, coalesce(v_next = r.check_out, false))
    on conflict (intent_id) do update set
      departure    = excluded.departure,
      window_start = excluded.window_start,
      window_end   = excluded.window_end,
      next_arrival = excluded.next_arrival,
      same_day     = excluded.same_day,
      -- A voided turnover whose stay is confirmed again is required again.
      status       = case when bolagio_turnovers.status = 'void' then 'required' else bolagio_turnovers.status end
    where bolagio_turnovers.departure    is distinct from excluded.departure
       or bolagio_turnovers.next_arrival is distinct from excluded.next_arrival
       or bolagio_turnovers.same_day     is distinct from excluded.same_day
       or bolagio_turnovers.status = 'void';

    if found then
      if not v_exists then
        v_created := v_created + 1;
        insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
        values ('cleaning.required', 'turnover', r.intent_id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                   'departure', r.check_out, 'nextArrival', v_next,
                                   'sameDay', coalesce(v_next = r.check_out, false)));
      else
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- Stays that left `confirmed` (released, manual review, cancelled) no
  -- longer imply cleaning. Voided, never deleted: the fact that it was
  -- required is operational history.
  update bolagio_turnovers t set status = 'void'
  from bolagio_booking_intents i
  where i.id = t.intent_id and t.status = 'required' and i.status <> 'confirmed';
  get diagnostics v_voided = row_count;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'voided', v_voided);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — guest-operations events
-- ══════════════════════════════════════════════════════════════════════════
--
-- The reserved event names in docs/n8n-booking-contract.md now have a real,
-- deterministic domain trigger: TIME, relative to a CONFIRMED stay, in the
-- property's own timezone. Each is emitted at most once per booking — the
-- unique (intent_id, kind) row is written in the same transaction as the
-- outbox row, so a pass that dies half way emits nothing twice.
--
-- Nothing here sends a message. The outbox carries a reference; n8n fetches
-- the message context over the authenticated internal API.

create table if not exists bolagio_guest_events (
  intent_id  uuid not null references bolagio_booking_intents(id) on delete cascade,
  kind       text not null check (kind in ('guest.prearrival_ready','guest.checkin_ready','review.requested')),
  emitted_at timestamptz not null default now(),
  primary key (intent_id, kind)
);

comment on table bolagio_guest_events is
  'Which time-driven guest-operations events have been emitted per booking. The dedup ledger for bolagio_emit_guest_events().';

create or replace function bolagio_emit_guest_events(
  p_prearrival_days integer default 3,
  p_review_delay_days integer default 1,
  p_review_window_days integer default 14
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prearrival integer := 0;
  v_checkin integer := 0;
  v_review integer := 0;
  r record;
  v_today date;
  v_kind text;
begin
  for r in
    select i.id, i.reference, i.check_in, i.check_out, u.slug, u.timezone
    from bolagio_booking_intents i
    join bolagio_units u on u.id = i.unit_id
    where i.status = 'confirmed'
      and i.check_out >= ((now() at time zone u.timezone)::date - greatest(1, p_review_delay_days + p_review_window_days))
      and i.check_in  <= ((now() at time zone u.timezone)::date + greatest(0, p_prearrival_days))
  loop
    v_today := (now() at time zone r.timezone)::date;

    -- Pre-arrival: within N days of check-in, and check-in not yet passed.
    if r.check_in - v_today between 0 and greatest(0, p_prearrival_days) then
      v_kind := 'guest.prearrival_ready';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind)
      on conflict do nothing;
      if found then
        v_prearrival := v_prearrival + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                   'checkIn', r.check_in, 'checkOut', r.check_out, 'daysUntilArrival', r.check_in - v_today));
      end if;
    end if;

    -- Check-in day, in the property's calendar.
    if r.check_in = v_today then
      v_kind := 'guest.checkin_ready';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind)
      on conflict do nothing;
      if found then
        v_checkin := v_checkin + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                   'checkIn', r.check_in, 'checkOut', r.check_out));
      end if;
    end if;

    -- Review request: a delay after departure, and only within a window —
    -- a booking confirmed months ago and never asked is not asked today.
    if v_today - r.check_out between greatest(0, p_review_delay_days)
                                 and greatest(0, p_review_delay_days) + greatest(1, p_review_window_days) then
      v_kind := 'review.requested';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind)
      on conflict do nothing;
      if found then
        v_review := v_review + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                   'checkIn', r.check_in, 'checkOut', r.check_out));
      end if;
    end if;
  end loop;

  return jsonb_build_object('prearrival', v_prearrival, 'checkin', v_checkin, 'review', v_review);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — the attention view learns the swept states
-- ══════════════════════════════════════════════════════════════════════════

create or replace view bolagio_ops_attention as
select
  i.reference,
  u.slug            as unit_slug,
  i.status,
  i.payment_status,
  i.check_in,
  i.check_out,
  i.currency,
  i.quoted_total_cents,
  i.paid_amount_cents,
  i.beds24_booking_id,
  i.payment_order_id,
  i.last_failure_code,
  i.reconciliation_state,
  i.hold_expires_at,
  i.updated_at,
  case
    when i.status in ('paid_unfinalized','finalization_failed') then 1
    when i.status = 'manual_review' then 1
    when i.status = 'release_failed' then 2
    when i.payment_status = 'unknown' then 2
    when i.status = 'paid' and i.confirmed_at is null then 2
    -- The lease ran out and the release never finished: the external hold
    -- is still blocking every channel.
    when i.status = 'expired' then 2
    when i.status in ('releasing','locking') then 3
    when i.status in ('payment_failed','payment_cancelled')
         and i.hold_expires_at is not null and i.hold_expires_at < now() - interval '30 minutes' then 3
    else 4
  end as severity
from bolagio_booking_intents i
join bolagio_units u on u.id = i.unit_id
where i.status in ('locking','paid','paid_unfinalized','finalization_failed',
                   'releasing','release_failed','manual_review','expired')
   or (i.status in ('payment_failed','payment_cancelled')
       and i.hold_expires_at is not null and i.hold_expires_at < now() - interval '30 minutes')
   or i.payment_status = 'unknown'
   or i.reconciliation_state <> 'ok';

create or replace view bolagio_ops_queues as
select 'outbox' as queue, status::text as state, count(*) as items,
       min(created_at) as oldest
from bolagio_outbox_events group by 1,2
union all
select 'payment_events', status::text, count(*), min(received_at)
from bolagio_payment_events group by 1,2
union all
select 'reconciliation', status::text, count(*), min(created_at)
from bolagio_reconciliation_jobs group by 1,2
union all
select 'external_operations', outcome::text, count(*), min(started_at)
from bolagio_external_operations group by 1,2
union all
select 'turnovers', status, count(*), min(created_at)
from bolagio_turnovers group by 1,2;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — RLS and privileges
-- ══════════════════════════════════════════════════════════════════════════

alter table bolagio_scheduler_runs enable row level security;
alter table bolagio_turnovers      enable row level security;
alter table bolagio_guest_events   enable row level security;

revoke all on bolagio_scheduler_runs, bolagio_turnovers, bolagio_guest_events from anon, authenticated;
revoke all on bolagio_scheduler_status from anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)',
    'bolagio_record_scheduler_run(text,timestamptz,boolean,jsonb,text,text)',
    'bolagio_sync_turnovers(integer)',
    'bolagio_emit_guest_events(integer,integer,integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
