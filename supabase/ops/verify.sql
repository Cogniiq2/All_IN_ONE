-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — POST-MIGRATION VERIFICATION. Read-only.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/verify.sql
--
-- Every check raises if it fails, so a non-zero exit is a failed verification.
-- It does not write. It does not call any provider.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

create or replace function pg_temp.v_assert(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'VERIFY FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

set client_min_messages = notice;

do $$ begin
  -- Tables
  perform pg_temp.v_assert(to_regclass('public.bolagio_units') is not null, 'bolagio_units exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_booking_intents') is not null, 'bolagio_booking_intents exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_outbox_events') is not null, 'bolagio_outbox_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_payment_events') is not null, 'bolagio_payment_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_external_operations') is not null, 'bolagio_external_operations exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_reconciliation_jobs') is not null, 'bolagio_reconciliation_jobs exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_operators') is not null, 'bolagio_operators exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_admin_audit_log') is not null, 'bolagio_admin_audit_log exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_scheduler_runs') is not null, 'bolagio_scheduler_runs exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_turnovers') is not null, 'bolagio_turnovers exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_guest_events') is not null, 'bolagio_guest_events exists');
  -- Views
  perform pg_temp.v_assert(to_regclass('public.bolagio_ops_attention') is not null, 'bolagio_ops_attention view exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_ops_queues') is not null, 'bolagio_ops_queues view exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_scheduler_status') is not null, 'bolagio_scheduler_status view exists');
  -- Columns
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_units' and column_name='check_in_time'), 'bolagio_units.check_in_time exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_booking_intents' and column_name='payment_status'), 'bolagio_booking_intents.payment_status exists');
  -- Functions, by exact signature
  perform pg_temp.v_assert(to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null, 'bolagio_booking_transition has the expected signature');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null, 'bolagio_begin_external_operation has the 6-argument signature');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)') is null, 'the old 5-argument bolagio_begin_external_operation is gone');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,bpchar,text)') is not null, 'bolagio_record_payment_capture exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_sync_turnovers(integer)') is not null, 'bolagio_sync_turnovers exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_emit_guest_events(integer,integer,integer)') is not null, 'bolagio_emit_guest_events exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_scheduler_run(text,timestamptz,boolean,jsonb,text,text)') is not null, 'bolagio_record_scheduler_run exists');
  -- Transition semantics
  perform pg_temp.v_assert(bolagio_payment_transition_allowed('denied','paid'), 'denied -> paid is legal');
  perform pg_temp.v_assert(not bolagio_payment_transition_allowed('paid','order_created'), 'paid -> order_created is illegal');
  perform pg_temp.v_assert(not bolagio_transition_allowed('confirmed','cancelled'), 'confirmed -> cancelled is illegal');
  perform pg_temp.v_assert(bolagio_transition_allowed('expired','paid'), 'expired -> paid is legal');
  perform pg_temp.v_assert(bolagio_status_reserves('release_failed') and bolagio_status_reserves('manual_review') and bolagio_status_reserves('expired') and bolagio_status_reserves('payment_failed'), 'failure states still reserve');
  perform pg_temp.v_assert(not bolagio_status_reserves('released') and not bolagio_status_reserves('cancelled'), 'released/cancelled do not reserve');
  -- Constraints and triggers
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_booking_intents_no_overlap'), 'the no-overlap exclusion constraint is present');
  perform pg_temp.v_assert(exists (select 1 from pg_trigger where tgname='bolagio_booking_intents_status_guard'), 'the status guard trigger is present');
  perform pg_temp.v_assert(exists (select 1 from pg_indexes where indexname='bolagio_booking_intents_hold_idx' and indexdef like '%payment_failed%'), 'the hold-sweep index covers payment_failed');
  perform pg_temp.v_assert(exists (select 1 from pg_indexes where indexname='bolagio_reconciliation_open_uq'), 'one open reconciliation job per (intent, reason)');
  -- RLS on every bolagio_ table, no policies, no browser grants
  perform pg_temp.v_assert(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%' and not c.relrowsecurity), 'RLS enabled on every bolagio_ table');
  perform pg_temp.v_assert(not exists (select 1 from pg_policies where schemaname='public' and tablename like 'bolagio\_%'), 'no policy on any bolagio_ table');
  perform pg_temp.v_assert(not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name like 'bolagio\_%' and grantee in ('anon','authenticated')), 'anon/authenticated hold no privilege on bolagio_ tables');
  -- Command functions are not executable by browser roles
  perform pg_temp.v_assert(not has_function_privilege('anon', 'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)', 'execute'), 'anon cannot execute bolagio_booking_transition');
  perform pg_temp.v_assert(not has_function_privilege('authenticated', 'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,bpchar,text)', 'execute'), 'authenticated cannot execute bolagio_record_payment_capture');
  perform pg_temp.v_assert(has_function_privilege('service_role', 'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)', 'execute'), 'service_role can execute bolagio_begin_external_operation');
  -- Data integrity
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where payment_capture_id is not null group by payment_capture_id having count(*) > 1), 'no capture id is shared by two bookings');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where beds24_booking_id is not null group by beds24_booking_id having count(*) > 1), 'no Beds24 booking id is shared by two bookings');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where status = 'confirmed' and source = 'direct' and payment_status not in ('paid','partially_refunded','disputed','refunded')), 'no direct confirmed booking without a settled payment');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_units where is_bookable and not exists (
      select 1 from bolagio_unit_integrations i where i.unit_id = bolagio_units.id and i.enabled)), 'no bookable unit lacks an enabled provider mapping');
end $$;

\echo ''
\echo '── Operational snapshot (informational) ────────────────────────────────'
select * from bolagio_ops_queues order by 1,2;
select job, ok, finished_at, error from bolagio_scheduler_status order by job;
select count(*) as attention_rows, min(severity) as worst_severity from bolagio_ops_attention;
\echo '════════ verification passed ════════'
