# Archive

Source that is deliberately kept but is **not part of the deployed site**.

Nothing in this directory is served, routed, compiled or type-checked by the
guest-facing Next.js application:

- it is outside `public/`, so Next never serves it as a static asset;
- it is outside `app/`, so it produces no routes;
- it is listed in `tsconfig.json` `exclude`, so `tsc` skips it;
- `next build` never reads it.

## `admin-app/`

The internal property-management application (Vite + React + Supabase). It was
previously compiled into `public/admin/` and served publicly from `/admin` by a
redirect in `next.config.js`. Both are gone.

**Why it was withdrawn.** The compiled bundle was a public file. It contained
the Supabase project URL and anon key, and its login screen compared a typed
password against a constant in that same bundle. None of that was the real
problem: the database itself granted the `anon` role full `select`, `insert`,
`update` and `delete` on `invoices`, `emails` and `email_attachments`, plus read
and write on the private `invoices` storage bucket. The public key was
therefore sufficient to read or destroy the business data without ever loading
the admin app at all.

**What changed in this directory:**

- `dist/` — the compiled bundle was deleted, not archived. It had the anon key
  and the login constant baked into it, and a compiled artifact is not useful
  source material.
- `src/store/authStore.ts` — the hardcoded credential is gone and `login()`
  now always denies. See the comment in that file.
- `src/lib/supabaseClient.ts` — the hardcoded project URL and anon key are
  gone; configuration is required and the module throws without it.

**Before this can be deployed again**, all three of these must be true:

1. Real authentication — Supabase Auth, not a string comparison in the browser.
2. Real authorization — RLS policies keyed to an identity. The lockdown
   migration in `supabase/migrations/` currently denies browser roles outright,
   because the repository contains no identity or role model to write a correct
   policy against. That model has to be designed first.
3. A deployment target that is not the public marketing site.

Note that `src/store/dataStore.ts` also reads and writes `properties` and
`property_units`, which are **not** defined in `supabase/migrations/`. Their
schema and policies live only in the remote project, so the repository is not a
complete description of the database. The lockdown migration deliberately does
**not** touch them: they are recorded as production-audit blockers instead.

`src/data/mockData.ts` has been sanitized. It previously carried IBAN-shaped
strings, tenant names and 44 distinct email addresses whose authenticity could
not be confirmed. All of it is now unmistakably synthetic — `example.com`
addresses, fictional names, a structurally invalid IBAN and neutral placeholder
organisations. Git history was not rewritten; see the security document for why
that may still be necessary.
