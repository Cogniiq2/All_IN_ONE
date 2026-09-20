-- ════════════════════════════════════════════════════════════════════════════
-- PROPOSAL — hardening of UNRELATED (non-BoLaGio) tables in the shared project.
--
-- NOT part of any BoLaGio runbook. No BoLaGio script, workflow or document
-- applies this. It exists because supabase/ops/shared_project_inventory.sql
-- flags CRITICAL/HIGH findings on tables BoLaGio does not own, and the person
-- who owns those tables needs a precise, reversible, opt-in way to close them.
--
-- ── What it does, and only this ──────────────────────────────────────────
-- For each table the OPERATOR lists (nothing is derived from a hardcoded
-- Cogniiq table name — this file knows none):
--     alter table public.<t> enable row level security;
--     revoke all on table public.<t> from anon, authenticated;
-- It drops no policy, alters no column, touches no other role (service_role
-- keeps working: it bypasses RLS and its grants are not revoked), and never
-- touches a bolagio_* table (it refuses if one is listed).
--
-- Effect on the listed tables: the anon key and any signed-up Supabase user
-- read and write NOTHING; the service key is unaffected. If a client still
-- uses the anon key against one of these tables, that client breaks — which
-- is the point, and why the list is the operator's, not ours.
--
-- ── Three locks ──────────────────────────────────────────────────────────
--   1. The FIRST statement raises unless the session carries
--        set bolagio.hardening_confirmed = 'I have read the inventory';
--   2. Nothing happens unless a table list is given:
--        -v tables='invoices,emails'          (comma-separated, schema public)
--   3. It is a DRY RUN unless -v apply=yes. The dry run prints the exact
--      statements and the before-state. Run it, read it, then re-run with
--      apply=yes inside one transaction (-1).
--
-- ── How to run ───────────────────────────────────────────────────────────
--   # dry run
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -c "set bolagio.hardening_confirmed = 'I have read the inventory'" \
--        -v tables='invoices,emails' \
--        -f supabase/ops/proposed_unrelated_hardening.sql
--   # apply, atomically
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 \
--        -c "set bolagio.hardening_confirmed = 'I have read the inventory'" \
--        -v tables='invoices,emails' -v apply=yes \
--        -f supabase/ops/proposed_unrelated_hardening.sql
--   (psql runs -c and -f in the same session, in order.)
--
-- ── Rollback ─────────────────────────────────────────────────────────────
-- The dry run prints, per table, the statements that restore the previous
-- state (`grant <privs> on … to <role>`, `alter table … disable row level
-- security` when RLS was off). Keep that output with the change.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  if coalesce(current_setting('bolagio.hardening_confirmed', true), '') <> 'I have read the inventory' then
    raise exception E'REFUSED: this proposal runs only after the shared-project inventory has been read.\nRun: psql … -c "set bolagio.hardening_confirmed = ''I have read the inventory''" -v tables=… -f supabase/ops/proposed_unrelated_hardening.sql';
  end if;
end $$;

\set ON_ERROR_STOP on
\pset pager off
\if :{?tables}
\else
  \set tables ''
\endif
\if :{?apply}
\else
  \set apply no
\endif
select set_config('bolagio.hardening_tables', :'tables', false) as tables_listed,
       set_config('bolagio.hardening_apply',  :'apply',  false) as apply_mode;

do $$
declare
  raw text := current_setting('bolagio.hardening_tables', true);
  apply boolean := current_setting('bolagio.hardening_apply', true) = 'yes';
  t text; rel oid; rls boolean; r record; n int := 0;
  targets text[];
begin
  if raw is null or btrim(raw) = '' then
    raise exception 'REFUSED: no table listed. Pass -v tables=''name1,name2'' (schema public) taken from the inventory RISK REPORT.';
  end if;
  targets := array(select btrim(x) from unnest(string_to_array(raw, ',')) x where btrim(x) <> '');

  -- Preconditions, all before any change.
  foreach t in array targets loop
    if t like 'bolagio\_%' then
      raise exception 'REFUSED: % is a BoLaGio table. This proposal is for UNRELATED tables only; BoLaGio posture is set by its migrations.', t;
    end if;
    if t !~ '^[a-z_][a-z0-9_]*$' then
      raise exception 'REFUSED: % is not a plain lowercase identifier in schema public', t;
    end if;
    rel := to_regclass(format('public.%I', t));
    if rel is null then
      raise exception 'REFUSED: public.% does not exist (spelling, or already dropped)', t;
    end if;
    if (select relkind from pg_class where oid = rel) not in ('r','p') then
      raise exception 'REFUSED: public.% is not an ordinary table (RLS applies to tables only)', t;
    end if;
  end loop;

  raise notice '════ %: % table(s) ════', case when apply then 'APPLYING' else 'DRY RUN' end, array_length(targets, 1);

  foreach t in array targets loop
    rel := to_regclass(format('public.%I', t));
    select relrowsecurity into rls from pg_class where oid = rel;
    raise notice '── public.% — before: rls=%, policies=%, browser grants=%', t, rls,
      (select count(*) from pg_policy where polrelid = rel),
      coalesce((select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
                  from information_schema.role_table_grants
                 where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated')), 'none');
    raise notice '   would run: alter table public.% enable row level security;', quote_ident(t);
    raise notice '   would run: revoke all on table public.% from anon, authenticated;', quote_ident(t);
    -- the exact undo
    if not rls then
      raise notice '   undo:      alter table public.% disable row level security;', quote_ident(t);
    end if;
    for r in select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
               from information_schema.role_table_grants
              where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated')
              group by grantee order by grantee loop
      raise notice '   undo:      grant % on table public.% to %;', r.privs, quote_ident(t), r.grantee;
    end loop;
    if (select count(*) from pg_policy where polrelid = rel and (polroles @> array[(select oid from pg_roles where rolname = 'anon')] or polroles = array[0::oid])) > 0 then
      raise notice '   note:      policies for anon/PUBLIC remain on this table; they are inert once the grants are revoked, but drop them separately if they are not wanted';
    end if;

    if apply then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      n := n + 1;
      raise notice '   applied. after: rls=%, browser grants=%',
        (select relrowsecurity from pg_class where oid = rel),
        coalesce((select string_agg(grantee || ':' || privilege_type, ',')
                    from information_schema.role_table_grants
                   where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated')), 'none');
    end if;
  end loop;

  if apply then
    raise notice '════ applied to % table(s). Re-run supabase/ops/shared_project_inventory.sql and diff. ════', n;
  else
    raise notice '════ dry run only — nothing changed. Re-run with -v apply=yes (and -1) to apply. ════';
  end if;
end $$;
