-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — SHARED-PROJECT POST-MIGRATION VERIFICATION. Read-only.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_verify.sql
--
-- Every check raises on failure, so a non-zero exit is a failed verification.
-- It does not write. It does not call any provider. It creates one helper
-- function in pg_temp (session-local, gone at disconnect).
--
-- Contains every assertion of supabase/ops/verify.sql PLUS the invariants
-- that matter because the project is shared with unrelated (Cogniiq) tables:
--
--   §A  every bolagio_* table: RLS on, no anon/authenticated privilege, and
--       NO policy — except policies whose role list is exactly {bolagio_app}
--       (the optional narrower-access role from supabase/ops/bolagio_app_role.sql)
--   §B  every bolagio_* view: no anon/authenticated privilege
--   §C  every bolagio_* function that can touch data (not a trigger function,
--       not IMMUTABLE): EXECUTE revoked from anon and authenticated, granted
--       to service_role. The three IMMUTABLE predicates and the two trigger
--       functions keep Postgres' PUBLIC default; they read no table and
--       PostgREST cannot call a trigger function. They are printed, not failed.
--   §D  no bolagio_* object outside schema public; no bolagio_ sequence or
--       foreign table (none is expected)
--   §E  bolagio_app, if present: NOLOGIN, not BYPASSRLS, not superuser, and
--       holds no privilege on any non-bolagio table
--
-- What this file deliberately does NOT assert: that no unrelated table
-- changed. A catalog snapshot cannot cross sessions from pg_temp, and a real
-- snapshot table would itself be a change to the shared project. Instead:
--
--   psql "$DATABASE_URL" -f supabase/ops/shared_project_inventory.sql > before.txt   # before migrating
--   psql "$DATABASE_URL" -f supabase/ops/shared_project_inventory.sql > after.txt    # after this verify
--   diff before.txt after.txt          # every changed line must be a bolagio_* object
--
-- The diff IS the blast-radius proof; keep both files with the change record.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.v_assert(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'VERIFY FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

set client_min_messages = notice;

\echo ''
\echo '── verify.sql assertions (schema, functions, semantics, data integrity) ──'
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
  perform pg_temp.v_assert(to_regprocedure('bolagio_sync_turnovers(integer,timestamptz)') is not null, 'bolagio_sync_turnovers has the clock parameter');
  perform pg_temp.v_assert(to_regprocedure('bolagio_emit_guest_events(integer,integer,integer,timestamptz)') is not null, 'bolagio_emit_guest_events has the clock parameter');
  -- Platform completion (2026-09-21)
  perform pg_temp.v_assert(to_regclass('public.bolagio_message_deliveries') is not null, 'bolagio_message_deliveries exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_turnover_events') is not null, 'bolagio_turnover_events exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_integration_health') is not null, 'bolagio_integration_health exists');
  perform pg_temp.v_assert(to_regclass('public.bolagio_invoice_sequences') is not null, 'bolagio_invoice_sequences exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_booking_intents' and column_name='refund_state'), 'bolagio_booking_intents.refund_state exists');
  perform pg_temp.v_assert(exists (select 1 from information_schema.columns where table_name='bolagio_units' and column_name='prearrival_days'), 'bolagio_units.prearrival_days exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null, 'bolagio_request_cancellation exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)') is not null, 'bolagio_record_refund_outcome exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)') is not null, 'bolagio_begin_message_delivery exists');
  perform pg_temp.v_assert(to_regprocedure('bolagio_set_turnover_status(uuid,text,text,text)') is not null, 'bolagio_set_turnover_status exists');
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_refund_completed_evidence'), 'refund_completed requires provider evidence (constraint present)');
  perform pg_temp.v_assert(exists (select 1 from pg_constraint where conname='bolagio_refund_requires_authorization'), 'a refund requires an authorised cancellation (constraint present)');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where refund_state = 'completed' and (refund_id is null or refunded_amount_cents <= 0)), 'no completed refund without evidence');
  perform pg_temp.v_assert(not exists (
    select 1 from bolagio_booking_intents where status in ('releasing','released','cancelled')
      and payment_status in ('paid','partially_refunded','disputed') and cancellation_authorized_by is null
      and cancellation_requested_at is not null), 'no released paid booking without an authorised cancellation');
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
  -- (RLS / policy / grant posture is asserted per table in the shared-project section below)
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
\echo '── §A–§E shared-project invariants ─────────────────────────────────────'
do $$
declare r record; n int; bad text;
        has_app boolean := exists (select 1 from pg_roles where rolname = 'bolagio_app');
begin
  -- §A every bolagio_ table: RLS on, no browser privilege, policies only for {bolagio_app}
  n := 0;
  for r in
    select c.oid, c.relname, c.relrowsecurity as rls,
           (select string_agg(g.grantee || ':' || g.privilege_type, ',' order by 1) from information_schema.role_table_grants g
             where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser,
           (select string_agg(p.polname || ' for ' || array_to_string(array(select b.rolname from pg_roles b where b.oid = any(p.polroles)), ','), '; ')
              from pg_policy p where p.polrelid = c.oid
               and not (array(select b.rolname from pg_roles b where b.oid = any(p.polroles)) = array['bolagio_app'::name])) as foreign_policies,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'bolagio\_%'
    order by c.relname
  loop
    n := n + 1;
    perform pg_temp.v_assert(r.rls, format('%s: RLS enabled', r.relname));
    perform pg_temp.v_assert(r.browser is null, format('%s: anon/authenticated hold no privilege (found: %s)', r.relname, coalesce(r.browser, '—')));
    perform pg_temp.v_assert(r.foreign_policies is null,
      format('%s: no policy except for role bolagio_app (found: %s)', r.relname, coalesce(r.foreign_policies, '—')));
    if r.policies > 0 then
      perform pg_temp.v_assert(has_app, format('%s: bolagio_app policies exist only when the role exists', r.relname));
    end if;
  end loop;
  perform pg_temp.v_assert(n >= 19, format('%s bolagio_ tables verified (expected at least 19)', n));

  -- §B every bolagio_ view: no browser privilege
  select string_agg(g.table_name || ' → ' || g.grantee, ', ') into bad
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = g.table_schema
   where g.table_schema = 'public' and c.relkind in ('v','m') and g.table_name like 'bolagio\_%' and g.grantee in ('anon','authenticated');
  perform pg_temp.v_assert(bad is null, format('anon/authenticated hold no privilege on any bolagio_ view (found: %s)', coalesce(bad, '—')));

  -- §C every data-touching bolagio_ function: not executable by anon/authenticated, executable by service_role
  n := 0;
  for r in
    select p.oid, p.oid::regprocedure::text as sig, p.provolatile, (p.prorettype = 'trigger'::regtype) as is_trigger
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'bolagio\_%' and p.prokind = 'f'
    order by 2
  loop
    if r.is_trigger then
      raise notice 'info — %: trigger function (PostgREST cannot call it; PUBLIC default execute is inert)', r.sig;
      continue;
    end if;
    if r.provolatile = 'i' then
      raise notice 'info — %: IMMUTABLE predicate, no table access; anon execute = %', r.sig, has_function_privilege('anon', r.oid, 'execute');
      perform pg_temp.v_assert(has_function_privilege('service_role', r.oid, 'execute'), format('%s: service_role can execute', r.sig));
      continue;
    end if;
    n := n + 1;
    perform pg_temp.v_assert(not has_function_privilege('anon', r.oid, 'execute'), format('%s: anon cannot execute', r.sig));
    perform pg_temp.v_assert(not has_function_privilege('authenticated', r.oid, 'execute'), format('%s: authenticated cannot execute', r.sig));
    perform pg_temp.v_assert(has_function_privilege('service_role', r.oid, 'execute'), format('%s: service_role can execute', r.sig));
  end loop;
  perform pg_temp.v_assert(n >= 30, format('%s data-touching bolagio_ functions verified (expected at least 30)', n));

  -- §D nothing bolagio_ outside public; no bolagio_ sequence / foreign table
  select string_agg(ns.nspname || '.' || c.relname, ', ') into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where c.relname like 'bolagio\_%' and c.relkind in ('r','p','v','m','S','f') and ns.nspname <> 'public'
     and ns.nspname not in ('pg_catalog','information_schema','pg_toast');
  perform pg_temp.v_assert(bad is null, format('no bolagio_ relation outside schema public (found: %s)', coalesce(bad, '—')));
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname like 'bolagio\_%' and c.relkind in ('S','f');
  perform pg_temp.v_assert(bad is null, format('no bolagio_ sequence or foreign table (found: %s)', coalesce(bad, '—')));
  select string_agg(ns.nspname || '.' || p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where p.proname like 'bolagio\_%' and ns.nspname <> 'public';
  perform pg_temp.v_assert(bad is null, format('no bolagio_ function outside schema public (found: %s)', coalesce(bad, '—')));

  -- §E bolagio_app, when installed
  if has_app then
    perform pg_temp.v_assert(not exists (select 1 from pg_roles where rolname = 'bolagio_app' and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)),
      'bolagio_app is NOLOGIN, not BYPASSRLS, not superuser, cannot create roles or databases');
    select string_agg(g.table_name || ':' || g.privilege_type, ', ') into bad
      from information_schema.role_table_grants g
     where g.grantee = 'bolagio_app' and not (g.table_schema = 'public' and g.table_name like 'bolagio\_%');
    perform pg_temp.v_assert(bad is null, format('bolagio_app holds no privilege on any non-bolagio table (found: %s)', coalesce(bad, '—')));
    select string_agg(p.oid::regprocedure::text, ', ') into bad
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname not in ('pg_catalog','information_schema') and not (ns.nspname = 'public' and p.proname like 'bolagio\_%')
       and has_function_privilege('bolagio_app', p.oid, 'execute')
       and not has_function_privilege('anon', p.oid, 'execute'); -- PUBLIC-default executes are not a grant to bolagio_app
    perform pg_temp.v_assert(bad is null, format('bolagio_app holds no explicit EXECUTE on any non-bolagio function (found: %s)', coalesce(bad, '—')));
    for r in
      select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'bolagio\_%'
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid
                          and array(select b.rolname from pg_roles b where b.oid = any(p.polroles)) = array['bolagio_app'::name])
    loop
      raise notice 'warn — %: bolagio_app has no policy here; the role would read nothing from it (re-run supabase/ops/bolagio_app_role.sql after a migration that adds tables)', r.relname;
    end loop;
    raise notice 'ok — bolagio_app is installed; the application key may be a bolagio_app JWT (docs/supabase-shared-project.md)';
  else
    perform pg_temp.v_assert(not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'bolagio\_%'),
      'no policy on any bolagio_ table (bolagio_app not installed)');
    raise notice 'info — bolagio_app not installed; the application uses the service-role key';
  end if;
end $$;

\echo ''
\echo '── Operational snapshot (informational) ────────────────────────────────'
select * from bolagio_ops_queues order by 1,2;
select job, ok, finished_at, error from bolagio_scheduler_status order by job;
select count(*) as attention_rows, min(severity) as worst_severity from bolagio_ops_attention;
\echo ''
\echo 'Now run supabase/ops/shared_project_inventory.sql again and diff it against the pre-migration copy.'
\echo '════════ shared-project verification passed ════════'
