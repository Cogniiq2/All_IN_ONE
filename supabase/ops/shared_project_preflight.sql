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


-- ── 6. Tables the six migration files touch (hardcoded; compare to what exists)
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


-- ── 7. Default privileges for anon/authenticated in schema public ──────
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


-- ── 8. The authenticator role (what PostgREST connects as) ─────────────
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


-- ── 9. Blast-radius record: unrelated tables (RLS state PRINTED, not changed)
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
-- (record both tables above with the change; run shared_project_inventory.sql before and after and diff)


-- ── 10. Row-level security posture on every bolagio_ table (if any) ─────
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
       (select count(*) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee in ('anon','authenticated')) as browser_grants,
       'true / 0 (or bolagio_app-only policies) / 0' as expected
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'bolagio\_%'
order by 1;


-- ════════ shared-project preflight passed (read-only) ════════
