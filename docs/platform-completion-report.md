# Platform completion — final report

Prepared at the end of the final pre-production completion phase. Every
statement below is either proven by a test or script named next to it, or
marked as not performed. Nothing in this phase touched a production system,
a live PayPal transaction, a live Beds24 write, a real guest message, the
live Supabase project, or the direct-booking switch.

## 1. Branch and commits

- Base: `claude/bolagio-production-readiness` at `3eb4c8c` ("Remove dead booking code…").
- Work: `claude/bolagio-platform-completion`, branched from that commit. The
  head commit is the one that carries this report; no merge, no pull request
  was opened, no other branch was pushed to.
- Working tree at hand-over: about 60 modified and about 50 new files
  (`git diff --stat` on the branch).

## 2. Delta audit

`docs/platform-completion-delta.md`: the baseline-to-target classification
(A–F) for every capability, with the file that proves each row, and the nine
defects the new verification found and this phase fixed. Headline: the
booking core was already sound in its transactional design; the guest-facing
dialog, however, **could not reach the payment step at all** (a state reset
on writing the chosen stay back), and the server runtime **served cached
availability** (the Next.js Data Cache in front of PostgREST). Both would
have surfaced on day one of a sandbox run; both are fixed and pinned by
Playwright and unit tests.

## 3. Implementations, by area

| Area | Delivered | Where |
|---|---|---|
| Database | Sixth migration: transition-patch fix, cancellation/refund columns + functions + invariants, delivery ledger, turnover status/audit, per-unit guest-ops timing, check-out and invoice events, integration health, gapless invoice sequence, views, grants; rollback with in-flight refusal | `supabase/migrations/20260921120000_platform_completion.sql`, `supabase/ops/rollback_20260921.sql`, `supabase/ops/{preflight,verify}.sql` |
| Booking domain | Cancellation saga (A–M), refund command (gated), refund settlement via webhook incl. decided-by-hand refunds, unknown-refund reconciliation, hold-blocked resolver, approved-order withdrawal, `manual_review → hold_created` | `lib/booking/{cancellation,refunds,payments,reconciliation,release,commands,repository,errors,states}.ts` |
| Messaging | DE/EN versioned templates with required variables, fail-safe renderer, delivery ledger with exactly-one effect, `POST /api/internal/messages` | `lib/messaging/*`, `app/api/internal/messages/route.ts` |
| Guest operations | Configurable timing per unit, `guest.checkout_ready`, `invoice.required`, turnover reopen/void events | migration §4–5, `lib/booking/operations.ts` |
| Control (admin) | `/admin/cleaning`, `/admin/automations`, cancellation panel, guest-message list per booking, integration signals + messaging + cleaning health sections, refund/delivery/turnover/n8n-silence alerts, five audited server actions, health endpoint additions | `app/(admin)/…`, `components/admin/{cleaning,automations,booking}/…`, `lib/admin/{cleaning,automations,queries,actions,alerts,dto,rows,source-supabase,dev/fixtures,permissions}.ts`, `lib/ops/alerts.ts`, `app/api/internal/health/route.ts` |
| Observability | `bolagio_integration_health` written from the Beds24 and PayPal clients, the webhook route, the outbox and messages endpoints; "never observed" is never green | `lib/booking/commands.ts` (`observeIntegration`), `lib/admin/automations.ts` |
| Configuration | New gates and findings; provider overrides local-only; refund execution and test completions refused on production | `lib/booking/config.ts`, `lib/config/environment.ts`, `docs/environments.md` |
| Simulators + stack | PayPal and Beds24 HTTP simulators with control APIs; throwaway Postgres + pinned PostgREST + `/rest/v1` proxy | `tests/simulators/*`, `scripts/{test-stack.sh,install-postgrest.sh,stack-proxy.mjs}` |
| Integration suite | Real route handlers over HTTP against the stack and simulators | `tests/integration/*` (77 tests) |
| Playwright suite | Built site, real Chromium, fake PayPal SDK, database assertions | `e2e/*` (21 guest cases, the mobile repeat, 8 admin cases) |
| n8n | Six importable workflows generated from one source, credential matrix, test mode, runbooks, validation test | `n8n/*`, `tests/n8n-workflows.test.ts` |
| Shared Supabase | Inventory / preflight / verify SQL, hardening proposal (guarded), narrower `bolagio_app` role, decision doc | `supabase/ops/shared_project_*.sql`, `supabase/ops/{proposed_unrelated_hardening,bolagio_app_role}.sql`, `docs/supabase-shared-project.md` |
| Staging | Migrate / rollback / cron / smoke / health / config validation, secrets checklist, Edge Function deploy, teardown | `ops/staging/*` |
| CI | Quality, real-Postgres, integration, e2e, build/OpenNext jobs; no credential | `.github/workflows/ci.yml` |
| Invoicing | Draft contract that refuses without tax facts; gapless numbering; no document | `lib/invoicing/*`, `docs/invoicing.md` |
| Retention | Classification of every table; no deletion | `lib/retention/policy.ts`, `docs/data-retention.md` |
| Public site fixes | Dialog reset, confirmed state, default provider, server re-price shown, SDK-failure copy, uncached Supabase reads | `components/booking/booking-modal.tsx`, `lib/supabase/server.ts` |

## 4. Booking-domain completion

| Capability | State | Proof |
|---|---|---|
| Quote → intent → hold → order → capture → finalize → confirmed | complete | `tests/integration/happy-path.test.ts`, e2e G01/G02/G21 |
| Every PayPal failure mode (17 cases) | complete against the simulator | `tests/integration/paypal-cases.test.ts`, e2e G04–G11, `docs/provider-simulation.md` §5 |
| Every Beds24 unknown outcome | complete against the simulator | `tests/integration/beds24-contract.test.ts`, `docs/provider-simulation.md` §6 |
| Lease expiry, stale hold, approved-uncaptured withdrawal | complete | PayPal cases 3, 7, 15; e2e G04, G09 |
| Cancellation A–M | complete; paid cases need an authorising person | `tests/integration/cancellation.test.ts`, `docs/cancellation.md` |
| Refund execution | complete in code, **off** until sandbox-validated | `lib/booking/refunds.ts`, case J/K |
| Refund settlement by webhook (incl. a refund done by hand) | complete | case I′, J, 16 |
| Booking modification | **not built** (design only) | `docs/cancellation.md` |
| Direct booking switch | **off**, unchanged | `tests/direct-booking-gate.test.ts` |

## 5. Guest operations

Per-unit timing columns, four guest events plus `invoice.required`, DST-safe
"today" in the unit's timezone, turnovers with status, assignee, audit, reopen
on a moved departure, void on cancellation, and events for each change.
`docs/guest-operations.md`, `docs/cleaning-operations.md`. Known
simplification: the fallback parameters of `bolagio_emit_guest_events()` are
never reached because the unit columns are `NOT NULL` with defaults.

## 6. n8n workflow paths

`n8n/workflows/bolagio-outbox-event-pump.json`, `bolagio-guest-message.json`,
`bolagio-cleaning-routing.json`, `bolagio-operational-alert.json`,
`bolagio-health-poll.json`, `bolagio-error-handler.json` — generated by
`n8n/build.mjs`, validated by `tests/n8n-workflows.test.ts` (structure,
credential references, no secret). **Not imported into any n8n instance**;
`n8n/README.md` §4c lists what to check in the UI after import.

## 7. Delivery model

At-least-once event delivery (outbox claim/ack with a lease) beneath an
exactly-one **effect** for guest messages: `bolagio_message_deliveries` keyed
on `<reference>:<kind>:<sequence>`, claim with lease, `already_sent` /
`in_progress` / `backoff` / `not_retryable` / `suppressed` outcomes, requeue
by an operator only. Proven by `tests/integration/messaging.test.ts` and the
concurrent race in `tests/sql/race-delivery.sh`. `docs/guest-messaging.md`.

## 8. Shared Supabase readiness

Decision recorded: one project, shared with Cogniiq. Inventory, preflight,
verify and the hardening proposal run clean on a throwaway cluster
(`scripts/db-ops-check.sh`); `tests/shared-project-sql.test.ts` pins that
BoLaGio migrations touch only `bolagio_*` objects. **Not run against the
real project.** `docs/supabase-shared-project.md` §4 states the service-role
blast radius and the narrower `bolagio_app` role (SQL written, not applied).

## 9. Playwright results

30 passed, 0 failed, 0 skipped (`npm run test:e2e`, Chromium, built site,
local stack, simulators): G01–G21 on desktop, G21 again on an iPhone 13
viewport with a no-horizontal-overflow assertion at every step, A01–A08 on
BoLaGio Control. Each case asserts the database afterwards
(`docs/provider-simulation.md` §8).

## 10. Simulation results

Integration: 77 passed across `happy-path`, `paypal-cases`, `beds24-contract`,
`cancellation`, `messaging`, `admin-ops`. The simulators are HTTP servers
with scripted modes; what they do and do not prove is in
`docs/provider-simulation.md` §7.

## 11. PayPal matrix

Cases 1–17 (with 12b, 13b, 14b) and the simulator-only modes:
`docs/provider-simulation.md` §5 — scenario, scripting, expected booking and
payment status, side effects, proving test. All pass against the simulator.
None has been run against PayPal's sandbox in this phase.

## 12. Beds24 matrix

Mode × operation (hold, finalize, release, read/search) with the adapter's
classification (`succeeded` / `failed` / `outcome_unknown` / refused) and the
ledger's blind-retry refusal: `docs/provider-simulation.md` §6. All pass
against the simulator. The controlled live validation
(`docs/beds24-contract.md` §4) has not been run.

## 13. Admin, CI, observability additions

- Admin: `docs/admin-control.md` §1 (routes), §3 (roles), §4a (writes).
- CI: `.github/workflows/ci.yml` — five jobs, no `secrets.*`, the two live
  workflows remain manual.
- Observability: integration signals on `/admin/system` and in
  `/api/internal/health` (`integrations[]`, `backlog{}`); alerts
  `REFUND_ATTENTION`, `REFUND_DECIDED_NOT_EXECUTED`, `MESSAGE_DELIVERY_FAILED`,
  `MESSAGE_DELIVERY_BACKLOG`, `TURNOVER_OVERDUE`, `TURNOVER_UNASSIGNED`,
  `N8N_SILENT`; every unmeasured surface listed under `notInstrumented`.

## 14. Security findings

`docs/security/2026-09-21-platform-completion-review.md`: four fixed (Data
Cache staleness, transition patch loss, hold without payment route,
unshown re-price), five open with recommendations — the largest being the
`npm audit` state of `next@14` (fix only in a major) and the Playwright
browser-download advisory (bump to ≥ 1.55.1 in a follow-up). No secret in the
repository or CI.

## 15. Test results

| Suite | Command | Result |
|---|---|---|
| Unit | `npm test` | 501 passed |
| Integration (stack + simulators) | `npm run test:integration` | 77 passed |
| Playwright | `npm run test:e2e` | 30 passed |
| Real Postgres: constraints, triggers, SKIP LOCKED, both races | `./scripts/db-test.sh` | passed: 184 `ok` assertions (102 of them in `tests/sql/completion.sql`) plus the two concurrency races |
| Preflight → migrate → verify → rollback → re-apply | `./scripts/db-ops-check.sh` | passed |
| Typecheck / lint | `npm run typecheck`, `npm run lint` | clean |
| Build / OpenNext build | `npm run build`, `npm run cf:build` | passed |

Targets set for the phase: more than 387 unit tests (501), more than 80
real-database assertions (met).

## 16. External actions not performed

No Supabase project changed; no migration applied outside throwaway
clusters; no PayPal sandbox or live call; no Beds24 call; no n8n import; no
Cloudflare deploy or secret; no guest message; no invoice; no CI run on
GitHub (the workflow file is committed, unexecuted); no dependency upgrade.

## 17. Remaining code work (small)

1. An internal "issue invoice" endpoint calling `prepareInvoiceDraft` +
   `allocateInvoiceNumber` + a renderer — after the tax decisions
   (`docs/invoicing.md` §5).
2. Bump `@playwright/test` to ≥ 1.55.1 and re-run e2e (security O2).
3. Non-major `npm audit fix`, then the planned Next major upgrade (O1).
4. Drop the unreachable fallback parameters of `bolagio_emit_guest_events()`
   or make the unit columns nullable — cosmetic.
5. Booking modification (date change) once a Beds24 modify contract is
   validated live — design in `docs/cancellation.md`.

## 18. Remaining manual steps, in order

`docs/production-readiness.md` §1, steps 1–10: shared project (inventory →
preflight → six migrations → verify → seed), staging worker and Edge
Function, cron jobs, Beds24 controlled validation incl. cancellation,
PayPal sandbox E2E incl. refund webhook, n8n import and one real test send,
staging smoke, legal and tax decisions, production configuration, one-unit
soft launch.

## 19. Go / no-go per area

| Area | Verdict |
|---|---|
| Booking core, cancellation, refund ledger | **GO** (code and local proof) |
| BoLaGio Control | **GO after configuration** |
| Database migration on the shared project | **GO on staging** (procedure rehearsed); production after the staging diff |
| Guest messaging | **GO after** contact variables, SMTP credential and one real staging send |
| n8n | **GO after import** and the UI checks |
| PayPal | **NO-GO until** the sandbox E2E and the refund webhook are recorded |
| Beds24 | **NO-GO until** the controlled live validation is recorded |
| Invoicing | **NO-GO** (tax decisions) — does not block booking |
| Direct booking / production launch | **NO-GO** until every row above is GO and legal §3 is answered |

## 20. Single next action

Run step 1 of `docs/production-readiness.md` §1 on the shared Supabase
project's **staging** use: `shared_project_inventory.sql`, then
`shared_project_preflight.sql`; read the risk report; then apply the six
migrations and run both verify scripts. Everything after depends on it.

## 21. Files intentionally left untouched

`archive/admin-app/`, the archived `supabase/` application migrations that
predate BoLaGio (`2026061*`), `lib/content/apartments.ts` facts marked
`NEEDS CONFIRMATION`, `lib/content/brand.ts` (`contact.email` stays `null`),
`next.config.js` redirects, the public design system, the two manual live
GitHub workflows (references fixed only), `PAYMENT_ENABLED` and
`DIRECT_BOOKING_ENABLED`.

## 22. Standing constraints, re-asserted

No raw booking-state writes (every write is a database command); no blind
retry after an unknown external write (SQLSTATE `BLG01`); a paid booking is
never released or refunded automatically (trigger guard); n8n never confirms
or marks paid (no such endpoint); payment state stays separate from booking
state; `DIRECT_BOOKING_ENABLED` remains unset; `is_bookable` remains false
outside fixture/test data; provider writes remain disabled unless explicitly
approved; no live credential in CI.
