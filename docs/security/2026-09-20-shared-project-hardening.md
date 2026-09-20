# Shared-project hardening — runbook

**Status:** ready to apply. Proven on a throwaway cluster, never run against the real project.
**Applies to:** the Supabase project shared by Cogniiq and BoLaGio.
**Blocks:** applying the BoLaGio migration chain. Do this first.

---

## Why this exists

The live inventory of 2026-09-20 found **16 CRITICAL, 9 HIGH and 2 MEDIUM** exposures in the
shared project. The earlier `supabase/ops/proposed_unrelated_hardening.sql` could not close
them: it takes a table list from the operator and applies one blunt treatment to everything on
it. The inventory found **three different problems needing three different answers** — and one
table where that blunt treatment would have **broken Cogniiq**. The proposal has been deleted
and replaced by `supabase/ops/shared_project_hardening.sql`, which names every object.

`supabase/migrations/20260815120000_lockdown_revoke_anon_access.sql` cannot be used either: it
aborts unless `invoices` still carries its four `anon` policies, and the inventory shows
`invoices` now has RLS on with **no** policy. Its baseline has moved. It stays in the repository
as the record of what August found; this runbook is what runs.

## How the three families were told apart

Every `.ts`/`.tsx`/`.js` in this repository was searched for each flagged table. **Every hit is
inside `archive/admin-app/`** — the withdrawn Vite admin app whose `login()` now always denies
and whose compiled bundle was deleted (`archive/README.md`). The BoLaGio site touches none of
them. No Cogniiq platform code exists in this repository at all, so the Cogniiq families were
identified by their own RLS posture: `owner_*`, `organization_*`, `ai_receptionist_*`,
`client_*`, `customer_*`, `execution_*`, `oura_*` already carry `is_platform_owner()` /
`is_platform_admin()` policies.

| Family | Count | Treatment |
|---|---|---|
| **A · Legacy property-management schema** | 20 tables | RLS on, permissive policies dropped, `anon` + `authenticated` revoked from table **and sequence**. Only `service_role` reaches them. |
| **B · Cogniiq gap** | 1 table | `owner_tax_adjustments` gets RLS **plus the `is_platform_owner()` policy its siblings already have**. `authenticated` keeps its grants. |
| **C · Functions** | 3 | Explicit `EXECUTE` grants instead of the PUBLIC default; a pinned `search_path` on the two SECURITY DEFINER ones. |

### Why `owner_tax_adjustments` is not in family A

It is a Cogniiq owner table. `owner_tax_estimates`, `owner_tax_payments` and
`owner_tax_settings` all carry `is_platform_owner()`; this one was created without it. Revoking
`authenticated` — what the generic proposal would have done — would have **broken the Cogniiq
owner tax screens**. It is the single most important distinction in this change, and the
hardening **aborts** rather than guessing if `is_platform_owner()` is not found.

### Why the token offer flow is kept

`public_offer_by_token` and `respond_offer_by_token` are `SECURITY DEFINER` and callable by
`anon`. That is **correct and retained**: a customer opens an offer link and never signs in.
What was wrong is that the access came from Postgres's default `EXECUTE` to `PUBLIC` — a grant
nobody chose — and that neither function pinned its `search_path`, which is a privilege-
escalation vector on a `SECURITY DEFINER` function. Both are fixed; the flow is untouched.

---

## Run it

Take a backup first. Every step is idempotent and re-runnable.

```bash
export DATABASE_URL='postgres://…'   # the shared project, session pooler or direct

# 0 · read the current state (read-only, safe any time)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_inventory.sql | tee inventory-before.txt

# 1 · DRY RUN — prints every statement and the before-state, changes nothing
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/shared_project_hardening.sql | tee hardening-dryrun.txt
```

**Stop and read `hardening-dryrun.txt`.** Confirm the two judgement calls below before going on.

```bash
# 2 · APPLY, atomically
psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v apply=yes \
     -f supabase/ops/shared_project_hardening.sql | tee hardening-apply.txt

# 3 · VERIFY (read-only). Must end "verification passed".
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f supabase/ops/shared_project_hardening_verify.sql | tee hardening-verify.txt

# 4 · only now, the BoLaGio chain — see docs/supabase-migration-runbook.md
```

### Undo, if a Cogniiq screen breaks

```bash
psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -v apply=yes \
     -f supabase/ops/shared_project_hardening_rollback.sql
```

This **re-opens the 15 CRITICAL tables to the anon key**. Use it to buy time to fix the caller,
then re-apply. The pinned `search_path` is deliberately not reverted — that would be restoring a
bug, not a capability.

---

## Two things to confirm before applying

These are the only places where this repository cannot see the whole truth.

1. **Does any live Cogniiq screen read a family-A table through the browser?** The evidence says
   no: the only code using them is the withdrawn archive app. But the Cogniiq application is not
   in this repository. If a Cogniiq page reads `documents`, `properties` or `suppliers` with the
   anon or user key, it will stop working. The dry run names all 20 tables — check them against
   the Cogniiq codebase before step 2.
2. **Is the offer token strong and expiring?** The hardening keeps `anon` on both offer
   functions, so the token is the only thing protecting an offer. Confirm in the live function
   bodies that the token is high-entropy, single-purpose, and that `expires_at` is enforced.
   This runbook cannot check that from here.

## Deliberately not changed

- **Storage policies.** The `document`, `invoices` and `reports` buckets grant `authenticated`
  full SELECT/INSERT/UPDATE/DELETE (inventory INFO). Every signed-up Cogniiq user can therefore
  reach the legacy invoice files. That is a real exposure and it is **left alone**: these buckets
  may be shared with live Cogniiq document flows, and changing them on a guess is exactly the
  speculative move this change avoids. `shared_project_hardening_verify.sql` prints them as
  REPORT 2 every run. **Decide this separately, with the Cogniiq code in front of you.**
- **The 148 INFO policy findings.** `is_platform_admin()` / `is_platform_owner()` policies on the
  Cogniiq families are correct by construction and were not touched. The hardening proves it:
  six of them are snapshotted before and after and must come out bit-identical.
- **`service_role`.** Untouched. It bypasses RLS and keeps its grants, which is what every
  server-side caller — Cogniiq's and BoLaGio's — uses.
- **Anything `bolagio_*`.** The script refuses it by name. BoLaGio posture is set by BoLaGio's
  own migrations.

---

## What was proven, and how

`./scripts/shared-project-check.sh` builds a throwaway cluster, reproduces the inventory's exact
state from `supabase/ops/fixtures/cogniiq_shared_project_fixture.sql`, and then:

| Stage | Proves |
|---|---|
| before | `anon` really can read `loans`, read `emails`, **delete** from `suppliers`, and holds EXECUTE on the planner |
| dry run | changes nothing — `anon` still reads `loans` afterwards |
| apply → verify | 76 checks pass |
| security | `anon` and `authenticated` are refused on all 20 legacy tables **and their sequences**; `service_role` still reads and writes them |
| Cogniiq regression | the offer flow answers `anon`, a wrong token returns nothing, a platform owner reads **and writes** `owner_tax_adjustments`, a signed-up non-owner sees zero rows, a platform admin still runs the planner |
| untouched | six sound Cogniiq tables bit-identical (RLS, policies, grants); no table created or dropped; **not one row moved** |
| idempotent | a second apply still verifies |
| **compatibility** | **the whole BoLaGio migration chain applies on top, `verify.sql` passes, and the hardening still verifies afterwards** |
| reversible | rollback re-opens the tables, re-apply closes them again |

File-level invariants are in `tests/shared-project-hardening.test.ts` (26 assertions), so an edit
that, say, added `authenticated` to the `owner_tax_adjustments` revoke fails `npm test` long
before it reaches a database.
