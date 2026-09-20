-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — SHARED-PROJECT INVENTORY. Read-only. Changes nothing.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_inventory.sql \
--        > inventory-$(date +%Y%m%d-%H%M).txt
--
-- BoLaGio shares one Supabase project with unrelated (Cogniiq) tables. This
-- script prints what is in the WHOLE project — every schema, table, policy,
-- grant, function, view, storage policy, auth dependency, extension and cron
-- job — split into what BoLaGio owns (`bolagio_*`) and what it does not, and
-- ends with a RISK REPORT: one row per finding, with a severity and the
-- action that would close it.
--
-- Run it BEFORE the BoLaGio migrations and AFTER, and `diff` the two files:
-- any line that changed outside the `bolagio_*` objects is a finding in itself.
-- See docs/supabase-shared-project.md.
--
-- Guarantees:
--   * only SELECT, \echo and \pset; no DDL, no DML, no settings changed
--   * runs on a fresh project (no bolagio_ tables), on the local test stack
--     and on a project without the storage or cron schemas (guarded)
--   * prints no secret and no row data — catalog metadata only
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
-- -v format=unaligned gives a diff-stable layout (no column re-padding); default is aligned
\if :{?format}
\else
  \set format aligned
\endif
\pset format :format
\pset pager off
\pset null '∅'

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' BoLaGio shared-project inventory'
\echo '════════════════════════════════════════════════════════════════════════'
select now() as generated_at, current_database() as database, current_user as run_as, version() as server;

\echo ''
\echo '── 1. Schemas ──────────────────────────────────────────────────────────'
select n.nspname as schema, pg_get_userbyid(n.nspowner) as owner,
       (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind in ('r','p')) as tables,
       (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind in ('v','m')) as views,
       (select count(*) from pg_proc p where p.pronamespace = n.oid) as functions
from pg_namespace n
where n.nspname not like 'pg\_%' and n.nspname <> 'information_schema'
order by 1;

\echo ''
\echo '── 2a. BoLaGio tables (public.bolagio_*) ───────────────────────────────'
select n.nspname as schema, c.relname as table_name, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       case when c.reltuples < 0 then null else c.reltuples::bigint end as row_estimate,
       (select count(*) from information_schema.role_table_grants g
         where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname = 'public' and c.relname like 'bolagio\_%'
order by 2;
\echo '(a fresh project prints zero rows here — the migrations have not been applied yet)'

\echo ''
\echo '── 2b. UNRELATED tables (everything else, all non-system schemas) ──────'
select n.nspname as schema, c.relname as table_name, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       case when c.reltuples < 0 then null else c.reltuples::bigint end as row_estimate,
       (select count(*) from information_schema.role_table_grants g
         where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p')
  and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  and n.nspname not like 'pg\_%'
  and not (n.nspname = 'public' and c.relname like 'bolagio\_%')
order by 1, 2;
\echo '(every row here is a table BoLaGio does not own but shares a database with)'

\echo ''
\echo '── 3. Policies (all schemas) ───────────────────────────────────────────'
select schemaname as schema, tablename as table_name, policyname as policy, roles, cmd, permissive,
       qual as using_expr, with_check as with_check_expr
from pg_policies
where schemaname not in ('pg_catalog','information_schema')
order by 1, 2, 3;

\echo ''
\echo '── 4a. Table grants to anon / authenticated (all non-system schemas) ───'
select table_schema as schema, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee in ('anon','authenticated')
  and table_schema not in ('pg_catalog','information_schema')
group by 1, 2, 3
order by 1, 2, 3;

\echo ''
\echo '── 4b. Sequence grants to anon / authenticated ─────────────────────────'
select n.nspname as schema, c.relname as sequence_name, r.rolname as grantee,
       string_agg(priv, ',' order by priv) as privileges
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'),('authenticated')) as r(rolname)
cross join lateral (values ('USAGE'),('SELECT'),('UPDATE')) as p(priv)
where c.relkind = 'S'
  and n.nspname not in ('pg_catalog','information_schema')
  and exists (select 1 from pg_roles where rolname = r.rolname)
  and has_sequence_privilege(r.rolname, c.oid, p.priv)
group by 1, 2, 3
order by 1, 2, 3;

\echo ''
\echo '── 4c. Function EXECUTE held by anon / authenticated (non-system schemas)'
select n.nspname as schema, p.oid::regprocedure as function, r.rolname as grantee,
       p.provolatile as volatility, p.prosecdef as security_definer,
       (p.prorettype = 'trigger'::regtype) as trigger_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'),('authenticated')) as r(rolname)
where n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg\_%'
  and exists (select 1 from pg_roles where rolname = r.rolname)
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and has_function_privilege(r.rolname, p.oid, 'execute')
order by 1, 2, 3;
\echo '(Postgres grants EXECUTE to PUBLIC by default; a row here can come from that default, not from an explicit grant)'

\echo ''
\echo '── 4d. Default privileges (what NEW objects get automatically) ─────────'
select pg_get_userbyid(d.defaclrole) as for_objects_created_by,
       coalesce(nsp.nspname, '<all schemas>') as in_schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' else d.defaclobjtype::text end as object_type,
       d.defaclacl as acl
from pg_default_acl d left join pg_namespace nsp on nsp.oid = d.defaclnamespace
order by 1, 2, 3;

\echo ''
\echo '── 5. Functions in non-system schemas (SECURITY DEFINER and search_path)'
select n.nspname as schema, p.oid::regprocedure as function, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer, p.provolatile as volatility,
       l.lanname as language,
       coalesce((select string_agg(cfg, '; ') from unnest(p.proconfig) cfg where cfg like 'search_path=%'), '∅ (not fixed)') as search_path_setting,
       (p.prorettype = 'trigger'::regtype) as trigger_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg\_%'
  and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- not an extension member
order by (n.nspname = 'public' and p.proname like 'bolagio\_%') desc, 1, 2;

\echo ''
\echo '── 6. Views and their security_invoker option ─────────────────────────'
select n.nspname as schema, c.relname as view_name, pg_get_userbyid(c.relowner) as owner,
       coalesce((select (regexp_match(opt, 'security_invoker=(\w+)'))[1] from unnest(c.reloptions) opt where opt like 'security_invoker=%'), 'false (default: runs as owner)') as security_invoker,
       (select count(*) from information_schema.role_table_grants g
         where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v','m')
  and n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg\_%'
order by 1, 2;

\echo ''
\echo '── 7. Storage (buckets and storage.objects policies) ──────────────────'
do $$
declare r record; n int := 0;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (not a Supabase project, or the local stack) — nothing to inventory';
    return;
  end if;
  for r in execute 'select id, name, public, owner from storage.buckets order by id' loop
    n := n + 1;
    raise notice 'bucket % (name=%) public=% owner=%', r.id, r.name, r.public, coalesce(r.owner::text, '∅');
  end loop;
  if n = 0 then raise notice 'no storage buckets'; end if;
end $$;
select schemaname as schema, tablename as table_name, policyname as policy, roles, cmd, permissive, qual as using_expr, with_check as with_check_expr
from pg_policies where schemaname = 'storage' order by 2, 3;
\echo '(zero rows above means no storage policy, or no storage schema)'

\echo ''
\echo '── 8. Auth dependencies in public objects (auth.uid / auth.jwt / auth.users)'
select 'function' as kind, p.oid::regprocedure::text as object,
       string_agg(distinct m[1], ', ') as references
from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
     lateral regexp_matches(coalesce(p.prosrc, ''), '(auth\.uid\(\)|auth\.jwt\(\)|auth\.users|auth\.role\(\))', 'g') as m
where n.nspname = 'public'
group by 1, 2
union all
select 'policy', schemaname || '.' || tablename || ' / ' || policyname,
       string_agg(distinct m[1], ', ')
from pg_policies,
     lateral regexp_matches(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(auth\.uid\(\)|auth\.jwt\(\)|auth\.users|auth\.role\(\))', 'g') as m
where schemaname not in ('pg_catalog','information_schema')
group by 1, 2
union all
select 'view', n.nspname || '.' || c.relname,
       string_agg(distinct m[1], ', ')
from pg_class c join pg_namespace n on n.oid = c.relnamespace,
     lateral regexp_matches(pg_get_viewdef(c.oid), '(auth\.uid\(\)|auth\.jwt\(\)|auth\.users|auth\.role\(\))', 'g') as m
where c.relkind = 'v' and n.nspname = 'public'
group by 1, 2
order by 1, 2;
\echo '(zero rows = nothing in public depends on Supabase Auth; the BoLaGio objects never do)'

\echo ''
\echo '── 9. Extensions ──────────────────────────────────────────────────────'
select e.extname as extension, e.extversion as version, n.nspname as schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
order by 1;

\echo ''
\echo '── 10. pg_cron jobs ───────────────────────────────────────────────────'
do $$
declare r record; n int := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'cron schema absent — pg_cron is not installed here';
    return;
  end if;
  for r in execute 'select jobid, jobname, schedule, active, username, left(command, 120) as command from cron.job order by jobid' loop
    n := n + 1;
    raise notice 'job % name=% schedule=% active=% as=% command=%', r.jobid, coalesce(r.jobname, '∅'), r.schedule, r.active, r.username, r.command;
  end loop;
  if n = 0 then raise notice 'pg_cron installed, no jobs'; end if;
end $$;

\echo ''
\echo '── 11. Roles the application depends on ───────────────────────────────'
select r.rolname as role, r.rolcanlogin as can_login, r.rolbypassrls as bypass_rls, r.rolsuper as superuser,
       array(select b.rolname from pg_auth_members m join pg_roles b on b.oid = m.roleid where m.member = r.oid order by 1) as member_of
from pg_roles r
where r.rolname in ('anon','authenticated','service_role','authenticator','bolagio_app','postgres','supabase_admin')
order by 1;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' RISK REPORT — one row per finding (schema public; storage policies)'
\echo '════════════════════════════════════════════════════════════════════════'
\echo 'Rules:'
\echo '  CRITICAL  table without RLS that anon/authenticated hold any privilege on'
\echo '  CRITICAL  bolagio_* table with any anon/authenticated grant, or with RLS off'
\echo '  HIGH      RLS on but a permissive policy grants anon (or PUBLIC)'
\echo '  HIGH      SECURITY DEFINER function without a fixed search_path'
\echo '  HIGH      anon can EXECUTE a function that mutates (name insert%|update%|delete%|set%|create%, or VOLATILE)'
\echo '  MEDIUM    RLS on, no policy, but anon/authenticated still hold table grants (harmless today; one policy away from exposure)'
\echo '  INFO      anon can EXECUTE a trigger function or an IMMUTABLE/STABLE helper (no data access, cannot be called by PostgREST if trigger)'
\echo '  (functions that belong to an extension, e.g. btree_gist, are excluded from the function rules)'
\echo '  INFO      storage.objects policy for anon/authenticated; unrelated table with browser policy on RLS'
\echo ''
with
tbl as (
  select c.oid, c.relname, c.relrowsecurity as rls,
         (c.relname like 'bolagio\_%') as is_bolagio,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
         (select string_agg(distinct g.grantee, ',') from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')) as browser_grantees
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
findings as (
  -- CRITICAL: no RLS + browser grant (unrelated tables)
  select 'CRITICAL' as severity, 'public.' || relname as object,
         'RLS disabled and ' || browser_grantees || ' hold table privileges — the public anon key reads/writes every row' as finding,
         'enable row level security + revoke all from anon, authenticated (supabase/ops/proposed_unrelated_hardening.sql)' as recommended_action
  from tbl where not rls and browser_grantees is not null and not is_bolagio
  union all
  -- CRITICAL: bolagio_ table with browser grant
  select 'CRITICAL', 'public.' || relname,
         'bolagio_ table with a grant to ' || browser_grantees || ' — the migrations revoke this; something re-granted it',
         'revoke all on ' || relname || ' from anon, authenticated; find the grantor'
  from tbl where is_bolagio and browser_grantees is not null
  union all
  -- CRITICAL: bolagio_ table with RLS off
  select 'CRITICAL', 'public.' || relname,
         'bolagio_ table with RLS disabled — the migrations enable it; something disabled it',
         'alter table ' || relname || ' enable row level security; find who disabled it'
  from tbl where is_bolagio and not rls
  union all
  -- HIGH: RLS on but a permissive policy grants anon / PUBLIC
  select 'HIGH', 'public.' || p.tablename || ' / ' || p.policyname,
         'permissive ' || p.cmd || ' policy for ' || array_to_string(p.roles, ',') || ' using (' || coalesce(p.qual, '—') || ')' ||
           case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end,
         'drop the policy (or restrict it to an authenticated identity predicate) and revoke the anon table grant'
  from pg_policies p
  where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
    and (p.roles @> array['anon'::name] or p.roles = array['public'::name])
  union all
  -- HIGH: SECURITY DEFINER without fixed search_path
  select 'HIGH', 'public.' || p.oid::regprocedure::text,
         'SECURITY DEFINER function without a fixed search_path (owner ' || pg_get_userbyid(p.proowner) || ') — resolvable objects can be hijacked by a caller-controlled schema',
         'alter function ' || p.oid::regprocedure::text || ' set search_path = public, pg_temp'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  union all
  -- HIGH: anon EXECUTE on a mutating, non-trigger function
  select 'HIGH', 'public.' || p.oid::regprocedure::text,
         'anon can EXECUTE a ' || case when p.provolatile = 'v' then 'VOLATILE' else 'mutating-named' end || ' function' ||
           case when p.prosecdef then ' that is SECURITY DEFINER' else '' end,
         'revoke all on function ' || p.oid::regprocedure::text || ' from public, anon, authenticated; grant execute … to service_role'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and p.prorettype <> 'trigger'::regtype
    and exists (select 1 from pg_roles where rolname = 'anon')
    and has_function_privilege('anon', p.oid, 'execute')
    and (p.provolatile = 'v' or p.proname ~ '^(insert|update|delete|set|create)')
  union all
  -- MEDIUM: RLS on, no policy, browser grants still present (unrelated)
  select 'MEDIUM', 'public.' || relname,
         'RLS on with no policy (reads nothing today) but ' || browser_grantees || ' still hold table grants — one careless policy exposes it',
         'revoke all on ' || relname || ' from anon, authenticated'
  from tbl where rls and policies = 0 and browser_grantees is not null and not is_bolagio
  union all
  -- INFO: anon EXECUTE on trigger / pure helpers
  select 'INFO', 'public.' || p.oid::regprocedure::text,
         'anon can EXECUTE via the PUBLIC default — ' || case when p.prorettype = 'trigger'::regtype then 'a trigger function (not callable through PostgREST)' else 'an IMMUTABLE/STABLE helper with no table access' end,
         'optional: revoke all on function ' || p.oid::regprocedure::text || ' from public, anon, authenticated'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and exists (select 1 from pg_roles where rolname = 'anon')
    and has_function_privilege('anon', p.oid, 'execute')
    and (p.prorettype = 'trigger'::regtype or (p.provolatile <> 'v' and p.proname !~ '^(insert|update|delete|set|create)'))
  union all
  -- INFO: storage policies for browser roles
  select 'INFO', 'storage.' || p.tablename || ' / ' || p.policyname,
         'storage policy (' || p.cmd || ') for ' || array_to_string(p.roles, ',') || ' using (' || coalesce(p.qual, '—') || ')',
         'confirm the bucket is meant to be reachable with the anon key; otherwise drop the policy'
  from pg_policies p
  where p.schemaname = 'storage' and (p.roles @> array['anon'::name] or p.roles @> array['authenticated'::name] or p.roles = array['public'::name])
  union all
  -- INFO: unrelated table with authenticated-only policies on RLS (not anon) — visible for the record
  select 'INFO', 'public.' || p.tablename || ' / ' || p.policyname,
         'permissive ' || p.cmd || ' policy for ' || array_to_string(p.roles, ',') || ' — any signed-up Supabase user; check the predicate: using (' || coalesce(p.qual, '—') || ')',
         'confirm the predicate names an identity (auth.uid()) and is not using (true)'
  from pg_policies p
  where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
    and p.roles @> array['authenticated'::name] and not (p.roles @> array['anon'::name])
    and p.tablename not like 'bolagio\_%'
)
select severity, object, finding, recommended_action
from findings
order by case severity when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end, object;

\echo ''
select case severity when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end as rank, severity, count(*) as findings
from (
  select 'CRITICAL' as severity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity and c.relname not like 'bolagio\_%'
      and exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated'))
  union all
  select 'CRITICAL' from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'bolagio\_%'
      and (not c.relrowsecurity or exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = c.relname and g.grantee in ('anon','authenticated')))
  union all
  select 'HIGH' from pg_policies p where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and (p.roles @> array['anon'::name] or p.roles = array['public'::name])
  union all
  select 'HIGH' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'HIGH' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', p.oid, 'execute')
      and (p.provolatile = 'v' or p.proname ~ '^(insert|update|delete|set|create)')
) s
group by 1, 2 order by 1;
\echo '(no CRITICAL/HIGH rows in the summary = nothing to fix before applying the BoLaGio migrations;'
\echo ' a CRITICAL or HIGH row on an unrelated table is the input to supabase/ops/proposed_unrelated_hardening.sql)'
\echo ''
\echo '════════ inventory complete (read-only) ════════'
