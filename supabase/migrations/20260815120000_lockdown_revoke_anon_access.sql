/*
# Lock down anonymous access to private administrative data

## Status

NOT APPLIED, and NOT SAFE TO APPLY BLIND.

This migration refuses to run unless the live database matches the exact
vulnerable state recorded in this repository. If anything differs — an extra
policy, a missing policy, a different role set, RLS already off, a bucket that
has been made public — it raises an exception and changes nothing.

That is deliberate. This repository is not a complete description of the
database, so a migration written from it must not assume it knows what is
there. Anything unexpected is a signal to look, not something to delete.

Run the read-only preflight in docs/security/2026-08-15-admin-exposure.md
first, inspect the snapshot it produces, and only then seek authorization.

## Scope

Covers only what this repository actually defines and can therefore reason
about:

  - public.invoices
  - public.emails
  - public.email_attachments
  - the three named storage policies for the private `invoices` bucket

Explicitly NOT covered: `properties` and `property_units`. The archived admin
app reads and writes them, but they have no migration here, their purpose is
undocumented and their live policies are unknown. Modifying them from this
repository would be acting on evidence that does not exist. They are recorded
as production-audit blockers in the security document instead.

## What was wrong

Two earlier migrations gave the `anon` role unrestricted access:

  20260612060328  invoices          SELECT/INSERT/UPDATE/DELETE  USING (true)
                  storage.objects   INSERT/SELECT/DELETE on bucket 'invoices'
  20260612141823  emails            SELECT/INSERT/UPDATE/DELETE  USING (true)
                  email_attachments SELECT/INSERT/UPDATE/DELETE  USING (true)

`anon` is the role behind the Supabase anon key, which is public by design.
Publishing that key was therefore not the vulnerability and rotating it is not
the fix: these policies made the public key sufficient to read every stored
invoice and business email, reach every file in the private bucket, and update
or delete any of it.

The same policies gave `authenticated` identical access. With no identity or
role model anywhere in the project, `authenticated` means "anyone who signed
up", which is not a restriction either.

## What this does

  1. Verifies the live state matches the known-vulnerable baseline. Aborts
     otherwise, before touching anything.
  2. Drops the twelve named policies on the three tables.
  3. Revokes table privileges from `anon` and `authenticated`, so access does
     not silently return if a policy is re-added later.
  4. Drops the three named `invoices` storage policies.

Deliberately not done: no invented admin role, no replacement `authenticated`
policy, no change to `service_role` (which bypasses RLS in Supabase and keeps
working), no change to database-wide default privileges, no schema or data
change, and no dynamic deletion of policies this repository did not create.

## One-shot by design

Re-running aborts, because after a successful run the state no longer matches
the vulnerable baseline. That is the intended behaviour, not a bug.

## Transaction

Run inside a single transaction (`psql -1`, or the Supabase CLI, which wraps
migrations). Preconditions all run before any mutation, so a failed check
changes nothing even without one.
*/

-- ═════════════════════════════════════════════════════════════════════════
-- PART 1 — PRECONDITIONS. No mutation happens in this part.
-- ═════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  expected_policies CONSTANT jsonb := jsonb_build_object(
    'invoices', jsonb_build_array(
      'anon_delete_invoices', 'anon_insert_invoices',
      'anon_select_invoices', 'anon_update_invoices'
    ),
    'emails', jsonb_build_array(
      'delete_emails', 'insert_emails', 'select_emails', 'update_emails'
    ),
    'email_attachments', jsonb_build_array(
      'delete_email_attachments', 'insert_email_attachments',
      'select_email_attachments', 'update_email_attachments'
    )
  );
  target_table text;
  expected text[];
  actual text[];
  rls_on boolean;
  grant_count integer;
  bad_roles text;
BEGIN
  FOR target_table IN SELECT jsonb_object_keys(expected_policies) LOOP

    -- (1) the table must exist
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION
        'ABORT: table public.% does not exist. The live schema differs from this repository; re-run the preflight snapshot.',
        target_table;
    END IF;

    -- (2) RLS must already be enabled, as the original migrations left it
    SELECT relrowsecurity INTO rls_on
      FROM pg_class
     WHERE oid = to_regclass(format('public.%I', target_table));
    IF NOT rls_on THEN
      RAISE EXCEPTION
        'ABORT: row-level security is OFF on public.%. Expected ON. Live state differs from the recorded baseline — inspect before proceeding.',
        target_table;
    END IF;

    -- (3) the policy set must match exactly: no missing, no extra
    SELECT array_agg(value ORDER BY value)
      INTO expected
      FROM jsonb_array_elements_text(expected_policies -> target_table);

    SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
      INTO actual
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = target_table;

    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION
        'ABORT: unexpected policy state on public.%. Expected [%], found [%]. Do not delete policies this repository did not create — snapshot and review first.',
        target_table,
        array_to_string(expected, ', '),
        array_to_string(actual, ', ');
    END IF;

    -- (4) every expected policy must still target the browser roles, and
    --     nothing else. A wider role list means someone changed it.
    SELECT string_agg(format('%s -> %s', policyname, roles::text), '; ')
      INTO bad_roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = target_table
       AND NOT (roles <@ ARRAY['anon', 'authenticated']::name[]);

    IF bad_roles IS NOT NULL THEN
      RAISE EXCEPTION
        'ABORT: policies on public.% grant roles beyond anon/authenticated (%). Review before revoking.',
        target_table, bad_roles;
    END IF;

    -- (5) the browser roles must still hold privileges — i.e. the exposure is
    --     genuinely still open. If not, something already changed it.
    SELECT count(*) INTO grant_count
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = target_table
       AND grantee IN ('anon', 'authenticated');

    IF grant_count = 0 THEN
      RAISE EXCEPTION
        'ABORT: anon/authenticated already hold no privileges on public.%. The baseline no longer matches — this may already be remediated. Snapshot and review.',
        target_table;
    END IF;

  END LOOP;

  RAISE NOTICE 'preconditions: tables, RLS, policy names, roles and grants match the recorded vulnerable baseline';
END $$;


DO $$
DECLARE
  expected_storage CONSTANT text[] :=
    ARRAY['invoices_delete', 'invoices_read', 'invoices_upload'];
  bucket_is_public boolean;
  actual_invoices_policies text[];
  broad_policies text;
BEGIN
  -- (6) the bucket must exist and must still be private
  SELECT public INTO bucket_is_public FROM storage.buckets WHERE id = 'invoices';

  IF bucket_is_public IS NULL THEN
    RAISE EXCEPTION
      'ABORT: storage bucket "invoices" does not exist. Live state differs from the recorded baseline.';
  END IF;

  IF bucket_is_public THEN
    RAISE EXCEPTION
      'ABORT: storage bucket "invoices" is PUBLIC. It was created private, so this was changed outside the repository. Set it private and re-run the preflight — do not let this migration mask that change.';
  END IF;

  -- (7) the policies that mention this bucket must be exactly the three known
  --     ones. Matching on the policy body means a differently-named policy
  --     that targets the same bucket is still caught.
  SELECT coalesce(array_agg(policyname ORDER BY policyname), ARRAY[]::text[])
    INTO actual_invoices_policies
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''invoices''%';

  IF actual_invoices_policies IS DISTINCT FROM expected_storage THEN
    RAISE EXCEPTION
      'ABORT: unexpected policy set referencing the invoices bucket. Expected [%], found [%]. Other buckets share storage.objects — review manually rather than deleting.',
      array_to_string(expected_storage, ', '),
      array_to_string(actual_invoices_policies, ', ');
  END IF;

  -- (8) a policy that grants a browser role without constraining bucket_id
  --     applies to EVERY bucket, including this one. Dropping our three would
  --     not close the exposure while such a policy exists, so stop and report.
  SELECT string_agg(format('%s (%s)', policyname, cmd), '; ')
    INTO broad_policies
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND (roles && ARRAY['anon', 'authenticated']::name[])
     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%bucket_id%';

  IF broad_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'ABORT: storage policies grant browser roles without restricting bucket_id (%). These apply to every bucket including "invoices" — resolve manually before locking down.',
      broad_policies;
  END IF;

  RAISE NOTICE 'preconditions: storage bucket private, exactly the three known invoices policies, no bucket-wide browser policies';
END $$;


-- ═════════════════════════════════════════════════════════════════════════
-- PART 2 — MUTATIONS. Only reached if every precondition above passed.
-- ═════════════════════════════════════════════════════════════════════════

-- Policies are dropped by exact name. Nothing is discovered and deleted
-- dynamically: the preconditions already proved these are the only policies
-- present on these tables.

DROP POLICY "anon_select_invoices" ON public.invoices;
DROP POLICY "anon_insert_invoices" ON public.invoices;
DROP POLICY "anon_update_invoices" ON public.invoices;
DROP POLICY "anon_delete_invoices" ON public.invoices;

DROP POLICY "select_emails" ON public.emails;
DROP POLICY "insert_emails" ON public.emails;
DROP POLICY "update_emails" ON public.emails;
DROP POLICY "delete_emails" ON public.emails;

DROP POLICY "select_email_attachments" ON public.email_attachments;
DROP POLICY "insert_email_attachments" ON public.email_attachments;
DROP POLICY "update_email_attachments" ON public.email_attachments;
DROP POLICY "delete_email_attachments" ON public.email_attachments;

-- RLS is already enabled (precondition 2). With no policy remaining, it now
-- denies every row to every non-bypassing role. The revokes below are the
-- second, independent layer.

REVOKE ALL PRIVILEGES ON TABLE public.invoices          FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.emails            FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.email_attachments FROM anon, authenticated;

-- Storage. Dropped by exact name so policies belonging to other buckets are
-- untouched; precondition 7 proved these three are the only ones referencing
-- the invoices bucket, and precondition 8 proved no bucket-wide policy exists.

DROP POLICY "invoices_upload" ON storage.objects;
DROP POLICY "invoices_read"   ON storage.objects;
DROP POLICY "invoices_delete" ON storage.objects;

-- service_role is untouched throughout: it holds its own grants and bypasses
-- RLS, so server-side automation continues to work.


-- ═════════════════════════════════════════════════════════════════════════
-- PART 3 — POST-APPLY VERIFICATION (comments; run by hand)
-- ═════════════════════════════════════════════════════════════════════════

/*
-- (a) Expect ZERO rows.
SELECT tablename, policyname, roles, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('invoices','emails','email_attachments')
   AND (roles && ARRAY['anon','authenticated']::name[]);

-- (b) Expect ZERO rows.
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name IN ('invoices','emails','email_attachments')
   AND grantee IN ('anon','authenticated');

-- (c) Expect rowsecurity = true for all three.
SELECT relname, relrowsecurity FROM pg_class
 WHERE relnamespace='public'::regnamespace
   AND relname IN ('invoices','emails','email_attachments');

-- (d) Expect ZERO rows referencing the invoices bucket.
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND (coalesce(qual,'')||' '||coalesce(with_check,'')) LIKE '%''invoices''%';

-- (e) Expect public = false.
SELECT id, public FROM storage.buckets WHERE id='invoices';

-- (f) BLOCKERS: everything this migration does NOT cover that still exposes a
--     browser role — including properties and property_units.
SELECT tablename, policyname, roles, cmd FROM pg_policies
 WHERE schemaname='public' AND (roles && ARRAY['anon','authenticated']::name[])
 ORDER BY tablename;

-- (g) Storage policies for other buckets — expect these to be UNCHANGED from
--     the preflight snapshot.
SELECT policyname, roles, cmd FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
*/
