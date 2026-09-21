-- BoLaGio / Cogniiq shared-project hardening
-- Supabase SQL Editor compatible DRY-RUN version
-- IMPORTANT: this version sets cogniiq.hardening_apply = 'no' and therefore does NOT apply changes.
-- It only evaluates the current database state and prints the SQL actions that would be taken.

-- ════════════════════════════════════════════════════════════════════════════
-- SHARED-PROJECT HARDENING — precise, named, reversible.
--
-- Replaces supabase/ops/proposed_unrelated_hardening.sql, which could not be
-- used here: it takes a table list from the operator and applies one blunt
-- treatment to all of it. The live inventory of 2026-09-20 found three
-- different problems needing three different answers, and one table that must
-- NOT be treated like its neighbours. So this file names every object and says
-- why, and the generic proposal is retired.
--
-- It also replaces, in effect, migrations/20260815120000_lockdown_revoke_anon_
-- access.sql, which ABORTS against the current database: that migration
-- demands `invoices` still carry its four anon policies, and the inventory
-- shows invoices now has RLS on with NO policy. The baseline it guards has
-- moved. It is left in the repository as the record of what was found in
-- August; this file is what runs.
--
-- ── What the evidence says ───────────────────────────────────────────────
-- Searched every .ts/.tsx/.js in this repository for each flagged table.
-- Every single hit is inside `archive/admin-app/` — the withdrawn Vite admin
-- app, whose `login()` now always denies and whose compiled bundle was
-- deleted (archive/README.md). The BoLaGio site never touches these tables.
-- No Cogniiq platform code exists in this repository at all, so the Cogniiq
-- families are identified by their own RLS posture, not by guesswork:
-- owner_*/organization_*/ai_receptionist_*/client_*/customer_*/execution_*/
-- oura_* already carry is_platform_owner()/is_platform_admin() policies.
--
-- ── Three treatments ─────────────────────────────────────────────────────
--   A  LEGACY, server-only (20 tables)
--      The archived property-management schema. Enable RLS, drop the
--      permissive anon/public policies, revoke anon + authenticated — from
--      the table AND from its identity sequences, which `revoke … on table`
--      does not reach. A sequence left granted lets anon keep burning ids on
--      a table it can no longer read; it is residual, it is pointless, and it
--      is cheap to close. Nothing but service_role reaches them afterwards.
--      This is the 15 CRITICAL tables, the 3 HIGH policy tables and the 2
--      MEDIUM grant-only tables.
--
--   B  COGNIIQ GAP (1 table) — public.owner_tax_adjustments
--      NOT legacy. Its siblings owner_tax_estimates / owner_tax_payments /
--      owner_tax_settings all carry `is_platform_owner()`; this one was
--      created without it. Treating it like (A) would BREAK Cogniiq. It gets
--      RLS plus the policy its siblings have, so a platform owner keeps
--      working and nobody else gets in.
--
--   C  FUNCTIONS (3) — stop relying on the PUBLIC default grant
--      Postgres grants EXECUTE to PUBLIC on every new function, so "anon can
--      execute" here is a default nobody chose. Each grant becomes explicit:
--        generate_daily_execution_plan  → authenticated only (anon cannot be
--                                          a platform admin; the execution_*
--                                          RLS still gates the rest)
--        public_offer_by_token          → anon + authenticated, RETAINED: the
--        respond_offer_by_token           token offer flow is used by people
--                                          who never sign in. Both are also
--                                          given a pinned search_path, which
--                                          a SECURITY DEFINER function must
--                                          have and neither had.
--
-- ── What this does NOT do ────────────────────────────────────────────────
-- No bolagio_* object (BoLaGio posture is set by its own migrations, and this
-- file refuses if a bolagio_ table appears in its list). No Cogniiq table
-- outside (B). No storage policy — the 'document' / 'invoices' / 'reports'
-- buckets grant `authenticated` full control and that is flagged in the
-- runbook for a decision, not changed here on a guess. No role is created or
-- altered; service_role is untouched and keeps bypassing RLS. No column, no
-- row, no schema, no default privilege.
--
-- ── How to run ───────────────────────────────────────────────────────────
--   # 1. dry run — prints every statement and the before-state, changes nothing
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/ops/shared_project_hardening.sql
--
--   # 2. apply, atomically, after reading the dry run
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v apply=yes \
--        -f supabase/ops/shared_project_hardening.sql
--
--   # 3. prove it
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f supabase/ops/shared_project_hardening_verify.sql
--
-- Re-running is safe: every step is idempotent and reports "already".
-- Undo: supabase/ops/shared_project_hardening_rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════

select set_config('cogniiq.hardening_apply', 'no', false) as apply_mode;

do $$
declare
  apply boolean := current_setting('cogniiq.hardening_apply', true) = 'yes';

  -- (A) legacy, server-only. Named one by one, on purpose.
  legacy constant text[] := array[
    'audit_log','bank_accounts','categories','categorization_rules','documents',
    'import_batches','loan_payments','loans','property_units',
    'renovation_project_invoices','renovation_projects','suppliers','tenants',
    'utility_accounts','utility_bills',
    'emails','email_attachments','properties',
    'invoices','transactions'
  ];
  -- The permissive policies to remove, exactly as the inventory names them.
  legacy_policies constant text[][] := array[
    ['emails','Allow anon read emails'],
    ['emails','Authenticated users can manage emails'],
    ['email_attachments','Allow anon read email attachments'],
    ['email_attachments','Authenticated users can manage email attachments'],
    ['properties','Authenticated users can read properties'],
    ['properties','Authenticated users can modify properties']
  ];

  t text; rel oid; i int; seq text;
  n_rls int := 0; n_pol int := 0; n_rev int := 0; n_fn int := 0; n_gap int := 0; n_seq int := 0;
  missing text[] := array[]::text[];
  before_grants text;
begin
  raise notice '════ % ════', case when apply then 'APPLYING' else 'DRY RUN — nothing will change' end;

  /* ── Preconditions. Everything checked before anything is touched. ────── */
  foreach t in array legacy loop
    if t like 'bolagio\_%' then
      raise exception 'REFUSED: % is a BoLaGio table. BoLaGio posture belongs to its own migrations.', t;
    end if;
    rel := to_regclass(format('public.%I', t));
    if rel is null then
      missing := missing || t;
    elsif (select relkind from pg_class where oid = rel) not in ('r','p') then
      raise exception 'REFUSED: public.% is not an ordinary table (found relkind %)', t, (select relkind from pg_class where oid = rel);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise notice 'NOTE: not present in this database, skipped: %', array_to_string(missing, ', ');
  end if;

  /* ── (A) LEGACY — RLS on, permissive policies gone, browser roles out ─── */
  raise notice '── (A) legacy property-management schema: server-only ──';
  foreach t in array legacy loop
    rel := to_regclass(format('public.%I', t));
    continue when rel is null;

    before_grants := coalesce((select string_agg(distinct grantee || ':' || privilege_type, ',' order by grantee || ':' || privilege_type)
                                 from information_schema.role_table_grants
                                where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated')), 'none');
    raise notice '   public.% — rls=%, browser grants=%', t,
      (select relrowsecurity from pg_class where oid = rel), before_grants;

    if not (select relrowsecurity from pg_class where oid = rel) then
      if apply then execute format('alter table public.%I enable row level security', t); end if;
      n_rls := n_rls + 1;
      raise notice '      alter table public.%I enable row level security;', t;
    end if;
    if before_grants <> 'none' then
      if apply then execute format('revoke all on table public.%I from anon, authenticated', t); end if;
      n_rev := n_rev + 1;
      raise notice '      revoke all on table public.%I from anon, authenticated;', t;
    end if;

    -- `revoke … on table` leaves the identity/serial sequence behind.
    for seq in
      select format('%I.%I', sn.nspname, sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
       where d.refobjid = rel and d.deptype in ('a','i')
    loop
      if exists (select 1 from information_schema.role_usage_grants
                  where object_schema = split_part(replace(seq, '"', ''), '.', 1)
                    and object_name = split_part(replace(seq, '"', ''), '.', 2)
                    and grantee in ('anon','authenticated'))
         or has_sequence_privilege('anon', seq, 'USAGE')
         or has_sequence_privilege('authenticated', seq, 'USAGE') then
        if apply then execute format('revoke all on sequence %s from anon, authenticated', seq); end if;
        n_seq := n_seq + 1;
        raise notice '      revoke all on sequence %s from anon, authenticated;', seq;
      end if;
    end loop;
  end loop;

  for i in 1 .. array_length(legacy_policies, 1) loop
    if exists (select 1 from pg_policies where schemaname = 'public'
                and tablename = legacy_policies[i][1] and policyname = legacy_policies[i][2]) then
      if apply then execute format('drop policy %I on public.%I', legacy_policies[i][2], legacy_policies[i][1]); end if;
      n_pol := n_pol + 1;
      raise notice '      drop policy %L on public.%I;', legacy_policies[i][2], legacy_policies[i][1];
    end if;
  end loop;

  /* ── (B) COGNIIQ GAP — give the sibling policy, do not lock the table ─── */
  raise notice '── (B) public.owner_tax_adjustments: the Cogniiq owner policy it was missing ──';
  if to_regclass('public.owner_tax_adjustments') is null then
    raise notice '   not present, skipped';
  elsif to_regprocedure('public.is_platform_owner()') is null then
    raise exception 'REFUSED: is_platform_owner() does not exist, so the sibling policy cannot be reproduced. Inspect the live schema before continuing — do NOT fall back to revoking, that would break Cogniiq.';
  else
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.owner_tax_adjustments')) then
      if apply then execute 'alter table public.owner_tax_adjustments enable row level security'; end if;
      n_gap := n_gap + 1;
      raise notice '      alter table public.owner_tax_adjustments enable row level security;';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'owner_tax_adjustments' and policyname = 'owner_tax_adjustments_owner_all') then
      if apply then
        execute 'create policy owner_tax_adjustments_owner_all on public.owner_tax_adjustments '
             || 'for all to authenticated using (is_platform_owner()) with check (is_platform_owner())';
      end if;
      n_gap := n_gap + 1;
      raise notice '      create policy owner_tax_adjustments_owner_all … using (is_platform_owner());';
    end if;
    -- authenticated keeps its grants: the policy is what governs now, exactly
    -- as it does on owner_tax_estimates. anon never belonged here.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'owner_tax_adjustments' and grantee = 'anon') then
      if apply then execute 'revoke all on table public.owner_tax_adjustments from anon'; end if;
      n_gap := n_gap + 1;
      raise notice '      revoke all on table public.owner_tax_adjustments from anon;';
    end if;
    -- anon off the sequence as well; `authenticated` KEEPS it, or the owner
    -- screens can read the table and fail on every insert.
    for seq in
      select format('%I.%I', sn.nspname, sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
       where d.refobjid = to_regclass('public.owner_tax_adjustments') and d.deptype in ('a','i')
    loop
      if has_sequence_privilege('anon', seq, 'USAGE') then
        if apply then execute format('revoke all on sequence %s from anon', seq); end if;
        n_gap := n_gap + 1;
        raise notice '      revoke all on sequence %s from anon;', seq;
      end if;
    end loop;
  end if;

  /* ── (C) FUNCTIONS — explicit grants instead of the PUBLIC default ────── */
  raise notice '── (C) function EXECUTE: explicit, not inherited from PUBLIC ──';

  if to_regprocedure('public.generate_daily_execution_plan(date)') is not null then
    if apply then
      execute 'revoke all on function public.generate_daily_execution_plan(date) from public, anon';
      execute 'grant execute on function public.generate_daily_execution_plan(date) to authenticated';
    end if;
    n_fn := n_fn + 1;
    raise notice '      revoke all on function public.generate_daily_execution_plan(date) from public, anon;';
    raise notice '      grant execute on function public.generate_daily_execution_plan(date) to authenticated;';
  else
    raise notice '   generate_daily_execution_plan(date) not present, skipped';
  end if;

  -- RETAINED for anon: the offer link is opened by someone who never signs in.
  if to_regprocedure('public.public_offer_by_token(text,text)') is not null then
    if apply then
      execute 'revoke all on function public.public_offer_by_token(text,text) from public';
      execute 'grant execute on function public.public_offer_by_token(text,text) to anon, authenticated';
      execute 'alter function public.public_offer_by_token(text,text) set search_path = public, pg_temp';
    end if;
    n_fn := n_fn + 1;
    raise notice '      revoke all on function public.public_offer_by_token(text,text) from public;';
    raise notice '      grant execute on function public.public_offer_by_token(text,text) to anon, authenticated;  -- RETAINED, token flow';
    raise notice '      alter function public.public_offer_by_token(text,text) set search_path = public, pg_temp;';
  else
    raise notice '   public_offer_by_token(text,text) not present, skipped';
  end if;

  if to_regprocedure('public.respond_offer_by_token(text,text,text,text,text,text,text,text)') is not null then
    if apply then
      execute 'revoke all on function public.respond_offer_by_token(text,text,text,text,text,text,text,text) from public';
      execute 'grant execute on function public.respond_offer_by_token(text,text,text,text,text,text,text,text) to anon, authenticated';
      execute 'alter function public.respond_offer_by_token(text,text,text,text,text,text,text,text) set search_path = public, pg_temp';
    end if;
    n_fn := n_fn + 1;
    raise notice '      revoke all on function public.respond_offer_by_token(…8 args…) from public;';
    raise notice '      grant execute on function public.respond_offer_by_token(…8 args…) to anon, authenticated;  -- RETAINED, token flow';
    raise notice '      alter function public.respond_offer_by_token(…8 args…) set search_path = public, pg_temp;';
  else
    raise notice '   respond_offer_by_token(…) not present, skipped';
  end if;

  if apply then
    raise notice '════ APPLIED — rls:% policies-dropped:% table-revokes:% sequence-revokes:% cogniiq-gap:% functions:% ════', n_rls, n_pol, n_rev, n_seq, n_gap, n_fn;
    raise notice 'Now run supabase/ops/shared_project_hardening_verify.sql';
  else
    raise notice '════ DRY RUN — % statement group(s) would run. Nothing changed. ════', n_rls + n_pol + n_rev + n_seq + n_gap + n_fn;
    raise notice 'Re-run with -1 -v apply=yes to apply.';
  end if;
end $$;
