# One Supabase project, shared with Cogniiq

**Decision (2026-09-21): BoLaGio and Cogniiq stay in the ONE existing Supabase
project.** This supersedes the "dedicated BoLaGio project" recommendation that
`docs/supabase-migration-runbook.md` §6 carried until now. Every BoLaGio
runbook, script and workflow is written for the shared project; nothing in
the repository assumes a second project any more.

Nothing in this document has been run against the real project. It is the
procedure, the files, and what each answer means.

---

## 1. The decision and what it costs

### Why one project

* **One bill, one dashboard, one set of operators.** The company runs one
  Supabase project today and the people who operate it are the same people.
* **Zero cross-project plumbing.** The Edge Function, `pg_cron`, `pg_net`
  and the operator allowlist live next to the data they work on.
* **The migrations were built for it anyway.** Every BoLaGio object is
  prefixed `bolagio_`, RLS is on with no policy, every browser grant is
  revoked, and no migration references a table it did not create
  (`tests/shared-project-sql.test.ts` makes that executable).

### What it costs — stated plainly

* **Blast radius.** The project holds unrelated finance and business tables
  (`invoices`, `emails`, `email_attachments`, `properties`,
  `property_units`; see `docs/security/2026-08-15-admin-exposure.md`). The
  `service_role` key is BYPASSRLS and holds ALL on every table in the
  project. **One service-role key reaches all data — guest bookings and
  Cogniiq's invoices and e-mails alike.** A leak of the worker's key or the
  Edge Function's key is a leak of the whole project. §4 below is the
  answer to that; it narrows, it does not remove.
* **GDPR.** Guest personal data (names, e-mails, phone numbers) is a
  distinct processing activity with its own purpose and processor list
  (PayPal, Beds24, Cloudflare, n8n). In one project the records of
  processing must describe two activities in one database; a subject-access
  or deletion request is answered from the `bolagio_*` tables only. This is
  a documentation and procedure burden, not a technical blocker. **Flag:**
  the records-of-processing entry for the shared project has not been
  written; whoever owns the Cogniiq data must be named as sharing the
  processor (Supabase).
* **Backups and restore.** A point-in-time restore for a booking incident
  also rolls back Cogniiq's tables, and the reverse. Before any restore,
  both owners must agree. A BoLaGio-only recovery uses the rollback scripts
  (`supabase/ops/rollback_2026092*.sql`), never a project restore.
* **Shared quotas.** Connection pool, compute, egress and the `pg_cron`
  scheduler are shared. The BoLaGio schedule is two jobs every 3 and 30
  minutes with `SKIP LOCKED` claiming; it is light, but it is not zero.
* **Name space discipline forever.** Every future BoLaGio object must be
  `bolagio_*`, and every Cogniiq object must not be. The preflight (§2, step
  2) refuses to run when a `bolagio_*` object exists that no BoLaGio
  migration created.

### What BoLaGio never does to Cogniiq's objects

No BoLaGio migration, script or workflow creates, alters, drops, grants or
revokes anything that is not `bolagio_*` — with one exception that is not
Cogniiq's: `create extension if not exists btree_gist` in the foundation
migration (an extension, in `public`, used by the no-overlap constraint).
`supabase/ops/shared_project_hardening.sql` (§3) is a *named, per-object script* that
the owner of the unrelated tables may apply; no BoLaGio runbook depends on
it or runs it.

---

## 2. Installation, in order

The staging script `ops/staging/migrate.sh` runs exactly this sequence and
refuses on any failure; the commands are listed so the same thing can be done
by hand, and so production (where the script never runs) follows the same
order. Take a Supabase backup first (Dashboard → Database → Backups).

| Step | File | Command | Stop if |
|---|---|---|---|
| 1 | `supabase/ops/shared_project_inventory.sql` | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v format=unaligned -f supabase/ops/shared_project_inventory.sql > inventory-before.txt` | — (read-only; keep the file) |
| 2 | `supabase/ops/shared_project_preflight.sql` | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_preflight.sql` | exit ≠ 0: a name collision, a missing role, or a later migration applied without an earlier one |
| 3 | the six migrations, **each in its own transaction, each its own psql invocation** | see below | `STOP at <file>` — the transaction rolled back; the database is as the previous file left it |
| 4 | `supabase/seed/bolagio_booking_units.sql` | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/bolagio_booking_units.sql` | — (idempotent; leaves `is_bookable = false`) |
| 5 | `supabase/ops/shared_project_verify.sql` | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_verify.sql` | any `VERIFY FAILED` |
| 6 | inventory again, and diff | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v format=unaligned -f supabase/ops/shared_project_inventory.sql > inventory-after.txt && diff -u inventory-before.txt inventory-after.txt` | any changed line that does not name a `bolagio_*` object or `btree_gist` |

Step 3, the migrations:

```bash
for f in supabase/migrations/20260916120000_booking_foundation.sql \
         supabase/migrations/20260917100000_booking_core_states.sql \
         supabase/migrations/20260917110000_booking_core_hardening.sql \
         supabase/migrations/20260919120000_admin_operators.sql \
         supabase/migrations/20260920120000_booking_production_hardening.sql \
         supabase/migrations/20260921120000_platform_completion.sql; do
  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f "$f" || { echo "STOP at $f"; break; }
done
```

`-1` wraps **one file** in one transaction. Never wrap several files: #2
adds enum values with `alter type … add value`, which cannot be used in the
same transaction, so #2 must COMMIT before #3 runs. The Supabase CLI
(`supabase db push`) also runs one file per transaction and satisfies this.

The diff in step 6 **is the blast-radius proof**. Keep `inventory-before.txt`,
`inventory-after.txt` and the diff with the change record. The staging
script additionally greps the diff and exits 1 if any changed line names
something other than a `bolagio_*` object, `btree_gist`, a header or a row
count.

Re-running: every migration statement is idempotent. The preflight passes on
an already-migrated project, and `ops/staging/migrate.sh` skips a file whose
applied-marker is present (`FORCE_REAPPLY=yes` overrides).

---

## 3. The inventory's risk report

`shared_project_inventory.sql` prints eleven catalog sections (schemas,
BoLaGio tables, unrelated tables, policies, grants to `anon`/`authenticated`,
default privileges, functions, views, storage, auth dependencies,
extensions, `pg_cron` jobs, roles) and ends with a **RISK REPORT**: one row
per finding, four columns —

```
severity | object | finding | recommended_action
```

— ordered CRITICAL → HIGH → MEDIUM → INFO, followed by a count per severity.
The rules, exactly as the script applies them (schema `public`, plus
`storage` policies):

| Severity | Rule |
|---|---|
| CRITICAL | table without RLS on which `anon`/`authenticated` hold any privilege — the public anon key reads/writes every row |
| CRITICAL | `bolagio_*` table with any `anon`/`authenticated` grant, or with RLS off (the migrations set the opposite; something changed it) |
| HIGH | RLS on but a permissive policy grants `anon` (or PUBLIC) |
| HIGH | SECURITY DEFINER function without a fixed `search_path` |
| HIGH | `anon` can EXECUTE a function that mutates (name `insert%`/`update%`/`delete%`/`set%`/`create%`, or VOLATILE) |
| MEDIUM | RLS on, no policy, but `anon`/`authenticated` still hold table grants (harmless today; one policy away from exposure) |
| INFO | `anon` can EXECUTE a trigger function or an IMMUTABLE/STABLE helper (Postgres' PUBLIC default; no data access; a trigger function is not callable through PostgREST) |
| INFO | `storage.objects` policy for `anon`/`authenticated` |
| INFO | unrelated table with an `authenticated`-only policy on RLS — check the predicate names an identity (`auth.uid()`), not `using (true)` |

Functions that belong to an extension (`btree_gist`, `pg_net`, …) are excluded
from the function rules.

Reading it:

* **No CRITICAL/HIGH row** — nothing to fix before applying the BoLaGio
  migrations.
* **A CRITICAL/HIGH row on a `bolagio_*` object** — a BoLaGio bug or a
  manual change; fix it before going further (the action column says how).
* **A CRITICAL/HIGH row on an unrelated table** — Cogniiq's exposure, not
  BoLaGio's. It is the input to `shared_project_hardening.sql` (next
  section) and does **not** block the BoLaGio migrations, which neither
  widen nor narrow it.

The inventory prints catalog metadata only: no row data, no secret, no key.
Run it with `-v format=unaligned` when the output is meant for `diff`.

### The hardening proposal

`supabase/ops/shared_project_hardening.sql` is a **named, per-object script for the owner
of the unrelated tables**. For each table the operator lists, and only those,
it runs `alter table … enable row level security` and `revoke all on table …
from anon, authenticated`. It drops no policy, alters no column, leaves
`service_role` untouched, refuses any `bolagio_*` table, and knows no Cogniiq
table name — the list comes from the person reading the inventory.

Three locks: the first statement raises unless the session set
`bolagio.hardening_confirmed = 'I have read the inventory'`; nothing happens
without `-v tables='…'`; and it is a dry run unless `-v apply=yes`. The dry
run prints the exact statements and the exact undo. The header of the file
carries the commands.

**No BoLaGio runbook depends on it.** `ops/staging/migrate.sh` does not run
it; the CI does not run it; the verify does not assert it. A client of the
listed tables that still uses the anon key breaks when it is applied — which
is the point, and why the decision is the table owner's.

---

## 4. Service-role possession

The `service_role` JWT bypasses RLS and holds ALL on every table in the
project. Possession of it is possession of everything in §1's blast radius.
The rule is: as few holders as possible, each with a reason.

### May hold `SUPABASE_SERVICE_ROLE_KEY`

| Holder | Why | Set with |
|---|---|---|
| The Cloudflare worker (`bolagio-preview` never; `bolagio-staging`, `bolagio`) | the application's only database path is `supabase-js` → PostgREST; every read and write goes through it (`lib/booking/config.ts` `supabaseConfig()`) | `wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env <staging\|production>` |
| The Supabase Edge Function `paypal-webhook` | it stores the verified webhook through `bolagio_record_payment_event`; Supabase **injects** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` into every Edge Function automatically — nothing to set, nothing to rotate by hand | automatic |

A preview deployment holds **no** database key at all (`docs/environments.md`
§1: Supabase project "none"; `DEMO_WITH_DATABASE` warns if one is present).

### Must never hold it

* the **browser** — nothing named `NEXT_PUBLIC_*` may carry it;
  `lib/booking/config.ts` is `server-only` so importing it from a client
  component is a build error; `ops/staging/validate-staging-config.mjs`
  refuses any `NEXT_PUBLIC_` variable
* **client bundles**, including the archived admin app (`archive/admin-app/`,
  never built)
* **n8n** — the n8n package talks only to the worker's signed internal API
  (`N8N_INTERNAL_SECRET` HMAC); it has no Supabase credential and must never
  get one (`n8n/credentials-matrix.md`)
* **CI** — `.github/workflows/ci.yml` runs against the local stack
  (`scripts/test-stack.sh`), which mints its own throwaway JWT; the two live
  workflows hold a Beds24 token only, scoped to one step
* **logs** — `lib/booking/config.ts`, `scripts/check-env.mjs`,
  `ops/staging/*.sh` and the health endpoint print variable **names**, never
  values
* **dotenv files committed anywhere** — `.env`, `.env*.local`, `.dev.vars*`
  are git-ignored; `ops/staging/.env.staging.example` carries placeholders
  only, and the validator refuses a file that still has one
* a developer's laptop, beyond the moment of `wrangler secret put`

Rotation: Dashboard → Settings → API → "Generate new JWT secret" rotates
**every** key in the project, Cogniiq's clients included; coordinate with the
other owner. After it, `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY` on each worker; the Edge Function picks the new injected
key up on its next cold start (redeploy it to be sure).

### Evaluation of narrower access

Three ways the worker could hold something less than the whole project were
evaluated. One is recommended as optional hardening; two are rejected.

#### (1) SECURITY DEFINER RPC façade — rejected for now

Idea: expose every write as a `SECURITY DEFINER` function that a low-privilege
role calls, so the worker holds a key that cannot touch tables directly.

Rejected because it **adds** privilege (functions running as their owner,
each one a `search_path` and argument-validation surface the inventory flags
as HIGH when unfixed) **without removing key possession**: the worker would
still hold a JWT, and the question is what that JWT reaches, which (2)
answers directly. The command functions (`bolagio_booking_transition`,
`bolagio_record_payment_capture`, `bolagio_begin_external_operation`, …) are
already the only write path for state that matters — they are `SECURITY
INVOKER` with a fixed `search_path`, executable by `service_role` only — so
a façade would duplicate what exists. Revisit only if a second, less trusted
caller ever needs database access.

#### (2) A dedicated `bolagio_app` Postgres role via JWT — RECOMMENDED, optional

`supabase/ops/bolagio_app_role.sql` creates a role that can reach **only the
`bolagio_*` objects**: NOLOGIN, NOBYPASSRLS, not superuser; S/I/U/D on every
`bolagio_*` table, SELECT on every `bolagio_*` view, EXECUTE on every
non-trigger `bolagio_*` function, one permissive policy `bolagio_app_all`
per `bolagio_*` table (`to bolagio_app using (true) with check (true)`), and
**nothing** on any other table — ever. PostgREST switches `authenticator` to
it exactly as it does for `anon`, `authenticated` and `service_role`,
because the JWT's `role` claim names it.

Steps:

1. **Apply the SQL** (idempotent; re-run after every migration that adds a
   table or function, because grants and policies are per object):
   ```bash
   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/bolagio_app_role.sql
   ```
   It ends with its own verification and raises on any deviation.
2. **Mint a JWT** with `role=bolagio_app`, signed with the project's JWT
   secret (Dashboard → Settings → API → "JWT Secret"). The same one-liner
   `scripts/test-stack.sh` uses for its stack (`mint_jwt`), with a long
   `exp`; the secret is read from the environment and never typed into a
   file:
   ```bash
   SUPABASE_JWT_SECRET='<paste from the dashboard, then unset it>' node -e '
     const secret = process.env.SUPABASE_JWT_SECRET, role = "bolagio_app";
     const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
     const header = b64({ alg: "HS256", typ: "JWT" });
     const payload = b64({ role, iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: 4102444800 });
     const sig = require("crypto").createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
     process.stdout.write(`${header}.${payload}.${sig}\n`);
   '
   unset SUPABASE_JWT_SECRET
   ```
   (`exp` 4102444800 = 2100-01-01. Shorten it if a rotation cadence is
   wanted; the worker fails closed when it expires.)
3. **Set it as the worker's `SUPABASE_SERVICE_ROLE_KEY`**:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging   # paste the JWT
   ```
   **The application needs no code change.** `supabaseConfig()` passes the
   value to `supabase-js` as the bearer; PostgREST reads the `role` claim.
   The variable keeps its name so the environment matrix, the validator and
   the health endpoint are unchanged.
4. **Keep the Edge Function on its injected service key.** Its scope is one
   RPC (`bolagio_record_payment_event`) plus a best-effort
   `bolagio_observe_integration`; Supabase injects the key and a custom
   secret named `SUPABASE_SERVICE_ROLE_KEY` cannot be set on an Edge Function
   anyway (reserved prefix).
5. **Verify**: `ops/staging/health-check.sh` (a 503 means the JWT does not
   reach the tables), then
   `psql "$DATABASE_URL" -f supabase/ops/shared_project_verify.sql`.

What it protects: **a leaked worker key cannot read, write or list Cogniiq's
tables.** `invoices`, `emails`, `email_attachments`, `properties`,
`property_units` and any future unrelated table are unreachable with it —
no grant, no policy, no RLS bypass. The blast radius of a worker-key leak
becomes "the BoLaGio tables", which is what a dedicated project would have
given, for that key.

What it does **not** protect: **all guest data is still reachable** — every
booking, every guest name, e-mail and phone number, the operator table, the
audit log. The role holds full S/I/U/D on all of it because the application
needs that. It also does not narrow the Edge Function's key (still
`service_role`), the Dashboard, or the direct database password. It is a
smaller key, not a smaller project.

How `shared_project_verify.sql` accounts for it: §A asserts every `bolagio_*`
table has RLS on, no browser privilege, and **no policy except one whose
role list is exactly `{bolagio_app}`**; any policy for any other role fails
the verify. §E runs only when the role exists: NOLOGIN / NOBYPASSRLS / not
superuser, no privilege on any non-`bolagio_` table, no explicit EXECUTE on
any non-`bolagio_` function; and it **warns** (does not fail) for each
`bolagio_*` table that lacks the `bolagio_app_all` policy — the sign to
re-run `bolagio_app_role.sql` after a migration. When the role does not
exist, §E asserts there is no policy on any `bolagio_*` table at all. The
inventory's risk rules never flag `bolagio_app_all`: it names neither `anon`
nor `authenticated` nor PUBLIC.

Trade-off: one more artefact to keep in step (re-run the SQL after each
migration; the verify tells you when you forgot), and a JWT you mint
yourself instead of one the dashboard shows. Both small. The n8n and CI
positions are unchanged: neither holds any key.

#### (3) A restricted direct database connection — rejected

Idea: give the worker a Postgres user with grants on `bolagio_*` only, over a
direct connection.

Rejected: the application speaks PostgREST through `supabase-js`, not the
wire protocol; the local test stack (`scripts/test-stack.sh`) exists to
exercise exactly that path. A Cloudflare Worker also has no persistent TCP
connection to pool; the Supabase pooler would be another component with its
own credential. Everything (3) would achieve, (2) achieves through the path
the application already uses.

---

## 5. Checklist for the change record

- [ ] `inventory-before.txt` (step 1) kept
- [ ] preflight exit 0 (step 2), output kept
- [ ] six migrations applied, one transaction each, no `STOP`
- [ ] seed applied; every unit still `is_bookable = false`
- [ ] verify passed (step 5), output kept
- [ ] `inventory-after.txt` and the diff kept; every changed line names a `bolagio_*` object or `btree_gist`
- [ ] the risk report's CRITICAL/HIGH rows closed with `shared_project_hardening.sql`, verified, per `docs/security/2026-09-20-shared-project-hardening.md` — **before** the BoLaGio chain
- [ ] optional: `bolagio_app_role.sql` applied, JWT minted and set, health check 200, verify passed with "bolagio_app is installed"
- [ ] records-of-processing entry for the shared project (flagged in §1) written or scheduled
