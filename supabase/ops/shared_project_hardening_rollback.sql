-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of supabase/ops/shared_project_hardening.sql.
--
-- Restores the state the 2026-09-20 inventory found — exposures included.
-- That is what a rollback IS: this file exists so the hardening can be undone
-- inside the maintenance window if a Cogniiq screen turns out to depend on one
-- of the legacy tables through the browser. It is not a thing to leave applied.
--
-- ⚠ Running this re-opens 15 CRITICAL tables to the anon key. Do it to buy
--   time to fix a caller, then re-apply the hardening.
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v apply=yes \
--        -f supabase/ops/shared_project_hardening_rollback.sql
--
-- Same shape as the hardening: dry run unless -v apply=yes, idempotent,
-- refuses bolagio_ tables, touches nothing else.
--
-- ── Deliberately NOT restored ────────────────────────────────────────────
-- The pinned `search_path` on the two SECURITY DEFINER offer functions stays.
-- An unpinned search_path on a SECURITY DEFINER function is a privilege-
-- escalation vector with no upside, it changes no correct function's
-- behaviour, and no caller can depend on its absence. Reverting it would be
-- restoring a bug, not restoring a capability.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset pager off
\if :{?apply}
\else
  \set apply no
\endif
select set_config('cogniiq.rollback_apply', :'apply', false) as apply_mode;

do $$
declare
  apply boolean := current_setting('cogniiq.rollback_apply', true) = 'yes';
  legacy constant text[] := array[
    'audit_log','bank_accounts','categories','categorization_rules','documents',
    'import_batches','loan_payments','loans','property_units',
    'renovation_project_invoices','renovation_projects','suppliers','tenants',
    'utility_accounts','utility_bills',
    'emails','email_attachments','properties',
    'invoices','transactions'
  ];
  -- RLS was ON for these before the hardening; the other 15 had it OFF.
  rls_was_on constant text[] := array['emails','email_attachments','properties','invoices','transactions'];
  t text; rel oid; n int := 0; seq text;
begin
  raise notice '════ ROLLBACK %: restores the pre-hardening exposure ════',
    case when apply then 'APPLYING' else 'DRY RUN' end;

  foreach t in array legacy loop
    if t like 'bolagio\_%' then raise exception 'REFUSED: % is a BoLaGio table', t; end if;
    rel := to_regclass(format('public.%I', t));
    continue when rel is null;

    if apply then execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t); end if;
    raise notice '   grant select, insert, update, delete on table public.%I to anon, authenticated;', t;
    n := n + 1;

    for seq in
      select format('%I.%I', sn.nspname, sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
       where d.refobjid = rel and d.deptype in ('a','i')
    loop
      if apply then execute format('grant usage, select on sequence %s to anon, authenticated', seq); end if;
      raise notice '   grant usage, select on sequence %s to anon, authenticated;', seq;
      n := n + 1;
    end loop;

    if not (t = any(rls_was_on)) and (select relrowsecurity from pg_class where oid = rel) then
      if apply then execute format('alter table public.%I disable row level security', t); end if;
      raise notice '   alter table public.%I disable row level security;', t;
      n := n + 1;
    end if;
  end loop;

  -- The six permissive policies, recreated exactly as they were found.
  if to_regclass('public.emails') is not null then
    if apply then
      execute 'drop policy if exists "Allow anon read emails" on public.emails';
      execute 'create policy "Allow anon read emails" on public.emails for select to anon using (true)';
      execute 'drop policy if exists "Authenticated users can manage emails" on public.emails';
      execute 'create policy "Authenticated users can manage emails" on public.emails for all to public using (auth.role() = ''authenticated'')';
    end if;
    raise notice '   recreate the 2 permissive policies on public.emails'; n := n + 2;
  end if;
  if to_regclass('public.email_attachments') is not null then
    if apply then
      execute 'drop policy if exists "Allow anon read email attachments" on public.email_attachments';
      execute 'create policy "Allow anon read email attachments" on public.email_attachments for select to anon using (true)';
      execute 'drop policy if exists "Authenticated users can manage email attachments" on public.email_attachments';
      execute 'create policy "Authenticated users can manage email attachments" on public.email_attachments for all to public using (auth.role() = ''authenticated'')';
    end if;
    raise notice '   recreate the 2 permissive policies on public.email_attachments'; n := n + 2;
  end if;
  if to_regclass('public.properties') is not null then
    if apply then
      execute 'drop policy if exists "Authenticated users can read properties" on public.properties';
      execute 'create policy "Authenticated users can read properties" on public.properties for select to public using (auth.role() = ''authenticated'')';
      execute 'drop policy if exists "Authenticated users can modify properties" on public.properties';
      execute 'create policy "Authenticated users can modify properties" on public.properties for all to public using (auth.role() = ''authenticated'')';
    end if;
    raise notice '   recreate the 2 permissive policies on public.properties'; n := n + 2;
  end if;

  -- (B) the Cogniiq gap, back to how it was found.
  if to_regclass('public.owner_tax_adjustments') is not null then
    if apply then
      execute 'drop policy if exists owner_tax_adjustments_owner_all on public.owner_tax_adjustments';
      execute 'alter table public.owner_tax_adjustments disable row level security';
      execute 'grant select, insert, update, delete on table public.owner_tax_adjustments to authenticated';
      for seq in
        select format('%I.%I', sn.nspname, sc.relname)
          from pg_depend d
          join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
          join pg_namespace sn on sn.oid = sc.relnamespace
         where d.refobjid = to_regclass('public.owner_tax_adjustments') and d.deptype in ('a','i')
      loop
        execute format('grant usage, select on sequence %s to anon, authenticated', seq);
      end loop;
    end if;
    raise notice '   owner_tax_adjustments: drop policy, disable RLS, restore authenticated grants'; n := n + 3;
  end if;

  -- (C) the PUBLIC default EXECUTE, back on the three functions.
  if to_regprocedure('public.generate_daily_execution_plan(date)') is not null then
    if apply then execute 'grant execute on function public.generate_daily_execution_plan(date) to public'; end if;
    raise notice '   grant execute on function public.generate_daily_execution_plan(date) to public;'; n := n + 1;
  end if;
  if to_regprocedure('public.public_offer_by_token(text,text)') is not null then
    if apply then execute 'grant execute on function public.public_offer_by_token(text,text) to public'; end if;
    raise notice '   grant execute on function public.public_offer_by_token(text,text) to public;'; n := n + 1;
  end if;
  if to_regprocedure('public.respond_offer_by_token(text,text,text,text,text,text,text,text)') is not null then
    if apply then execute 'grant execute on function public.respond_offer_by_token(text,text,text,text,text,text,text,text) to public'; end if;
    raise notice '   grant execute on function public.respond_offer_by_token(…8 args…) to public;'; n := n + 1;
  end if;

  raise notice '════ % — % statement(s). The pinned search_path is kept on purpose. ════',
    case when apply then 'ROLLED BACK' else 'DRY RUN, nothing changed' end, n;
end $$;
