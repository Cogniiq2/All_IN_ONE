-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260920120000_booking_production_hardening.sql
--
-- Restores the objects that migration REPLACED to their previous definition
-- and drops the objects it ADDED. It does not touch anything older.
--
-- ── What is lost ──────────────────────────────────────────────────────────
--   bolagio_scheduler_runs, bolagio_turnovers, bolagio_guest_events and their
--   rows. cleaning.required / guest.* outbox rows already written are kept
--   (they are ordinary outbox rows). The unit clock columns are kept — they
--   are harmless, and dropping columns is the one irreversible step here, so
--   it is left as a commented option at the bottom.
--
-- ── When NOT to run this ──────────────────────────────────────────────────
--   If the application deployed against the 6-argument
--   bolagio_begin_external_operation is still running, roll the APPLICATION
--   back first: the old function does not accept the sixth argument and every
--   external mutation would fail closed (which is safe, but is an outage).
--
-- Run in one transaction:  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260920.sql
-- ════════════════════════════════════════════════════════════════════════════

-- 1. payment transitions: the 2026-09-17 definition
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
        when 'order_created'      then array['approved','capture_pending','paid','denied','cancelled','unknown']
        when 'approved'           then array['capture_pending','paid','denied','cancelled','unknown']
        when 'capture_pending'    then array['paid','denied','cancelled','unknown']
        when 'paid'               then array['refunded','partially_refunded','disputed']
        when 'denied'             then array['order_created','unknown']
        when 'cancelled'          then array['order_created','unknown']
        when 'refunded'           then array['disputed']
        when 'partially_refunded' then array['refunded','disputed']
        when 'disputed'           then array['refunded','partially_refunded','paid']
        else array[]::text[]
      end
    )
  end;
$$;

-- 2. begin_external_operation: the 2026-09-17 five-argument definition
drop function if exists bolagio_begin_external_operation(text, bolagio_external_provider, text, uuid, jsonb, boolean);
create or replace function bolagio_begin_external_operation(
  p_key text, p_provider bolagio_external_provider, p_type text,
  p_intent_id uuid default null, p_request jsonb default null
) returns bolagio_external_operations
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_external_operations;
begin
  insert into bolagio_external_operations (operation_key, provider, operation_type, intent_id, request_summary)
  values (p_key, p_provider, p_type, p_intent_id, p_request)
  on conflict (operation_key) do update set
    attempts = bolagio_external_operations.attempts + 1,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb) to service_role;

-- 3. the hold-sweep index: the foundation's predicate
drop index if exists bolagio_booking_intents_hold_idx;
create index if not exists bolagio_booking_intents_hold_idx
  on bolagio_booking_intents (hold_expires_at)
  where status in ('hold_created', 'payment_pending');

-- 4. views: the 2026-09-17 definitions
drop view if exists bolagio_scheduler_status;
create or replace view bolagio_ops_attention as
select
  i.reference, u.slug as unit_slug, i.status, i.payment_status, i.check_in, i.check_out, i.currency,
  i.quoted_total_cents, i.paid_amount_cents, i.beds24_booking_id, i.payment_order_id, i.last_failure_code,
  i.reconciliation_state, i.hold_expires_at, i.updated_at,
  case
    when i.status in ('paid_unfinalized','finalization_failed') then 1
    when i.status = 'manual_review' then 1
    when i.status = 'release_failed' then 2
    when i.payment_status = 'unknown' then 2
    when i.status = 'paid' and i.confirmed_at is null then 2
    when i.status in ('releasing','locking') then 3
    else 4
  end as severity
from bolagio_booking_intents i
join bolagio_units u on u.id = i.unit_id
where i.status in ('locking','paid','paid_unfinalized','finalization_failed',
                   'releasing','release_failed','manual_review')
   or i.payment_status = 'unknown'
   or i.reconciliation_state <> 'ok';

create or replace view bolagio_ops_queues as
select 'outbox' as queue, status::text as state, count(*) as items, min(created_at) as oldest
from bolagio_outbox_events group by 1,2
union all
select 'payment_events', status::text, count(*), min(received_at) from bolagio_payment_events group by 1,2
union all
select 'reconciliation', status::text, count(*), min(created_at) from bolagio_reconciliation_jobs group by 1,2
union all
select 'external_operations', outcome::text, count(*), min(started_at) from bolagio_external_operations group by 1,2;

-- 5. added functions and tables
drop function if exists bolagio_emit_guest_events(integer, integer, integer);
drop function if exists bolagio_sync_turnovers(integer);
drop function if exists bolagio_record_scheduler_run(text, timestamptz, boolean, jsonb, text, text);
drop table if exists bolagio_guest_events;
drop table if exists bolagio_turnovers;
drop table if exists bolagio_scheduler_runs;

-- 6. OPTIONAL and irreversible: the unit clock columns. Leave unless required.
-- alter table bolagio_units drop constraint if exists bolagio_units_timezone_check;
-- alter table bolagio_units drop column if exists timezone, drop column if exists check_in_time, drop column if exists check_out_time;
