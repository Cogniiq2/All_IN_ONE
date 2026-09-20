-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — migration PREFLIGHT. Read-only. Run BEFORE applying anything.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/preflight.sql
--
-- Prints one row per check with an expected value, so the person applying
-- the migrations can compare before touching production. It changes nothing.
-- See docs/supabase-migration-runbook.md for what each answer means.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset format aligned

\echo ''
\echo '── 1. Server and extensions ────────────────────────────────────────────'
select 'postgres_version' as check_name, version() as actual, '14 or newer' as expected;
select 'btree_gist' as check_name,
       coalesce((select extversion from pg_extension where extname='btree_gist'), 'ABSENT (foundation creates it)') as actual,
       'installed or creatable' as expected;
select 'pg_cron_available' as check_name,
       case when exists (select 1 from pg_available_extensions where name='pg_cron') then 'available' else 'NOT available' end as actual,
       'available (Supabase: yes) — needed only for the recommended scheduler' as expected;

\echo ''
\echo '── 2. Roles the migrations grant to ────────────────────────────────────'
select r.rolname as check_name, 'present' as actual, 'present' as expected
from pg_roles r where r.rolname in ('anon','authenticated','service_role')
union all
select missing, 'MISSING', 'present'
from unnest(array['anon','authenticated','service_role']) as missing
where not exists (select 1 from pg_roles where rolname = missing);

\echo ''
\echo '── 3. Which BoLaGio migrations are already applied ─────────────────────'
select 'booking_foundation (20260916120000)' as migration,
       case when to_regclass('public.bolagio_booking_intents') is not null then 'applied' else 'not applied' end as actual;
select 'booking_core_states (20260917100000)' as migration,
       case when exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='bolagio_booking_status' and e.enumlabel='locking') then 'applied' else 'not applied' end as actual;
select 'booking_core_hardening (20260917110000)' as migration,
       case when to_regclass('public.bolagio_outbox_events') is not null and to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null then 'applied' else 'not applied' end as actual;
select 'admin_operators (20260919120000)' as migration,
       case when to_regclass('public.bolagio_operators') is not null then 'applied' else 'not applied' end as actual;
select 'booking_production_hardening (20260920120000)' as migration,
       case when to_regclass('public.bolagio_scheduler_runs') is not null
             and to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null
            then 'applied' else 'not applied' end as actual;
select 'platform_completion (20260921120000)' as migration,
       case when to_regclass('public.bolagio_message_deliveries') is not null
             and to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null
            then 'applied' else 'not applied' end as actual;

select 'finance_foundation (20260922120000)' as migration,
       case when to_regclass('public.bolagio_finance_transactions') is not null and to_regprocedure('bolagio_finance_post_transaction(jsonb,jsonb,text)') is not null then 'applied' else 'not applied' end as actual;

\echo ''
\echo '── 4. Supabase migration history (if the CLI has been used) ────────────'
do $$
declare r record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'supabase_migrations.schema_migrations: absent (migrations applied by hand, or never)';
    return;
  end if;
  for r in execute 'select version, name from supabase_migrations.schema_migrations order by version' loop
    raise notice 'applied by CLI: % %', r.version, coalesce(r.name, '');
  end loop;
end $$;

\echo ''
\echo '── 5. Existing data that the migrations must not disturb ───────────────'
do $$
declare v bigint; t text;
begin
  foreach t in array array['bolagio_units','bolagio_unit_integrations','bolagio_booking_intents',
                           'bolagio_external_operations','bolagio_payment_events','bolagio_outbox_events'] loop
    if to_regclass('public.' || t) is null then
      raise notice '%: table absent', t;
    else
      execute format('select count(*) from %I', t) into v;
      raise notice '%: % rows', t, v;
    end if;
  end loop;
  if to_regclass('public.bolagio_booking_intents') is not null
     and to_regprocedure('bolagio_status_reserves(bolagio_booking_status)') is not null then
    execute 'select count(*) from bolagio_booking_intents where bolagio_status_reserves(status)' into v;
    raise notice 'bolagio_booking_intents reserving inventory right now: %', v;
  end if;
  if to_regclass('public.bolagio_external_operations') is not null then
    execute $q$select count(*) from bolagio_external_operations where outcome = 'outcome_unknown'$q$ into v;
    raise notice 'bolagio_external_operations with outcome_unknown (must be reconciled, never retried): %', v;
    execute $q$select count(*) from bolagio_external_operations where outcome = 'in_flight' and started_at > now() - interval '5 minutes'$q$ into v;
    raise notice 'external operations in flight in the last 5 minutes (expected 0 — apply in a quiet minute): %', v;
  end if;
end $$;

\echo ''
\echo '── 6. Objects the production-hardening migration REPLACES ──────────────'
select 'bolagio_begin_external_operation (old 5-arg signature)' as check_name,
       case when to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)') is not null then 'present — will be dropped and recreated with 6 args' else 'absent' end as actual;
select 'bolagio_booking_intents_hold_idx' as check_name,
       coalesce((select indexdef from pg_indexes where indexname='bolagio_booking_intents_hold_idx'), 'absent') as actual,
       'recreated with the wider predicate' as expected;

\echo ''
\echo '── 7. Row-level security posture on every bolagio_ table ───────────────'
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       'true / 0' as expected
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%'
order by 1;

\echo ''
\echo '── 8. Browser roles must hold NO privilege on bolagio_ tables ───────────'
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name like 'bolagio\_%' and grantee in ('anon','authenticated')
order by 1,2;
\echo '(expected: zero rows above)'

\echo ''
\echo '── 9. Unrelated tables in the same project (blast-radius record) ────────'
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname not like 'bolagio\_%'
order by 1;
\echo '(every row here is a table BoLaGio does not own but shares a database with — see docs/supabase-migration-runbook.md §6)'
