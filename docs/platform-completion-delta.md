# Platform completion — delta audit

Baseline: `claude/bolagio-production-readiness` at `3eb4c8c`. Target: the
final pre-production state on `claude/bolagio-platform-completion`. Every
row names the file that proves the classification; a row without a proof
file is an opinion and is marked as such.

## Classification

| Class | Meaning |
|---|---|
| **A** | Existed at the baseline, complete, proven by tests against a real database or a real HTTP boundary. |
| **B** | Existed at the baseline, complete in code, proven only by unit tests or not at all. |
| **C** | Existed at the baseline as a contract, a stub or a partial implementation. |
| **D** | Did not exist at the baseline. |
| **E** | Design only — deliberately not implemented because implementing it without an external fact would be unsafe. |
| **F** | Blocked by an external action nobody in this repository can take (credentials, account settings, a legal decision). |

## Booking domain

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Transactional state machine, exclusion constraint, outbox, payment inbox, operation ledger, reconciliation | A | A | `scripts/db-test.sh`, `tests/sql/*.sql`, `tests/integration/happy-path.test.ts` |
| Same-state transition carrying a patch (payment status, failure code) | A — **wrong**: the function returned early and the patch was never applied | A — fixed in `bolagio_booking_transition` | `tests/sql/completion.sql` §1, `tests/integration/paypal-cases.test.ts` case 16 |
| `manual_review → hold_created` adoption after an uncertain create | D (edge missing) | A | `lib/booking/states.ts`, `tests/state-machine-sql-mirror.test.ts`, `tests/integration/beds24-contract.test.ts` |
| Approved-but-uncaptured order after the lease | C (blocked until a person) | A — read first, withdrawn (`approval_lapsed`) | `tests/integration/paypal-cases.test.ts` case 3, `e2e/guest/happy-path.spec.ts` G04 |
| PayPal capture, webhooks, verification, idempotency | B | A | `tests/integration/paypal-cases.test.ts` (17 cases), `e2e/guest/payment-cases.spec.ts` |
| Beds24 hold / finalize / release / read / search with unknown outcomes | B | A | `tests/integration/beds24-contract.test.ts` |
| Cancellation saga (cases A–M), orthogonal cancellation and refund state, database invariants | D | A | `supabase/migrations/20260921120000_platform_completion.sql` §2, `lib/booking/cancellation.ts`, `tests/integration/cancellation.test.ts`, `e2e/admin/control.spec.ts` A03/A04 |
| Refund execution against the provider | D | A in code, **gated off** (`PAYMENT_REFUND_EXECUTION_ENABLED`, refused on production by `REFUND_EXECUTION_UNVALIDATED`) | `lib/booking/refunds.ts`, `tests/integration/cancellation.test.ts` |
| Refund settlement from the provider webhook, duplicate-refund escalation | D | A | `lib/booking/payments.ts`, `tests/integration/cancellation.test.ts` |
| Booking modification (date change) | D | **E** — design in `docs/cancellation.md` §"Not built"; changing dates on a paid, channel-finalized booking needs a Beds24 modify contract that has not been validated live | — |
| Direct booking gate | A | A, unchanged: `DIRECT_BOOKING_ENABLED` unset, `is_bookable=false` outside test data | `tests/direct-booking-gate.test.ts` |

## Guest operations

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Unit clock (timezone, check-in/out times), DST-safe "today" | A | A | `tests/dates-dst.test.ts` |
| Pre-arrival, check-in, review events | A | A, with per-unit timing columns (`prearrival_days`, `review_delay_days`, `review_window_days`) | `tests/sql/completion.sql` §5 |
| Check-out event | D | A (`guest.checkout_ready`, `checkout_notice_days`) | `tests/sql/completion.sql` §5, `tests/sql/concurrency.sql` |
| Invoice-required event | D | A (`invoice.required` once per confirmed, paid direct booking) | `tests/sql/completion.sql` §5 |
| Turnovers derived from confirmed departures | C (table, no status writes) | A — `required/in_progress/done/void`, assignee, audit events, reopen on moved departure | `tests/sql/completion.sql` §4, `tests/integration/admin-ops.test.ts`, `e2e/admin/control.spec.ts` A05 |

## Messaging and automation

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Outbox + signed internal API | A | A, plus integration observations | `tests/internal-routes.test.ts`, `tests/integration/messaging.test.ts` |
| Guest message templates (DE/EN, versioned, fail-safe on missing variables) | D | A | `lib/messaging/templates.ts`, `lib/messaging/render.ts`, `tests/messaging*.test.ts` |
| Delivery ledger, exactly-one effect, `POST /api/internal/messages` | D | A | `tests/integration/messaging.test.ts`, `tests/sql/race-delivery.sh` |
| Importable n8n workflows | C (contract only) | A — six generated workflows, validated by `tests/n8n-workflows.test.ts`; **import into a real n8n not performed** | `n8n/` |
| Operator requeue of a delivery or a dead-lettered event | D | A | `e2e/admin/control.spec.ts` A06 |

## Operations interface (BoLaGio Control)

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Today, calendar, bookings, attention, properties, payments, system | A | A | existing admin tests |
| `/admin/cleaning` | D | A | `e2e/admin/control.spec.ts` A05, `tests/admin-cleaning.test.ts` |
| `/admin/automations` | D | A | `e2e/admin/control.spec.ts` A06, `tests/admin-automations.test.ts` |
| Cancellation panel with role, configuration and typed-reference gates | D | A | `e2e/admin/control.spec.ts` A02–A04 |
| Integration signals: last success / failure / verified webhook / claim / ack, never false green | D | A | `tests/integration/admin-ops.test.ts`, `tests/internal-routes.test.ts` |
| Alerts for refunds, deliveries, turnovers, silent n8n | D | A | `tests/alerts.test.ts` |

## Verification infrastructure

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Real-Postgres SQL tests | A | A (+102 assertions in `completion.sql`, a delivery race) | `scripts/db-test.sh` |
| Local Supabase-shaped stack (Postgres + PostgREST + `/rest/v1` proxy) | D | A | `scripts/test-stack.sh` |
| Provider simulators (PayPal, Beds24) as HTTP servers with scripted modes | D | A | `tests/simulators/`, `docs/provider-simulation.md` |
| Integration suite over the real route handlers | D | A (76 tests) | `npm run test:integration` |
| Playwright suite (21 guest cases + mobile + 8 admin cases, database assertions) | D | A (30 tests) | `npm run test:e2e` |
| CI without provider credentials | C (two manual live workflows) | A | `.github/workflows/ci.yml`, `tests/shared-project-sql.test.ts` |
| Staging harness (migrate, verify, rollback, cron, smoke, health, config validation) | D | B — scripts written and validated against the local stack; **never run against a Supabase project** | `ops/staging/` |

## Shared Supabase project

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Inventory / preflight / verify for the shared project | D | B — run clean on the local stack; not on the real project | `supabase/ops/shared_project_*.sql` |
| Service-role possession analysis and the narrower `bolagio_app` role | D | B (proposal + SQL, not applied) | `docs/supabase-shared-project.md`, `supabase/ops/bolagio_app_role.sql` |

## Invoicing, retention, legal

| Capability | Baseline | Now | Proof |
|---|---|---|---|
| Gapless invoice numbering | D | A (`bolagio_next_invoice_number`) | `tests/sql/completion.sql` §7 |
| Invoice draft contract that refuses without tax configuration | D | A — **no VAT rate, small-business status or issuer detail is assumed** | `lib/invoicing/contract.ts`, `tests/invoicing.test.ts` |
| Invoice document, sending, accounting export | D | **E/F** — needs the tax decisions in `docs/invoicing.md` | — |
| Data retention classification | D | A (classification) / **E** (any deletion) | `lib/retention/policy.ts`, `tests/retention.test.ts` |
| Legal texts for direct booking (AGB, Widerruf, price transparency) | F | F | `docs/production-readiness.md` §3 |

## Bugs found by the new verification, fixed in this phase

| Where | What | Found by |
|---|---|---|
| `bolagio_booking_transition` | A same-state call with a patch returned early; `payment_status` never became `unknown` or `refunded`, `payment.refunded` was never emitted. | integration suite |
| `bolagio_transition_allowed` / `lib/booking/states.ts` | No `manual_review → hold_created` edge: a hold created during an uncertain provider answer could never be adopted. | Beds24 contract tests |
| `lib/booking/reconciliation.ts` | An approved-but-uncaptured order blocked the nights until a person acted; now read first and withdrawn after the lease. | PayPal case 3 |
| `components/booking/booking-modal.tsx` | Writing the chosen stay back to the shared context re-ran the "on open" reset: the dialog jumped to step one with the hold already taken, so **no guest could reach the payment step**. | Playwright G01 |
| `components/booking/booking-modal.tsx` | A confirmed payment showed "Ihre Buchungsanfrage ist bei uns" instead of the confirmation, because the confirmed stay was only ever set on the enquiry path. | Playwright G01 |
| `components/booking/booking-modal.tsx` | In bookable mode the default payment method was one that is not offered, so a submit created a hold with no payment route. | Playwright review |
| `components/booking/booking-modal.tsx` | A stay re-priced by the server at hold time was charged at the new total while the guest still saw the old one. Now the guest sees the new total and must confirm again. | Playwright G14 |
| `lib/supabase/server.ts` | Inside the Next.js server runtime the Data Cache answered repeated PostgREST reads: a night held seconds earlier was painted free, and a status poll could show stale payment state. Every Supabase request is now `no-store`. | Playwright G13 |
| `components/booking/booking-modal.tsx` | An SDK that failed to load produced the generic "hat nicht funktioniert" copy rather than "Zahlungsseite konnte nicht geöffnet werden". | Playwright G11 |
