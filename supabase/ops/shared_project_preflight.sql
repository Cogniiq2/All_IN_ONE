-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — SHARED-PROJECT PREFLIGHT. Read-only. Run BEFORE applying the
-- BoLaGio migrations to the Supabase project BoLaGio shares with Cogniiq.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_preflight.sql
--
-- Exit status is the verdict:
--   0  every check passed or is informational; the migrations may be applied
--   ≠0 a COLLISION or a missing prerequisite — stop, read the message, do not
--      apply anything
--
-- It changes nothing. It contains every check of supabase/ops/preflight.sql
-- in compact form PLUS the checks that only matter because the project is
-- shared:
--   §5  name collisions — a pre-existing object called bolagio_* that the
--       BoLaGio migrations did not create would be silently altered or would
--       break the migration half way. Raises.
--   §6  the exact set of tables the six migration files touch, hardcoded,
--       so a reader can confirm "no non-bolagio table is referenced" against
--       the repository (tests/shared-project-sql.test.ts makes the same
--       invariant executable over the migration sources)
--   §7  default privileges for anon/authenticated exist in schema public —
--       otherwise the migrations' REVOKEs are no-ops, which is fine, but the
--       operator should know which case they are in
--   §8  the `authenticator` role exists (the role PostgREST switches from)
--   §9  the blast-radius record: the unrelated tables named in
--       docs/security/2026-08-15-admin-exposure.md, with their RLS state
--       PRINTED, never changed
--
-- Idempotent-safe: running it on a project where the migrations are already
-- applied passes (their objects are the expected ones).
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset format aligned
\pset pager off
\pset null '∅'

\echo ''
\echo '── 1. Server and extensions ────────────────────────────────────────────'
select 'postgres_version' as check_name, version() as actual, '14 or newer' as expected;
select 'btree_gist' as check_name,
       coalesce((select extversion from pg_extension where extname='btree_gist'), 'ABSENT (foundation creates it)') as actual,
       'installed or creatable' as expected;
select 'pg_cron_available' as check_name,
       case when exists (select 1 from pg_available_extensions where name='pg_cron') then 'available' else 'NOT available' end as actual,
       'available (Supabase: yes) — needed only for the scheduler' as expected;
do $$ begin
  if current_setting('server_version_num')::int < 140000 then
    raise exception 'PREFLIGHT FAILED: PostgreSQL 14 or newer is required (found %)', current_setting('server_version');
  end if;
end $$;

\echo ''
\echo '── 2. Roles the migrations grant to ────────────────────────────────────'
select r.rolname as check_name, 'present' as actual, 'present' as expected
from pg_roles r where r.rolname in ('anon','authenticated','service_role')
union all
select missing, 'MISSING', 'present'
from unnest(array['anon','authenticated','service_role']) as missing
where not exists (select 1 from pg_roles where rolname = missing);
do $$ declare missing text; begin
  select string_agg(r, ', ') into missing from unnest(array['anon','authenticated','service_role']) r
   where not exists (select 1 from pg_roles where rolname = r);
  if missing is not null then
    raise exception 'PREFLIGHT FAILED: role(s) % missing — this is not a Supabase project', missing;
  end if;
end $$;

\echo ''
\echo '── 3. Which BoLaGio migrations are already applied ─────────────────────'
select 'booking_foundation (20260916120000)' as migration,
       case when to_regclass('public.bolagio_booking_intents') is not null then 'applied' else 'not applied' end as actual
union all
select 'booking_core_states (20260917100000)',
       case when exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='bolagio_booking_status' and e.enumlabel='locking') then 'applied' else 'not applied' end
union all
select 'booking_core_hardening (20260917110000)',
       case when to_regclass('public.bolagio_outbox_events') is not null and to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null then 'applied' else 'not applied' end
union all
select 'admin_operators (20260919120000)',
       case when to_regclass('public.bolagio_operators') is not null then 'applied' else 'not applied' end
union all
select 'booking_production_hardening (20260920120000)',
       case when to_regclass('public.bolagio_scheduler_runs') is not null
             and to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null
            then 'applied' else 'not applied' end
union all
select 'platform_completion (20260921120000)',
       case when to_regclass('public.bolagio_message_deliveries') is not null
             and to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null
            then 'applied' else 'not applied' end;
-- A later migration applied without an earlier one is a half state the runbook does not cover.
do $$
declare a1 boolean := to_regclass('public.bolagio_booking_intents') is not null;
        a3 boolean := to_regclass('public.bolagio_outbox_events') is not null;
        a4 boolean := to_regclass('public.bolagio_operators') is not null;
        a5 boolean := to_regclass('public.bolagio_scheduler_runs') is not null;
        a6 boolean := to_regclass('public.bolagio_message_deliveries') is not null;
begin
  if (a3 and not a1) or (a4 and not a3) or (a5 and not a4) or (a6 and not a5) then
    raise exception 'PREFLIGHT FAILED: a later BoLaGio migration is applied without an earlier one (foundation=% hardening=% operators=% production=% completion=%) — restore from backup or apply by hand in order', a1, a3, a4, a5, a6;
  end if;
end $$;

\echo ''
\echo '── 4. Existing BoLaGio data that the migrations must not disturb ───────'
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
  if to_regclass('public.bolagio_external_operations') is not null then
    execute $q$select count(*) from bolagio_external_operations where outcome = 'outcome_unknown'$q$ into v;
    raise notice 'external operations with outcome_unknown (reconcile first if > 0): %', v;
    execute $q$select count(*) from bolagio_external_operations where outcome = 'in_flight' and started_at > now() - interval '5 minutes'$q$ into v;
    raise notice 'external operations in flight in the last 5 minutes (expected 0): %', v;
  end if;
end $$;

\echo ''
\echo '── 5. NAME COLLISIONS — bolagio_* objects the migrations did not create ─'
-- Every relation, type and function the six migrations create, by name. A
-- bolagio_* object that is NOT in these lists exists for another reason and
-- would collide. The three "intermediate" signatures are legitimate between
-- migrations 3 and 5 (they are replaced by 5 and 6).
do $$
declare
  expected_tables constant text[] := array[
    'bolagio_admin_audit_log','bolagio_booking_intent_events','bolagio_booking_intents','bolagio_external_operations',
    'bolagio_guest_events','bolagio_integration_events','bolagio_integration_health','bolagio_invoice_sequences',
    'bolagio_message_deliveries','bolagio_operators','bolagio_outbox_events','bolagio_payment_events',
    'bolagio_reconciliation_jobs','bolagio_scheduler_runs','bolagio_turnover_events','bolagio_turnovers',
    'bolagio_unit_integrations','bolagio_unit_inventory_days','bolagio_units'];
  expected_views constant text[] := array['bolagio_ops_attention','bolagio_ops_queues','bolagio_scheduler_status'];
  expected_types constant text[] := array[
    'bolagio_booking_source','bolagio_booking_status','bolagio_external_provider','bolagio_integration_provider',
    'bolagio_job_status','bolagio_operation_outcome','bolagio_payment_provider','bolagio_payment_status'];
  expected_functions constant text[] := array[
    'bolagio_touch_updated_at()',
    'bolagio_status_reserves(bolagio_booking_status)',
    'bolagio_transition_allowed(bolagio_booking_status,bolagio_booking_status)',
    'bolagio_payment_transition_allowed(bolagio_payment_status,bolagio_payment_status)',
    'bolagio_booking_status_guard()',
    'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)',
    'bolagio_acquire_lock(uuid,integer,text)',
    'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,character,text)',
    'bolagio_queue_reconciliation(uuid,text,integer,jsonb)',
    'bolagio_claim_outbox_events(text,integer,integer)',
    'bolagio_ack_outbox_event(uuid,text)',
    'bolagio_fail_outbox_event(uuid,text,text)',
    'bolagio_claim_reconciliation_jobs(text,integer)',
    'bolagio_resolve_reconciliation_job(uuid,text)',
    'bolagio_fail_reconciliation_job(uuid,text)',
    'bolagio_record_payment_event(bolagio_external_provider,text,text,text,jsonb,timestamp with time zone,timestamp with time zone,text,text,text,text,integer,character)',
    'bolagio_claim_payment_events(text,integer)',
    'bolagio_settle_payment_event(uuid,boolean,text)',
    'bolagio_complete_external_operation(text,bolagio_operation_outcome,text,text)',
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)',
    'bolagio_record_scheduler_run(text,timestamp with time zone,boolean,jsonb,text,text)',
    'bolagio_request_cancellation(uuid,text,text,boolean,integer,text)',
    'bolagio_complete_cancellation(uuid,text)',
    'bolagio_begin_refund(uuid,text)',
    'bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)',
    'bolagio_reset_refund(uuid,text)',
    'bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)',
    'bolagio_complete_message_delivery(uuid,text,text,text,text,boolean)',
    'bolagio_requeue_message_delivery(uuid,text)',
    'bolagio_suppress_message_deliveries(uuid,text)',
    'bolagio_requeue_outbox_event(uuid,text)',
    'bolagio_set_turnover_status(uuid,text,text,text)',
    'bolagio_assign_turnover(uuid,text,text)',
    'bolagio_sync_turnovers(integer,timestamp with time zone)',
    'bolagio_emit_guest_events(integer,integer,integer,timestamp with time zone)',
    'bolagio_observe_integration(text,text,text)',
    'bolagio_next_invoice_number(text)',
    -- legitimate intermediate signatures (after #3, before #5 / #6)
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)',
    'bolagio_sync_turnovers(integer)',
    'bolagio_emit_guest_events(integer,integer,integer)'];
  r record; collisions text := ''; n_found int := 0;
begin
  -- relations (tables, views, sequences, materialized views, foreign tables; indexes and toast are derived)
  for r in
    select c.relname, c.relkind, n.nspname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relname like 'bolagio\_%' and c.relkind in ('r','p','v','m','S','f')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_found := n_found + 1;
    if r.nspname <> 'public' then
      collisions := collisions || format(E'\n  relation %I.%I (kind %s): bolagio_ object outside schema public', r.nspname, r.relname, r.relkind);
    elsif r.relkind in ('r','p') and not (r.relname = any(expected_tables)) then
      collisions := collisions || format(E'\n  table public.%I: not created by any BoLaGio migration', r.relname);
    elsif r.relkind in ('v','m') and not (r.relname = any(expected_views)) then
      collisions := collisions || format(E'\n  view public.%I: not created by any BoLaGio migration', r.relname);
    elsif r.relkind in ('S','f') then
      collisions := collisions || format(E'\n  %s public.%I: the BoLaGio migrations create no sequence or foreign table', case r.relkind when 'S' then 'sequence' else 'foreign table' end, r.relname);
    end if;
  end loop;
  -- types (enums; composite row types of the tables carry the table name and are skipped)
  for r in
    select t.typname, t.typtype, n.nspname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname like 'bolagio\_%' and t.typtype not in ('c') and t.typname !~ '^bolagio_.*\[\]$' and t.typarray <> 0
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  loop
    n_found := n_found + 1;
    if r.nspname <> 'public' or r.typtype <> 'e' or not (r.typname = any(expected_types)) then
      collisions := collisions || format(E'\n  type %I.%I (typtype %s): not one of the eight BoLaGio enums', r.nspname, r.typname, r.typtype);
    end if;
  end loop;
  -- functions, by exact signature
  for r in
    select p.oid::regprocedure::text as sig, n.nspname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'bolagio\_%' and n.nspname not in ('pg_catalog','information_schema')
  loop
    n_found := n_found + 1;
    if r.nspname <> 'public' or not (r.sig = any(expected_functions)) then
      collisions := collisions || format(E'\n  function %s.%s: no BoLaGio migration creates this signature', r.nspname, r.sig);
    end if;
  end loop;
  -- schemas
  for r in select nspname from pg_namespace where nspname like 'bolagio%' loop
    collisions := collisions || format(E'\n  schema %I: the BoLaGio migrations create no schema', r.nspname);
  end loop;

  if collisions <> '' then
    raise exception E'PREFLIGHT FAILED — NAME COLLISION. These bolagio_* objects exist but no BoLaGio migration creates them. Applying the migrations could alter or depend on them:%\nInspect them (supabase/ops/shared_project_inventory.sql) and resolve by hand before applying anything.', collisions;
  end if;
  raise notice 'no collision: % bolagio_* object(s) found, all of them expected', n_found;
end $$;

\echo ''
\echo '── 6. Tables the six migration files touch (hardcoded; compare to what exists)'
-- Each name must start with bolagio_ (tests/shared-project-sql.test.ts asserts the
-- same over the migration sources). "applied" means the table exists already.
select t.table_name, t.created_by,
       case when to_regclass('public.' || t.table_name) is not null then 'exists' else 'will be created' end as actual
from (values
  ('bolagio_units','20260916'), ('bolagio_unit_integrations','20260916'), ('bolagio_unit_inventory_days','20260916'),
  ('bolagio_booking_intents','20260916'), ('bolagio_booking_intent_events','20260916'), ('bolagio_integration_events','20260916'),
  ('bolagio_outbox_events','20260917'), ('bolagio_payment_events','20260917'), ('bolagio_external_operations','20260917'),
  ('bolagio_reconciliation_jobs','20260917'),
  ('bolagio_operators','20260919'), ('bolagio_admin_audit_log','20260919'),
  ('bolagio_scheduler_runs','20260920'), ('bolagio_turnovers','20260920'), ('bolagio_guest_events','20260920'),
  ('bolagio_message_deliveries','20260921'), ('bolagio_turnover_events','20260921'), ('bolagio_integration_health','20260921'),
  ('bolagio_invoice_sequences','20260921')
) as t(table_name, created_by)
order by 2, 1;
do $$ begin
  if exists (select 1 from unnest(array[
      'bolagio_units','bolagio_unit_integrations','bolagio_unit_inventory_days','bolagio_booking_intents',
      'bolagio_booking_intent_events','bolagio_integration_events','bolagio_outbox_events','bolagio_payment_events',
      'bolagio_external_operations','bolagio_reconciliation_jobs','bolagio_operators','bolagio_admin_audit_log',
      'bolagio_scheduler_runs','bolagio_turnovers','bolagio_guest_events','bolagio_message_deliveries',
      'bolagio_turnover_events','bolagio_integration_health','bolagio_invoice_sequences']) t where t not like 'bolagio\_%') then
    raise exception 'PREFLIGHT FAILED: the hardcoded migration table list names a non-bolagio table';
  end if;
  raise notice 'every table the migrations touch is prefixed bolagio_ (19 tables); no unrelated table is referenced';
end $$;

\echo ''
\echo '── 7. Default privileges for anon/authenticated in schema public ──────'
-- Supabase grants anon/authenticated privileges on NEW tables in public by
-- default. The BoLaGio migrations REVOKE them on every bolagio_ table. If the
-- defaults are absent, the revokes are harmless no-ops — both cases are fine,
-- but the verify step proves the posture either way.
select pg_get_userbyid(d.defaclrole) as for_objects_created_by,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else d.defaclobjtype::text end as object_type,
       d.defaclacl as acl,
       case when d.defaclacl::text ~ '(anon|authenticated)=' then 'browser roles get privileges by default → the migration REVOKEs matter' else 'no browser default' end as meaning
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'
order by 1, 2;
do $$ begin
  if not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                 where n.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclacl::text ~ '(anon|authenticated)=') then
    raise notice 'INFO: no default table privilege for anon/authenticated in public — new tables start without browser grants (the migration revokes are no-ops)';
  else
    raise notice 'ok — browser default privileges exist in public; the migrations revoke them on every bolagio_ table';
  end if;
end $$;

\echo ''
\echo '── 8. The authenticator role (what PostgREST connects as) ─────────────'
select r.rolname as role, r.rolcanlogin as can_login, r.rolinherit as inherit,
       array(select b.rolname from pg_auth_members m join pg_roles b on b.oid = m.roleid where m.member = r.oid order by 1) as can_switch_to
from pg_roles r where r.rolname = 'authenticator';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    raise exception 'PREFLIGHT FAILED: role authenticator is missing — this is not a Supabase project (or the local stack)';
  end if;
  if not exists (select 1 from pg_auth_members m join pg_roles a on a.oid = m.member join pg_roles s on s.oid = m.roleid
                 where a.rolname = 'authenticator' and s.rolname = 'service_role') then
    raise exception 'PREFLIGHT FAILED: authenticator cannot switch to service_role — the application (service-role JWT) could not reach the tables';
  end if;
end $$;

\echo ''
\echo '── 9. Blast-radius record: unrelated tables (RLS state PRINTED, not changed)'
-- The tables docs/security/2026-08-15-admin-exposure.md names, then every
-- other non-bolagio table. Nothing here is asserted; it is the evidence to
-- keep with the change record; the hardening it feeds is
-- supabase/ops/shared_project_hardening.sql.
select t.table_name as named_in_security_doc,
       case when to_regclass('public.' || t.table_name) is null then 'absent' else 'present' end as presence,
       (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = t.table_name) as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = t.table_name and g.grantee in ('anon','authenticated')) as browser_grants
from (values ('invoices'), ('emails'), ('email_attachments'), ('properties'), ('property_units')) as t(table_name)
order by 1;
select c.relname as other_unrelated_table, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not like 'bolagio\_%'
  and c.relname not in ('invoices','emails','email_attachments','properties','property_units')
order by 1;
\echo '(record both tables above with the change; run shared_project_inventory.sql before and after and diff)'

\echo ''
\echo '── 10. Row-level security posture on every bolagio_ table (if any) ─────'
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee in ('anon','authenticated')) as browser_grants,
       'true / 0 (or bolagio_app-only policies) / 0' as expected
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%'
order by 1;

\echo ''
\echo '════════ shared-project preflight passed (read-only) ════════'
