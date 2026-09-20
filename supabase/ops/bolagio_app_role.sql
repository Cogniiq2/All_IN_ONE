-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — OPTIONAL narrower-access role `bolagio_app` for the shared project.
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/bolagio_app_role.sql
--
-- Idempotent: re-run after EVERY BoLaGio migration that adds a table or a
-- function, because grants and policies are per object and a new table
-- starts with none. Safe to run twice in a row.
--
-- ── Why ──────────────────────────────────────────────────────────────────
-- The application talks to Supabase through PostgREST with a JWT whose
-- `role` claim names the Postgres role PostgREST switches to. Today that is
-- `service_role`, which is BYPASSRLS and holds ALL on every table in the
-- project — including the unrelated Cogniiq tables. A leak of that key is a
-- leak of the whole project.
--
-- `bolagio_app` is a role that can reach ONLY the bolagio_* objects:
--   * NOLOGIN, NOBYPASSRLS, not a superuser — PostgREST switches to it from
--     `authenticator` exactly as it does for anon/authenticated/service_role
--   * SELECT/INSERT/UPDATE/DELETE on every bolagio_* table
--   * SELECT on every bolagio_* view
--   * USAGE on every bolagio_* sequence (none exist today; future-proof)
--   * EXECUTE on every bolagio_* function that is not a trigger function
--   * one permissive policy per bolagio_* table, FOR ALL TO bolagio_app
--     USING (true) WITH CHECK (true) — required because the role is NOT
--     BYPASSRLS and every bolagio_* table has RLS enabled with no policy;
--     without it the role would read nothing. The policy names exactly one
--     role, so anon/authenticated are unaffected.
--   * NO privilege on any non-bolagio table, and none is ever granted here
--
-- A JWT with `"role": "bolagio_app"` signed with the project's JWT secret is
-- then used as the value of SUPABASE_SERVICE_ROLE_KEY in Cloudflare. The
-- application code does not change. The Edge Function keeps the injected
-- service key (its scope is the payment webhook, and Supabase injects it).
-- Minting steps, trade-offs and what this does NOT protect:
-- docs/supabase-shared-project.md §"Service-role possession".
--
-- ── What it never does ───────────────────────────────────────────────────
-- Never grants to anon or authenticated. Never touches a table that is not
-- bolagio_*. Never alters service_role. Never creates a LOGIN role.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 1. The role: NOLOGIN, no RLS bypass, no elevated attribute.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'bolagio_app') then
    create role bolagio_app nologin nobypassrls noinherit nocreatedb nocreaterole nosuperuser;
    raise notice 'created role bolagio_app';
  else
    -- keep the attributes pinned even if someone altered the role by hand
    alter role bolagio_app nologin nobypassrls nocreatedb nocreaterole nosuperuser;
    raise notice 'role bolagio_app exists; attributes re-pinned';
  end if;
end $$;

-- 2. PostgREST switches from `authenticator`; the role must be a member.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant bolagio_app to authenticator;
    raise notice 'granted bolagio_app to authenticator';
  else
    raise notice 'role authenticator absent (bare cluster) — PostgREST switching not configured; grants and policies still applied';
  end if;
end $$;

grant usage on schema public to bolagio_app;

-- 3. Object grants: bolagio_* tables, views, sequences, functions. Nothing else.
do $$
declare r record; n_tables int := 0; n_views int := 0; n_seqs int := 0; n_fns int := 0;
begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname like 'bolagio\_%' and c.relkind in ('r','p','v','m','S') loop
    if r.relkind in ('r','p') then
      execute format('grant select, insert, update, delete on table public.%I to bolagio_app', r.relname); n_tables := n_tables + 1;
    elsif r.relkind in ('v','m') then
      execute format('grant select on public.%I to bolagio_app', r.relname); n_views := n_views + 1;
    elsif r.relkind = 'S' then
      execute format('grant usage, select on sequence public.%I to bolagio_app', r.relname); n_seqs := n_seqs + 1;
    end if;
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'bolagio\_%' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype loop
    execute format('grant execute on function %s to bolagio_app', r.sig); n_fns := n_fns + 1;
  end loop;
  raise notice 'granted: % tables (S/I/U/D), % views (S), % sequences (USAGE), % functions (EXECUTE)', n_tables, n_views, n_seqs, n_fns;
end $$;

-- 4. One permissive policy per bolagio_* table, for bolagio_app only.
do $$
declare r record; n_new int := 0; n_kept int := 0;
begin
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname like 'bolagio\_%' and c.relkind in ('r','p') order by c.relname loop
    -- RLS must stay on; the policy is what lets bolagio_app through.
    execute format('alter table public.%I enable row level security', r.relname);
    if exists (select 1 from pg_policy p where p.polrelid = r.oid and p.polname = 'bolagio_app_all') then
      -- re-pin the definition in case it was edited
      execute format('alter policy bolagio_app_all on public.%I to bolagio_app using (true) with check (true)', r.relname);
      n_kept := n_kept + 1;
    else
      execute format('create policy bolagio_app_all on public.%I as permissive for all to bolagio_app using (true) with check (true)', r.relname);
      n_new := n_new + 1;
    end if;
  end loop;
  raise notice 'policies bolagio_app_all: % created, % already present', n_new, n_kept;
end $$;

-- 5. Verify. Raises on any deviation, so a non-zero exit means "not installed".
do $$
declare bad text; n int;
begin
  if exists (select 1 from pg_roles where rolname = 'bolagio_app' and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then
    raise exception 'VERIFY FAILED: bolagio_app must be NOLOGIN, NOBYPASSRLS and unprivileged';
  end if;
  -- every bolagio_ table: the four privileges and the policy
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'bolagio\_%' and c.relkind in ('r','p')
     and not (has_table_privilege('bolagio_app', c.oid, 'select') and has_table_privilege('bolagio_app', c.oid, 'insert')
          and has_table_privilege('bolagio_app', c.oid, 'update') and has_table_privilege('bolagio_app', c.oid, 'delete'));
  if bad is not null then raise exception 'VERIFY FAILED: bolagio_app lacks S/I/U/D on %', bad; end if;
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'bolagio\_%' and c.relkind in ('r','p')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'bolagio_app_all' and p.polpermissive
                       and array(select b.rolname from pg_roles b where b.oid = any(p.polroles)) = array['bolagio_app'::name]);
  if bad is not null then raise exception 'VERIFY FAILED: policy bolagio_app_all missing or not bolagio_app-only on %', bad; end if;
  -- every non-trigger bolagio_ function executable
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'bolagio\_%' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
     and not has_function_privilege('bolagio_app', p.oid, 'execute');
  if bad is not null then raise exception 'VERIFY FAILED: bolagio_app cannot execute %', bad; end if;
  -- NO privilege on any non-bolagio table or view, in any schema
  select string_agg(g.table_schema || '.' || g.table_name || ':' || g.privilege_type, ', ') into bad
    from information_schema.role_table_grants g
   where g.grantee = 'bolagio_app' and not (g.table_schema = 'public' and g.table_name like 'bolagio\_%');
  if bad is not null then raise exception 'VERIFY FAILED: bolagio_app holds a privilege outside bolagio_*: %', bad; end if;
  -- no policy for bolagio_app on a non-bolagio table
  select string_agg(schemaname || '.' || tablename || '/' || policyname, ', ') into bad
    from pg_policies where roles @> array['bolagio_app'::name] and not (schemaname = 'public' and tablename like 'bolagio\_%');
  if bad is not null then raise exception 'VERIFY FAILED: a bolagio_app policy exists outside bolagio_*: %', bad; end if;
  -- anon / authenticated were not touched
  if exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name like 'bolagio\_%' and g.grantee in ('anon','authenticated')) then
    raise exception 'VERIFY FAILED: anon/authenticated hold a privilege on a bolagio_ table';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename like 'bolagio\_%' and policyname = 'bolagio_app_all';
  raise notice 'ok — bolagio_app installed: % bolagio_app_all policies, no privilege outside bolagio_*, anon/authenticated untouched', n;
  raise notice 'next: mint a JWT with role=bolagio_app (docs/supabase-shared-project.md) and verify with supabase/ops/shared_project_verify.sql';
end $$;
