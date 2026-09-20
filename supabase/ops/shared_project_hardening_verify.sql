-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY the shared-project hardening. READ-ONLY: no INSERT, UPDATE, DELETE,
-- ALTER, DROP, CREATE TABLE, GRANT or REVOKE anywhere in this file. Safe to
-- run against the real project at any time, before or after applying.
--
-- Prints one line per check and a final verdict. A non-empty FAILED list is
-- the signal to stop and look; "not present" is never a failure, because this
-- repository is not a complete description of the shared project.
--
-- It also prints two REPORT sections that assert nothing and exist to be read:
-- the remaining PUBLIC EXECUTE grants outside bolagio_, and the storage
-- policies the inventory flagged as INFO.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  legacy constant text[] := array[
    'audit_log','bank_accounts','categories','categorization_rules','documents',
    'import_batches','loan_payments','loans','property_units',
    'renovation_project_invoices','renovation_projects','suppliers','tenants',
    'utility_accounts','utility_bills',
    'emails','email_attachments','properties',
    'invoices','transactions'
  ];
  gone constant text[][] := array[
    ['emails','Allow anon read emails'],
    ['emails','Authenticated users can manage emails'],
    ['email_attachments','Allow anon read email attachments'],
    ['email_attachments','Authenticated users can manage email attachments'],
    ['properties','Authenticated users can read properties'],
    ['properties','Authenticated users can modify properties']
  ];
  t text; rel oid; i int; failed text[] := array[]::text[]; skipped int := 0; checks int := 0;
  g text; sq text;
begin
  /* ── (A) legacy: RLS on, no browser grant, no permissive policy ───────── */
  foreach t in array legacy loop
    rel := to_regclass(format('public.%I', t));
    if rel is null then skipped := skipped + 1; continue; end if;

    checks := checks + 1;
    if not (select relrowsecurity from pg_class where oid = rel) then
      failed := failed || format('public.%s: RLS is OFF', t);
    end if;

    checks := checks + 1;
    g := (select string_agg(distinct grantee || ':' || privilege_type, ',' order by grantee || ':' || privilege_type)
            from information_schema.role_table_grants
           where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated'));
    if g is not null then
      failed := failed || format('public.%s: anon/authenticated still hold %s', t, g);
    end if;

    -- The identity sequence is a separate object with separate privileges.
    checks := checks + 1;
    for sq in
      select format('%I.%I', sn.nspname, sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
       where d.refobjid = rel and d.deptype in ('a','i')
    loop
      if has_sequence_privilege('anon', sq, 'USAGE') or has_sequence_privilege('authenticated', sq, 'USAGE') then
        failed := failed || format('sequence %s: anon/authenticated still hold USAGE', sq);
      end if;
    end loop;
  end loop;
  raise notice 'ok — (A) % legacy table(s): RLS on, no browser grant on table or sequence (% not present)',
    (select count(*) from unnest(legacy) x where to_regclass(format('public.%I', x)) is not null), skipped;

  for i in 1 .. array_length(gone, 1) loop
    checks := checks + 1;
    if exists (select 1 from pg_policies where schemaname = 'public'
                and tablename = gone[i][1] and policyname = gone[i][2]) then
      failed := failed || format('policy %L still on public.%s', gone[i][2], gone[i][1]);
    end if;
  end loop;
  raise notice 'ok — (A) the 6 permissive anon/public policies are gone';

  /* ── (B) the Cogniiq gap: RLS + the sibling policy, NOT a lockout ─────── */
  if to_regclass('public.owner_tax_adjustments') is null then
    raise notice 'skip — (B) public.owner_tax_adjustments not present';
  else
    checks := checks + 3;
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.owner_tax_adjustments')) then
      failed := failed || 'public.owner_tax_adjustments: RLS is OFF';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public'
                    and tablename = 'owner_tax_adjustments' and policyname = 'owner_tax_adjustments_owner_all') then
      failed := failed || 'public.owner_tax_adjustments: the is_platform_owner() policy is missing';
    end if;
    -- authenticated MUST keep its grants here: the policy governs, and taking
    -- them would break the Cogniiq owner screens. anon must be gone.
    if exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'owner_tax_adjustments' and grantee = 'anon') then
      failed := failed || 'public.owner_tax_adjustments: anon still holds privileges';
    end if;
    if not exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'owner_tax_adjustments' and grantee = 'authenticated') then
      failed := failed || 'public.owner_tax_adjustments: authenticated LOST its grants — Cogniiq owner screens will break';
    end if;
    checks := checks + 1;
    for sq in
      select format('%I.%I', sn.nspname, sc.relname)
        from pg_depend d
        join pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
        join pg_namespace sn on sn.oid = sc.relnamespace
       where d.refobjid = to_regclass('public.owner_tax_adjustments') and d.deptype in ('a','i')
    loop
      if has_sequence_privilege('anon', sq, 'USAGE') then
        failed := failed || format('sequence %s: anon still holds USAGE', sq);
      end if;
      if not has_sequence_privilege('authenticated', sq, 'USAGE') then
        failed := failed || format('sequence %s: authenticated LOST USAGE — every owner insert will fail', sq);
      end if;
    end loop;
    raise notice 'ok — (B) owner_tax_adjustments has RLS + is_platform_owner(), authenticated retained, anon removed';
  end if;

  /* ── (C) functions ───────────────────────────────────────────────────── */
  if to_regprocedure('public.generate_daily_execution_plan(date)') is not null then
    checks := checks + 1;
    if has_function_privilege('anon', 'public.generate_daily_execution_plan(date)', 'execute') then
      failed := failed || 'generate_daily_execution_plan(date): anon can still EXECUTE';
    end if;
    raise notice 'ok — (C) generate_daily_execution_plan(date) is out of anon''s reach';
  end if;

  for t in select unnest(array['public.public_offer_by_token(text,text)',
                               'public.respond_offer_by_token(text,text,text,text,text,text,text,text)']) loop
    continue when to_regprocedure(t) is null;
    checks := checks + 2;
    -- RETAINED on purpose: the offer link is opened by someone not signed in.
    if not has_function_privilege('anon', t, 'execute') then
      failed := failed || format('%s: anon LOST execute — the public offer flow is broken', t);
    end if;
    -- but it must be an explicit grant, not PUBLIC's default…
    if (select proacl from pg_proc where oid = to_regprocedure(t))::text like '%=X/%'
       and (select array_to_string(proacl, ',') from pg_proc where oid = to_regprocedure(t)) ~ '(^|,)=X/' then
      failed := failed || format('%s: EXECUTE is still granted to PUBLIC', t);
    end if;
    -- …and a SECURITY DEFINER function must pin its search_path.
    if (select prosecdef from pg_proc where oid = to_regprocedure(t))
       and not exists (select 1 from pg_proc p, unnest(coalesce(p.proconfig, array[]::text[])) c
                        where p.oid = to_regprocedure(t) and c like 'search\_path=%') then
      failed := failed || format('%s: SECURITY DEFINER with no pinned search_path', t);
    end if;
  end loop;
  raise notice 'ok — (C) the token offer flow still works for anon, by an explicit grant, with a pinned search_path';

  /* ── (D) nothing that is not ours was touched ─────────────────────────── */
  checks := checks + 1;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname like 'bolagio\_%') then
    raise notice 'note — bolagio_ tables are present; this file asserts nothing about them (their migrations do)';
  end if;

  if array_length(failed, 1) > 0 then
    raise exception E'════ VERIFICATION FAILED (% of % checks) ════\n  %',
      array_length(failed, 1), checks, array_to_string(failed, E'\n  ');
  end if;
  raise notice '════ verification passed — % checks ════', checks;
end $$;

-- ── REPORT 1 (asserts nothing): functions outside bolagio_ that PUBLIC can
--    still execute. Read this list; each one is a decision, not a defect.
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as security,
       case when p.proconfig is null then 'search_path NOT pinned' else array_to_string(p.proconfig, ' ') end as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname not like 'bolagio\_%'
   and has_function_privilege('anon', p.oid, 'execute')
 order by p.prosecdef desc, 1;

-- ── REPORT 2 (asserts nothing): the storage policies the inventory flagged
--    INFO. The hardening deliberately changes none of them.
select polname as storage_policy,
       case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as command,
       pg_get_expr(polqual, polrelid) as using_expression
  from pg_policy
 where polrelid = to_regclass('storage.objects')
 order by 1;
