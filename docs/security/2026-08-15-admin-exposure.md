# Admin exposure — findings, remediation and rollback

Date: 2026-08-15
Scope: repository only. Nothing in the remote Supabase project, n8n, Stripe,
PayPal or Netlify was contacted or changed.

---

## 1. What was exposed

The compiled admin application was a public static file set at `public/admin/`,
reachable at `/admin` via a redirect in `next.config.js`. Its bundle contained
the Supabase project URL and the anon key, and its login screen compared a typed
password against a constant in the same bundle.

**The bundle was not the vulnerability.** The anon key is public by design. The
vulnerability is in the database: two migrations gave the `anon` role
unrestricted access to private business data, so the published key was all
anyone needed — with or without the admin app.

| Data | Role | Operations permitted | Source |
|---|---|---|---|
| `invoices` (metadata: file path, name, MIME type, status) | `anon`, `authenticated` | SELECT, INSERT, UPDATE, DELETE — all `USING (true)` | `20260612060328` |
| `emails` (account address, sender, subject, **full body text**, supplier, received time) | `anon`, `authenticated` | SELECT, INSERT, UPDATE, DELETE — all `USING (true)` | `20260612141823` |
| `email_attachments` (file name, path, MIME type, size, invoice link) | `anon`, `authenticated` | SELECT, INSERT, UPDATE, DELETE — all `USING (true)` | `20260612141823` |
| `storage.objects` in the private `invoices` bucket (the invoice files themselves) | `anon`, `authenticated` | INSERT, SELECT, DELETE | `20260612060328` |
| `properties`, `property_units` | unknown | unknown — no migration in this repository | remote only — **audit blocker, NOT touched by the migration** |

Reads, writes **and deletes** were all permitted. There was no ownership
predicate anywhere: every policy was `USING (true)`, so no row was protected
from any holder of the public key.

The bucket itself was correctly created private (`public = false`), so files
were not served over unauthenticated HTTP — but the `invoices_read` policy let
the anon role generate access to them through the API, which reaches the same
outcome.

## 2. Is this only in the migrations, or does application code reproduce it?

Both. It is not a stale migration.

`archive/admin-app/src/` actively exercised the permissions:

- `store/emailStore.ts` — `SELECT *` from `emails`; `SELECT` from `email_attachments`
- `components/ui/UploadModal.tsx` — `storage.from('invoices').upload(...)` and `INSERT` into `invoices`
- `components/emails/AttachmentCard.tsx` — `INSERT` into `invoices`
- `store/dataStore.ts` — `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `properties` and `property_units`

So the live application depended on exactly the permissions that must be
revoked. That is why the app is archived rather than merely unpublished.

## 3. Secrets

No secret values are reproduced here.

| Type | Location | Rotation required? |
|---|---|---|
| Supabase **anon** key | `archive/admin-app/src/lib/supabaseClient.ts` (removed), the compiled bundles in `public/admin/` and `admin/dist/` (both deleted) | **No.** Public by design. Rotating it does not fix authorization and would only break clients. Fix the permissions instead. |
| Admin password constant | `archive/admin-app/src/store/authStore.ts` (removed), compiled bundles (deleted), and one quotation in `docs/bolagio-condition-report.html` (redacted) | **Yes, if reused anywhere else.** It was published in a public JavaScript file, so treat it as compromised wherever else it appears — it must not survive as anyone's password on any other system. |
| Supabase **service_role** key | not present | n/a — searched all tracked files and build output; no `service_role` key or reference exists in the repository. |

## 4. Is sensitive data committed to Git?

`archive/admin-app/src/data/mockData.ts` was labelled mock data but contained
IBAN-shaped strings, tenant name fields, 44 distinct email addresses — personal
mailbox providers among them — and the names of real local businesses, a bank,
a utility, an insurer and a tax office.

Whether any of it was real could **not be confirmed from the repository**, so it
was treated as potentially real. The fixtures have been replaced in the current
tree with unmistakably synthetic values: `example.com` addresses (a domain
reserved by RFC 2606 and unroutable), canonical fictional German names, a
structurally invalid IBAN (`DE00 …`, whose check digits can never validate),
`Musterstraße`/`Musterstadt` addresses, and neutral placeholder organisation
names. No real-looking tenant, supplier, bank or authority data remains.

**Git history was deliberately not rewritten in this task.** If any removed
value was real, or if this repository was ever publicly accessible, then history
remediation is still required and is not optional: the values remain reachable
in earlier commits, in any existing clone, and in any fork or cache. That is a
decision for the owners — it needs a coordinated force-push and invalidates
every outstanding clone.

The database contents themselves were never committed; only this fixture file.

## 5. Repository remediation applied

- `public/admin/` deleted — the publicly served compiled application.
- `admin/dist/` deleted — same bundle, same embedded key and password. A
  compiled artifact is not useful source, so it was not archived.
- `admin/` → `archive/admin-app/` — outside `public/`, outside `app/`, excluded
  in `tsconfig.json`, never read by `next build`.
- `/admin` redirect removed from `next.config.js`.
- `authStore.ts` — credential removed; `login()` now always denies; the
  `isAuthenticated` flag is no longer persisted (it could previously be set by
  hand in devtools to bypass the screen entirely).
- `supabaseClient.ts` — hardcoded URL and key removed; configuration required;
  throws without it.
- `lib/supabase.ts` deleted from the guest app. It constructed an anon client
  and was imported by nothing — a dangling data-access surface.
- `robots.txt` — `/admin` disallow removed. It is not access control, it
  advertised the path, and it would have prevented crawlers from seeing the new
  404 and dropping the URLs.

## 5a. Scope of the prepared migration

The executable migration covers **only** `invoices`, `emails`,
`email_attachments` and the three named `invoices`-bucket storage policies.

`properties` and `property_units` were **removed** from it. Their migrations are
absent from this repository, their purpose is undocumented and their live
policies are unknown; a migration written from incomplete evidence must not
modify them. They are production-audit blockers — see the preflight below.

The migration also refuses to run against anything other than the exact
vulnerable state recorded here. Unexpected policies, missing policies, RLS
already disabled, a bucket that has been made public, or a storage policy that
grants a browser role without constraining `bucket_id` all cause an abort before
any change is made. Unknown state is reported for review, never deleted.

## 6. Pre-flight checks before applying the migration

The migration revokes `anon` and `authenticated` access. Confirm each of these
first, because the repository cannot answer them:

0. **Capture a read-only snapshot first** (queries in section 6a), inspect it,
   and confirm the migration matches what it shows. The migration will abort on
   any mismatch, but the snapshot is what tells you *why*.
1. **Which key does the n8n automation use?** The workflows at
   `n8n.cogniiq.co` write invoice and email rows. If they authenticate with the
   **service_role** key they are unaffected — that role bypasses RLS. If they
   use the **anon** key, they will break the moment this is applied, and they
   must be moved to the service key first. This is the single blocking check.
2. **Is anything else using the anon key against these tables?** Run query (f)
   from the foot of the migration to sweep for policies this file does not
   cover.
3. **Does `properties` / `property_units` back anything other than the admin
   app?** They have no migration here, so their remote definition is unknown.
4. **Take a backup / note the current policy set** so the rollback below is
   accurate rather than reconstructed from this repository.


## 6a. Read-only production preflight (run first, change nothing)

Every statement below is a `SELECT`. Run them against production, save the
output, and inspect it before requesting authorization to apply anything.

```sql
-- 1. Policies on the three target tables. Expect exactly 12, named as recorded.
SELECT tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('invoices','emails','email_attachments')
 ORDER BY tablename, policyname;

-- 2. Table privileges held by the browser roles.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('invoices','emails','email_attachments')
   AND grantee IN ('anon','authenticated')
 ORDER BY table_name, grantee;

-- 3. RLS state. Expect all true.
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relname IN ('invoices','emails','email_attachments');

-- 4. BLOCKERS — every other table in public that exposes a browser role.
--    properties and property_units are expected to appear here.
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename NOT IN ('invoices','emails','email_attachments')
   AND (roles && ARRAY['anon','authenticated']::name[])
 ORDER BY tablename;

-- 5. ALL storage policies, for every bucket. This is the baseline that the
--    post-apply check is compared against, to prove unrelated buckets were
--    not touched.
SELECT policyname, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
 ORDER BY policyname;

-- 6. Bucket configuration.
SELECT id, name, public, file_size_limit, allowed_mime_types
  FROM storage.buckets ORDER BY id;

-- 7. Functions and views that could bypass RLS (SECURITY DEFINER runs as its
--    owner). Expect none relating to these tables.
SELECT n.nspname, p.proname, p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','storage') AND p.prosecdef
 ORDER BY 1,2;

SELECT table_schema, table_name
  FROM information_schema.views
 WHERE table_schema = 'public';

-- 8. Which roles exist and which bypass RLS.
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
 WHERE rolname IN ('anon','authenticated','service_role','postgres');
```

Decision rule: if query 1 returns anything other than the twelve recorded
policies, or query 5 shows a storage policy for a browser role that does not
constrain `bucket_id`, **do not apply the migration**. It will abort anyway —
but the snapshot is what makes the abort actionable.

## 7. Rollback plan — DO NOT RUN AUTOMATICALLY

This is documentation, deliberately kept out of `supabase/migrations/` and out
of any `.sql` file so that no tooling can pick it up and apply it.

Restoring these policies re-opens the exposure described in section 1. It
should only ever be a temporary measure to keep an operational system running
while a proper fix is built, and never a resting state.

```sql
-- ROLLBACK — restores the previous (insecure) permissions.
-- Re-grants full anonymous read/write/delete on private business data.

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_invoices" ON public.invoices FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_invoices" ON public.invoices FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_invoices" ON public.invoices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_invoices" ON public.invoices FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_emails" ON public.emails FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_emails" ON public.emails FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_emails" ON public.emails FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_emails" ON public.emails FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_email_attachments" ON public.email_attachments FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_email_attachments" ON public.email_attachments FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_email_attachments" ON public.email_attachments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_email_attachments" ON public.email_attachments FOR DELETE
  TO anon, authenticated USING (true);

CREATE POLICY "invoices_upload" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "invoices_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'invoices');
CREATE POLICY "invoices_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'invoices');

-- Table privileges are restored by Supabase's standard grants:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_attachments TO anon, authenticated;
```

Note: `properties` and `property_units` are **not** in this rollback. Their
original policies are not recorded anywhere in this repository, so they must be
captured from the live project before applying the migration if a rollback for
them is wanted.


## 8. What actually closes this — and what does not

Two independent problems exist. Fixing one does not fix the other.

**Redeploying the site removes the public admin application.** The compiled app
and the `/admin` route are gone from this repository, so the next deployment
stops serving them. Until that deployment happens, the current production build
still serves the admin bundle at `/admin`.

**Redeploying alone does not close the database exposure.** The RLS policies
live in the database, not in the frontend. Anyone who already has the project
URL and anon key — which were public — can query `invoices`, `emails` and
`email_attachments` directly against the Supabase API without ever loading the
admin app. Removing the frontend removes a convenience, not the access.

**The published values do not become unpublished.** The project URL and anon
key were served in a public JavaScript file. They may persist in browser and
CDN caches, in archived copies, in anyone's downloads, and in this repository's
Git history. There is no action that retroactively unpublishes them.

**That is not a reason to rotate the anon key as the fix.** The anon key is
designed to be public and every browser client holds one. Rotating it changes
which public string is public; it does not change what that string is permitted
to do. If authorization is broken, a new key is broken in exactly the same way
the moment it ships. Repair the authorization.

**The safe outcome requires both:**

1. Frontend — the admin application is no longer published (this commit, plus a
   deployment).
2. Database — `anon` and `authenticated` are denied on the private tables and
   the private bucket (the prepared migration, after the preflight).

Neither is sufficient alone. Until step 2 is applied, the exposure is live
regardless of what the website serves.

## 9. What must be designed before an admin can exist again

The migration denies browser roles outright rather than writing an
`authenticated` policy, because every input a correct policy needs is missing:

1. **Identity** — no auth provider is configured, no users exist, no sign-in
   flow. Supabase Auth is the obvious answer but has not been set up.
2. **Who counts as an admin** — there is no role claim, no `admins` table, no
   allowlist. Without one, `authenticated` means "anyone who registered".
3. **Scope of access** — single-tenant (everyone who is an admin sees
   everything) or per-property? The `properties` table implies the second is at
   least possible; the answer changes every policy.
4. **Storage** — signed URLs issued server-side, or an RLS policy on
   `storage.objects` keyed to the same identity? Signed URLs are usually the
   better answer for private documents.
5. **Deployment target** — the rebuilt admin must not be served from the
   marketing site. A separate host, or behind an authenticating proxy.
6. **Whether the anon key should reach these tables at all.** It probably
   should not: an admin surface is better served by an authenticated
   server-side session than by a browser client holding a public key.
