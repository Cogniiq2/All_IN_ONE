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
| 6 | `20260921120000_platform_completion.sql` | same-state transitions carry their patch; cancellation/refund state with invariants; message-delivery ledger; turnover status/events; unit timing columns, check-out and invoice events, injectable clock (**replaces `bolagio_sync_turnovers` and `bolagio_emit_guest_events` with a trailing `timestamptz` parameter**); integration health; gapless invoice sequences. Rollback: `supabase/ops/rollback_20260921.sql` |
| 7 | `20260922120000_finance_foundation.sql` | the finance subledger (`docs/finance/`). Rollback: `rollback_20260922.sql` |
| 8 | `20260923120000_reservation_import.sql` | `bolagio_reservations`. Rollback: `rollback_20260923.sql` |
| 9 | `20260924120000_guest_privileges.sql` | returning-guest identities and privileges |
| 10 | `20260925120000_legal_compliance.sql` | terms evidence on intents, double opt-in columns. Rollback: `rollback_20260925.sql` |
| 11 | `20260926120000_booking_com_finance_statement.sql` | Booking.com settlements and payouts. Rollback: `rollback_20260926.sql` |
| 12 | `20260927120000_finance_ingestion_pipeline.sql` | finance ingestion queue, two enqueue triggers, pipeline status view; queues the backfill as its last statement. Additive; writes no booking row. Rollback: `rollback_20260927.sql` (**first**, before any older rollback) — `docs/finance/live-data-pipeline.md` |

On the shared project (2026-09-26, checked read-only) #1–#11 are applied; #12 is not.

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
         supabase/migrations/20260920120000_booking_production_hardening.sql \
         supabase/migrations/20260921120000_platform_completion.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "STOP at $f"; break; }
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/bolagio_booking_units.sql
```

In the shared project (§6) run the same six files with `-1` each, between the
shared-project preflight and verify — the sequence is in §6.

Lock implications: #5 drops and recreates one function and one partial index;
#6 drops and recreates two functions (`bolagio_sync_turnovers`,
`bolagio_emit_guest_events`) and adds columns to `bolagio_booking_intents` and
`bolagio_units`. All sub-second on an empty or small table. Apply with direct
booking off (it is) so no request is mid-`trackedCall`.

**Failure half way:** each statement in these files is idempotent
(`if not exists`, `create or replace`, `do $$ … exception when duplicate_object`).
Re-run the same file; it continues. The one exception is #5's function drop +
create: if the process dies between them the 5-arg function is gone and the
6-arg one missing — re-running #5 fixes it, and the application fails closed
in the meantime (every external mutation refused, nothing half-done). #6 has
the same shape for its two functions; run each file with `-1` and the case
cannot arise.

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

* #6 only: `psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260921.sql`.
  One transaction. It **refuses** (nothing changed) while a refund is not
  settled, a cancellation is in progress, a message delivery is open or a
  turnover is in progress — let them finish or resolve them by hand. It
  restores the 2026-09-20 signatures of the two functions #6 replaced.
* #5 (after #6 is rolled back): `psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260920.sql`.
  Roll the **application** back first or at the same time; see
  `docs/cloudflare-deployment.md` §4. On staging, `ops/staging/rollback.sh`
  runs both in this order.
* Anything earlier: restore the backup. The earlier migrations were never
  designed to be reversed individually and the tables would carry data. In
  the shared project a restore also rolls back Cogniiq's data — both owners
  must agree first (`docs/supabase-shared-project.md` §1).
* Proven on a throwaway cluster by `scripts/db-ops-check.sh`
  (preflight → apply all six → verify → rollback #6 → re-apply → verify →
  rollback #6 and #5 → re-apply twice → verify).

## 6. The project: one, shared with Cogniiq

**Decision (2026-09-21): BoLaGio stays in the ONE existing Supabase project,
shared with the Cogniiq tables.** This replaces the earlier recommendation of
a dedicated project. The reasoning, the trade-offs (blast radius: one
service-role key reaches all data), the inventory's risk report, the optional
`bolagio_app` role and the service-role possession rules are in
**`docs/supabase-shared-project.md`**. What follows is the command sequence.

Shared-project sequence (what `ops/staging/migrate.sh` runs; on production,
by hand, in this order):

```bash
# 1. inventory before (read-only; keep the file)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v format=unaligned \
     -f supabase/ops/shared_project_inventory.sql > inventory-before.txt

# 2. shared-project preflight (read-only; exit ≠ 0 = collision or missing role — stop)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_preflight.sql

# 3. the six migrations, ONE transaction EACH (never -1 across files: #2 must commit before #3)
for f in supabase/migrations/20260916120000_booking_foundation.sql \
         supabase/migrations/20260917100000_booking_core_states.sql \
         supabase/migrations/20260917110000_booking_core_hardening.sql \
         supabase/migrations/20260919120000_admin_operators.sql \
         supabase/migrations/20260920120000_booking_production_hardening.sql \
         supabase/migrations/20260921120000_platform_completion.sql; do
  psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f "$f" || { echo "STOP at $f"; break; }
done

# 4. seed (idempotent; every unit stays is_bookable = false)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/bolagio_booking_units.sql

# 5. shared-project verify (raises on the first failure; supersedes verify.sql)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_verify.sql

# 6. inventory after, and the diff — every changed line must name a bolagio_* object (or btree_gist)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v format=unaligned \
     -f supabase/ops/shared_project_inventory.sql > inventory-after.txt
diff -u inventory-before.txt inventory-after.txt
```

`shared_project_preflight.sql` contains every check of `preflight.sql` (§2)
plus name-collision and blast-radius checks; `shared_project_verify.sql`
contains every assertion of `verify.sql` (§4) plus the shared-project
invariants. In the shared project use the `shared_project_*` pair; the plain
pair remains for the local throwaway clusters (`scripts/db-ops-check.sh`).

The CRITICAL/HIGH rows the inventory prints for **unrelated** tables are
Cogniiq's; hand them to that table owner with
`supabase/ops/shared_project_hardening.sql`, and it is now a **prerequisite**: the
live inventory of 2026-09-20 found 16 CRITICAL and 9 HIGH exposures on non-BoLaGio
tables, and they are closed *before* the BoLaGio chain is applied. Follow
`docs/security/2026-09-20-shared-project-hardening.md` first, then return here.
`20260815120000_lockdown_revoke_anon_access.sql` remains the older one-shot
for the same clean-up and is likewise not part of the BoLaGio sequence.
