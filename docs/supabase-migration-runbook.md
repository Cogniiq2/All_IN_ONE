# Supabase migration runbook

**Nothing in this document has been run against production.** It is the exact
procedure, the SQL to run before and after, and what each answer means.

## 1. The migrations, in order

| # | File | Transaction note |
|---|---|---|
| 1 | `20260916120000_booking_foundation.sql` | creates `btree_gist`, the enums, the tables, RLS |
| 2 | `20260917100000_booking_core_states.sql` | **adds enum values only. Must COMMIT before #3** (a value added with `alter type … add value` cannot be used in the same transaction) |
| 3 | `20260917110000_booking_core_hardening.sql` | functions, trigger, outbox, inbox, operations, jobs, views, grants |
| 4 | `20260919120000_admin_operators.sql` | operators, audit log |
| 5 | `20260920120000_booking_production_hardening.sql` | payment edges, retry guard (replaces one function signature), heartbeat, unit clock, turnovers, guest events, views |

Not BoLaGio, do not run for the website: `20260612*` (archived admin app) and
`20260815120000_lockdown_revoke_anon_access.sql` (one-shot, precondition-guarded,
belongs to the shared-project clean-up — see §6).

The Supabase CLI runs each file in its own transaction, which satisfies the
note on #2. With `psql`, run each file separately, **not** with `-1` across
files.

Then the seed, by hand, once: `supabase/seed/bolagio_booking_units.sql`
(idempotent; leaves `is_bookable = false`).

## 2. Preflight (read-only)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/preflight.sql
```

| Section | Expected on a fresh production project | Stop if |
|---|---|---|
| 1 | Postgres 15/17, `btree_gist` absent or installed, `pg_cron` available | Postgres < 14 |
| 2 | `anon`, `authenticated`, `service_role` present | any missing (not a Supabase project) |
| 3 | every migration "not applied" | a later one applied without an earlier one |
| 5 | zero rows everywhere; zero `outcome_unknown`; zero in-flight | in-flight > 0 (wait a minute) or `outcome_unknown` > 0 (reconcile first) |
| 6 | old 5-arg function present only if #3 is applied | — |
| 7/8 | RLS true, 0 policies, 0 browser grants on every `bolagio_*` table | any browser grant |
| 9 | lists the unrelated tables in the shared project | **record it** — this is the blast-radius evidence for §6 |

## 3. Apply

Take a Supabase backup (Dashboard → Database → Backups, or `pg_dump`) first.

```bash
for f in supabase/migrations/20260916120000_booking_foundation.sql \
         supabase/migrations/20260917100000_booking_core_states.sql \
         supabase/migrations/20260917110000_booking_core_hardening.sql \
         supabase/migrations/20260919120000_admin_operators.sql \
         supabase/migrations/20260920120000_booking_production_hardening.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "STOP at $f"; break; }
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/bolagio_booking_units.sql
```

Lock implications: #5 drops and recreates one function and one partial index.
Both are sub-second on an empty or small table. Apply with direct booking off
(it is) so no request is mid-`trackedCall`.

**Failure half way:** each statement in these files is idempotent
(`if not exists`, `create or replace`, `do $$ … exception when duplicate_object`).
Re-run the same file; it continues. The one exception is #5's function drop +
create: if the process dies between them the 5-arg function is gone and the
6-arg one missing — re-running #5 fixes it, and the application fails closed
in the meantime (every external mutation refused, nothing half-done).

## 4. Verify

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/verify.sql
```

Every line must read `ok — …`; the script raises on the first failure and
ends with `verification passed`. It also prints the queue view, the
scheduler status (empty until the schedule runs) and the attention count.

Then, after the worker is deployed: the System page → Configuration shows no
contradictions; after the schedule is created (`docs/schedulers.md`) the
Schedulers section shows three jobs.

## 5. Rollback / recovery

* #5 only: `psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260920.sql`.
  Roll the **application** back first or at the same time; see
  `docs/cloudflare-deployment.md` §4.
* Anything earlier: restore the backup. The earlier migrations were never
  designed to be reversed individually and the tables would carry data.
* Proven on a throwaway cluster by `scripts/db-ops-check.sh`
  (preflight → apply → verify → rollback → re-apply twice → verify).

## 6. Stay in the shared project, or a dedicated one?

**Recommendation: a dedicated BoLaGio Supabase project for production, now,
before the first migration is applied there.** Reasons, in order of weight:

1. **Blast radius.** The existing project holds unrelated finance and business
   tables, some with RLS disabled and some with browser-role policies
   (`docs/security/2026-08-15-admin-exposure.md`). One service-role key
   reaches all of it. The booking system's key lives in Cloudflare and in a
   Supabase Edge Function; a leak of either would expose invoices and emails
   that have nothing to do with bookings. Separation makes the worst case
   "guest booking data", not "the company".
2. **GDPR.** Guest names, emails and phone numbers are a distinct processing
   activity with its own purpose, retention and processor list (PayPal,
   Beds24, Cloudflare). A dedicated project makes the data map honest and a
   subject-access or deletion request answerable without touching finance
   data.
3. **Backups and recovery.** A restore for a booking incident must not roll
   back accounting data, and the reverse.
4. **Operational clarity.** `pg_cron` jobs, the Edge Function, database
   settings (`app.booking_sync_secret`) and the operator allowlist all belong
   to one product.
5. **Cost.** One additional Pro project. Small against a single overbooking.
6. **Migration effort.** Zero data to move: the booking tables do not exist in
   production yet. Every object is prefixed `bolagio_` and every migration is
   self-contained; the repository already assumes its own project through
   `SUPABASE_URL`. Moving later, with live bookings, would be a real
   migration. Moving now is a URL.

The repository is arranged for this: nothing in the website references a
non-`bolagio_` table, `archive/` and the two 2026-06 migrations are excluded
from every script, and the environment matrix assigns one project per
environment. The only decision needed is the project itself.

If the shared project is kept regardless: apply
`20260815120000_lockdown_revoke_anon_access.sql` after its preflight first,
and treat preflight §9's list as the audit backlog.
