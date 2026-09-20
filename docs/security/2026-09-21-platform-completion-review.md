# Security review — platform completion phase

Date: 2026-09-21. Scope: the repository at the end of the completion phase.
Nothing outside the repository (Supabase project, Cloudflare, PayPal, Beds24,
n8n) was contacted or changed. Method: reading the new code and SQL, the
environment gate, the CI workflow, an `npm audit`, a search for secret-like
strings, and the tests that pin each property.

## 1. Properties re-verified

| Property | Where enforced | Proof |
|---|---|---|
| A simulator or mock can never be reached from staging or production | `providerOverridesPermitted()` (APP_ENV=local only) ignores `BEDS24_API_BASE_URL` and `PAYPAL_SIMULATOR_URL` elsewhere; `validateEnvironment()` additionally **refuses** the configuration with `PROVIDER_OVERRIDE_OUTSIDE_LOCAL` | `tests/environment.test.ts`, `tests/integration/*` (all on local) |
| Test message completions cannot mark a delivery sent where a real guest could exist | `testCompletionsAllowed()` is false on production regardless of the flag; `TEST_MESSAGING_ON_PRODUCTION` refuses | `tests/integration/messaging.test.ts` ("a test transport may report sent locally, but not where a real guest could exist") |
| Refund execution is off and refused on production until validated | `refundExecutionEnabled()`; `REFUND_EXECUTION_UNVALIDATED` (refuse on production, warn elsewhere) | `tests/integration/cancellation.test.ts` |
| A paid booking is never released or refunded automatically | database status guard refuses `releasing` with payment evidence unless `cancellation_authorized_by` is set; the sweep never sets it | `tests/sql/completion.sql` §2, `tests/integration/paypal-cases.test.ts` cases 3, 7, 15, 17 |
| No blind retry after an unknown external write | operation ledger SQLSTATE `BLG01`; refund uses the same ledger with key `paypal:refund:<captureId>` | `tests/sql/*.sql`, `tests/integration/beds24-contract.test.ts`, `tests/integration/cancellation.test.ts` |
| n8n never confirms or marks paid | the internal API exposes claim/ack/fail, messages prepare/complete and health; no status write exists | `tests/internal-routes.test.ts` ("rejects an unknown action") |
| Internal endpoints require the HMAC; replay window enforced | `verifyN8nSignature` | `tests/internal-routes.test.ts`, `tests/integration/messaging.test.ts` (401 with no body) |
| Operator writes: role checked server-side, preview refused, audited | `operatorFor()` in every action; `previewAllows` permits `view` only | `tests/admin-permissions.test.ts`, `e2e/admin/control.spec.ts` A02–A06 |
| Paid cancellation needs admin **and** a deployment switch **and** a typed reference **and** a refund decision | `cancelBookingAction` | `e2e/admin/control.spec.ts` A04 |
| No guest contact data in the outbox, the delivery ledger, logs or alerts | ledger stores `destination_masked` + hash; alerts carry references only | `tests/integration/messaging.test.ts` (JSON of the event never contains the address; no body stored) |
| `/admin` is noindex, no-store, session-gated | middleware unchanged | `e2e/admin/control.spec.ts` A01 |
| CI holds no provider credential | `ci.yml` references no `secrets.*`; the two live workflows stay manual | `tests/shared-project-sql.test.ts` |
| BoLaGio migrations touch only `bolagio_*` objects in the shared project | — | `tests/shared-project-sql.test.ts` |
| Booking reads are never answered from a framework cache | `uncachedFetch` on the service-role client | `tests/supabase-client.test.ts`, `e2e/guest/*.spec.ts` G13 |

## 2. Findings

### 2.1 Fixed in this phase

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | High | The Next.js Data Cache answered repeated PostgREST GETs inside route handlers (`force-dynamic` did not stop it). A held night was painted free; a status poll could show stale payment state. | `lib/supabase/server.ts`: every request `cache: 'no-store'`. |
| S2 | High (integrity) | `bolagio_booking_transition` dropped the patch on a same-state call, so `payment_status = unknown/refunded` was never recorded and `payment.refunded` never emitted. | Function replaced; `tests/sql/completion.sql` §1. |
| S3 | Medium | The booking dialog could create a hold with no payment route (default method not offered in bookable mode), leaving nights blocked for the lease with no way to pay. | Default to the first executable provider. |
| S4 | Medium | A server-side re-price at hold time was charged without being shown. | The guest sees the new total and confirms again. |

### 2.2 Open — with a recommendation

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| O1 | High (dependency) | `npm audit --omit=dev` on 2026-09-20: 17 advisories (1 critical, 13 high) — `next@14.2.35` (fix only in 16.x: Image Optimizer DoS, cache poisoning), `postcss`, `glob`/`eslint-config-next`, and transitive `brace-expansion`, `minimatch`, `picomatch`, `js-yaml`, `lodash`, `flatted`, `browserslist`. The Image Optimizer path is not used (`images.unoptimized`). | A separate, planned Next 15/16 + OpenNext upgrade with its own verification; the non-major fixes (`npm audit fix` without `--force`) can go first, after the suites. Not done in this phase: a framework major changes the runtime the whole verification was run on. |
| O2 | Medium (supply chain) | `@playwright/test@1.49.1` downloads browsers without verifying the TLS certificate (GHSA for `<1.55.1`); CI runs `playwright install`. | Bump to ≥ 1.55.1 in a follow-up and re-run the suite; locally the pre-installed Chromium is used through `executablePath`, so nothing is downloaded. |
| O3 | Medium | The shared Supabase project's `service_role` key reaches Cogniiq's data too (`docs/supabase-shared-project.md` §4). | Apply `supabase/ops/bolagio_app_role.sql` and mint the `bolagio_app` JWT for the worker (procedure written, not applied). |
| O4 | Low | `OPERATOR_PAID_CANCELLATION_ENABLED=true` is a warning, not a refusal, on production. | Keep as a warning: it is a business switch that must be visible on `/admin/system`; the trigger still requires an authorising actor per booking. |
| O5 | Info | The e2e fake PayPal SDK is a `page.route` stand-in; it proves the site's callbacks, not PayPal's button. | Covered in `docs/provider-simulation.md` §7; the sandbox E2E remains a manual gate. |

### 2.3 Secret scan

A search of the working tree for private-key headers, AWS-style keys and
`sk_live`/`sk_test` tokens found nothing. Every credential-shaped value in
`tests/`, `e2e/` and `scripts/test-stack.sh` is a fixed, worthless local
value (`sim-…`, `e2e-…`) that no provider accepts; `tests/shared-project-sql.test.ts`
refuses any workflow file carrying a credential-shaped literal.

## 3. Not reviewed

The remote Supabase project's current grants and policies, the Cloudflare
WAF, the n8n instance's own security, PayPal's webhook configuration. Each
is on the manual list in `docs/production-readiness.md`.
