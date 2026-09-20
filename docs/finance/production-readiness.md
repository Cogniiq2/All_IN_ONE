# Finance & Tax — production readiness

Branch `claude/bolagio-finance-tax-system`, based on `claude/bolagio-platform-completion` @ `f0e3938`.
Nothing on this branch has been deployed or applied to a production database.

## GO / NO-GO

| Area | State | Verdict | What is missing |
|---|---|---|---|
| Database foundation (30 tables, guards, command functions, seeds, RLS, revokes) | implemented; 81 SQL assertions; idempotent re-apply and guarded rollback proven by `db-ops-check` | **GO for staging** | apply to the shared project only through the migration runbook; production waits for the items below |
| Booking → finance ingestion (revenue, captures, refunds, R1 matching) | implemented; integration-tested against the real booking core and simulators | **GO** | — |
| Expenses, splitting, categorization, overrides, reversals | implemented; unit + integration + Playwright | **GO** | counterparty rules for the real suppliers (data entry) |
| Period locking, accountant lock | implemented; database-enforced; Playwright-tested | **GO** | — |
| Documents registry, hashing, retention classes | implemented | **GO with a bucket** | `FINANCE_DOCUMENT_BUCKET` (private) for originals; without it the registry works but stores no files |
| Reconciliation R1–R6, Inbox | implemented; unit + integration | **GO** | — |
| Imports: BoLaGio bank / expenses templates | validated | **GO** | — |
| Imports: PayPal / Booking.com adapters | experimental | **NO-GO for unattended use** | validate against real downloads on a test database, then relabel |
| VAT position and calendar | implemented as ESTIMATE | **GO as estimate** | adviser confirms filing frequency, DFV, the cleaning-fee treatment |
| KSt / Soli / GewSt estimate, reserve, free cash | implemented as ESTIMATE | **GO as estimate** | **Bayreuth Hebesatz confirmed and recorded** (currently a review-flagged placeholder); account opening balances for cash |
| Tax notices, payments, stages | implemented | **GO** | data entry |
| Guest invoices (§ 14 gate) | implemented; fail-closed; integration-tested | **GO once configured** | `INVOICE_ISSUER_LEGAL_NAME`, `INVOICE_ISSUER_ADDRESS`, `INVOICE_ISSUER_TAX_ID`, `INVOICE_SERIES`, `INVOICE_SMALL_BUSINESS=false`; adviser decides the cleaning-fee rate; a PDF/print sign-off |
| E-invoice generation | model + gate only | **NO-GO** | validator (KoSIT schematron) and a real XRechnung/ZUGFeRD writer; not required for B2C guests; required for domestic B2B recipients from 2027/2028 |
| DATEV export | mapping proposals + gate only | **NO-GO** | adviser's account map (`datev_confirmed`), SKR choice, format validation, test import at the adviser |
| Minibar | implemented | **GO** | product list and opening stock (data entry) |
| Exports (15 CSV kinds, registered with hash) | implemented | **GO** | — |
| Alerts / attention / health integration | implemented | **GO** | — |
| Preview demo (fixtures) | implemented; read-only | **GO** | — |
| Legal certainty register | `tax-sources.md` | **partially UNVERIFIED** | primary-source confirmation of rows flagged there |

## Validation performed on this branch

| Suite | Command | Result |
|---|---|---|
| Typecheck, lint | `npm run typecheck`, `npm run lint` | clean |
| Unit | `npm test` | 605 passing (501 before + 104 finance) |
| SQL (real Postgres) | `./scripts/db-test.sh` | passing, incl. `tests/sql/finance.sql` (81 assertions) |
| Ops | `./scripts/db-ops-check.sh` | passing (preflight → migrate → verify → finance rollback → re-apply ×2 → verify → older rollbacks → re-apply → verify) |
| Integration | `npm run test:integration` | 88 passing (77 before + 11 finance) |
| Playwright | `npx playwright test e2e/admin/finance.spec.ts` | see the final report for the run on this branch |
| Build | `npm run build`, `npm run cf:build` | see the final report |

> These are the figures **as this branch stood**. The final integration review
> (`docs/final-integration-review.md`, 2026-09-20) found and fixed four cross-domain
> defects on top of it and re-ran every suite: 626 unit, 93 integration, 37 Playwright,
> with the DB, ops, build and Cloudflare builds green. Read that report for the current
> state and the GO/NO-GO position.

## External setup, in order

1. Steuerberater: confirm `tax-sources.md` rows 2, 9, 10, 12, 15, 19; provide the DATEV account map.
2. Environment (staging first): `INVOICE_*`, `FINANCE_DOCUMENT_BUCKET` (private bucket, service role
   only), `FINANCE_CLEANING_EXPECTED_NET_CENTS`, `FINANCE_INGESTION_SECRET` if the scheduled route is
   used. Never put the tax number in source.
3. Apply `20260922120000_finance_foundation.sql` to staging via the runbook; run `verify.sql`.
4. Record on `/admin/finance/settings`: the confirmed Hebesatz with source, policy values (filing
   frequency, DFV, fiscal year), the counterparty rules for real suppliers, the accounts with opening
   balances, minibar products.
5. Import the first bank statement and the first PayPal / Booking.com downloads on **staging**;
   inspect; relabel adapters only after that.
6. Run one month end with the adviser; only then production.

## What was explicitly not done

No merge, no pull request, no production migration, no real invoice, no filing, no bank connection,
no live payment or booking change, no e-mail. The Bayreuth Hebesatz and every legal item flagged in
`tax-sources.md` remain to be confirmed by a person.
