# Finance & Tax — architecture

**Status:** implemented on the branch `claude/bolagio-finance-tax-system`; not deployed; no production
migration applied. See `production-readiness.md` for the GO / NO-GO table.

## What it is

A separate **finance domain** inside BoLaGio Control that turns facts from the booking core, PayPal,
Booking.com and the operators' own entries into a management view of the company's money and a
*system estimate* of its taxes. It is a **subledger**, not a general ledger and not a tax filing
system: the Steuerberater's DATEV bookkeeping remains the books of record.

```
booking core (bolagio_booking_intents)   PayPal captures/refunds   Booking.com statements   bank CSV   operators
            │ read-only                        │ read-only               │ import              │ import   │ forms
            ▼                                  ▼                         ▼                     ▼          ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │  lib/finance/ingestion-rules.ts · import/adapters.ts · actions.ts   →   command functions (SQL)      │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼────────────────────────────────────────────┐
        ▼                                               ▼                                            ▼
  transactions + lines                              payments                                    documents
  (economic facts: revenue, expense,                (cash facts: receipts, refunds,             (evidence: invoices,
   refund, commission, fee, cogs …)                  payouts, fees, tax payments)                statements, notices)
        └──────────────── reconciliations (links with a rule, a confidence and a reason) ───────────┘
                                                        │
                       views: ledger_lines · pl_monthly · vat_monthly · cash_monthly · unit_monthly
                                                        │
        P&L · cash flow · profitability · VAT position · KSt/Soli/GewSt estimate · reserve · inbox · exports
```

## Authority boundaries (unchanged)

| Fact | Authority | Finance may |
|---|---|---|
| Availability, stays | Beds24 via the booking core | read `bolagio_booking_intents` |
| Money in / refunds | PayPal via the booking core | read capture and refund ids and amounts |
| Booking.com stays and payouts | Booking.com statements | import them, never call the API |
| Bank movements | the bank | import CSV, never connect |
| Books of record, filings | the Steuerberater | export, propose, never file |

Finance code never writes a booking row. The integration test `tests/integration/finance.test.ts`
hashes the booking table before and after an ingestion pass and proves it.

## Design decisions

1. **Subledger, not double-entry.** Every economic fact is one transaction with lines; cash is a
   separate table; reconciliations link them. A DATEV mapping layer (`lib/finance/export/datev.ts`)
   proposes account rows for the adviser instead of the system keeping a chart of accounts it cannot
   vouch for.
2. **Integer money.** `bigint` cents in the database, `number` cents in TypeScript, basis points for
   rates, half-up rounding, largest-remainder allocation (`lib/finance/money.ts`). No floating money
   anywhere; the SQL guard refuses a line whose gross ≠ net + VAT.
3. **Append-only with corrections.** Rows are never updated in their money fields or deleted (SQLSTATE
   `BLG10`, `BLG12`). A mistake is a *reversal* (mirror posting, `correction_of`) plus a repost.
   Classification changes (category, unit, allocation, input-VAT treatment, same-rate tax code) are
   recorded as *overrides* with actor and reason; a rate change is money and therefore a reversal.
4. **Periods lock.** `open → review → accountant_reviewed → locked`; a locked month refuses postings,
   reversals dated into it and reclassifications (`BLG11`). Only the accountant path
   (`finance.tax_review`) locks, reopens or marks reviewed, and every move is audited.
5. **Effective-dated rules.** Tax codes, tax rates, and policy (filing frequency,
   Dauerfristverlängerung, fiscal year, reserve policy, local levy) carry `effective_from/to`. Older
   figures keep the older rule.
6. **Estimates are labelled.** Every tax figure carries a stage
   `system_estimate → accountant_reviewed → filed → assessed → paid`; the governing figure is the
   highest stage. Screens and exports say *ESTIMATE* on system figures. Nothing is ever presented as a
   filed amount unless a person recorded that stage.
7. **Fail closed.** Guest invoices are not issued until the § 14 UStG requirements are met by
   configuration and by the draft; e-invoice generation and DATEV export sit behind gates that are off
   until validated; unknown tax treatment parks under a review-required code that counts toward no
   VAT figure.
8. **Booked on = service end.** Accommodation revenue is recognised on the check-out date
   (`booked_on`), with the stay as service period; the cash fact keeps its own date. Profit is not cash,
   and the screens say so.

## Code map

| Layer | Where |
|---|---|
| Schema, guards, command functions, seeds | `supabase/migrations/20260922120000_finance_foundation.sql` |
| Ops | `supabase/ops/preflight.sql`, `verify.sql`, `rollback_20260922.sql`; `tests/sql/finance.sql` (81 assertions), `tests/sql/finance-reset.sql` (test-only) |
| Pure domain | `lib/finance/{money,periods,tax-codes,categories,reconciliation,categorization,inbox,invoices,ingestion-rules,documents,e-invoice}.ts`, `lib/finance/tax/*`, `lib/finance/reports/*`, `lib/finance/import/*`, `lib/finance/export/*` |
| Data access | `lib/finance/rows.ts` (row shapes + `FinanceRowSource`), `source-supabase.ts`, `fixtures.ts`, `source.ts` (mode switch) |
| Commands and actions | `lib/finance/commands.ts` (RPC wrappers, ingestion, reconciliation runner, imports, invoices, estimates), `lib/finance/actions.ts` (server actions: gate → validate → command → audit → revalidate) |
| Read models | `lib/finance/queries.ts`, `attention.ts` (global attention + alert inputs), `search-action.ts` |
| Screens | `app/(admin)/admin/(control)/finance/**`, `components/admin/finance/*`, `.bc-fin-*` styles in `app/(admin)/admin/control.css` |
| Integration | `lib/booking/operations.ts` (ingestion after each operations pass), `lib/ops/alerts.ts` (seven finance alerts), `lib/admin/queries.ts` (attention merge), booking page panel, `/admin/system` health card, command palette |

## Access

Capabilities (`lib/admin/permissions.ts`): `finance.view` (viewer, operator, admin), `finance.edit`,
`finance.review`, `finance.export` (operator, admin), `finance.tax_review`, `finance.configure`
(admin). The preview demo allows `finance.view` only. The `/admin/finance` layout requires
`finance.view` before any finance data is read; each action re-checks its own capability.

Database: every finance table has RLS enabled with no policy for browser roles and all privileges
revoked from `anon` and `authenticated`; every `bolagio_finance_*` / `bolagio_minibar_*` function is
revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role` only. The browser never
reaches a finance table; the integration test `access` asserts it against the real schema.

## Modes

The same screens run against three row sources chosen by `adminMode()`:

- `supabase` — the real tables through the service role.
- `preview` / `fixture` — `lib/finance/fixtures.ts`, a synthetic ledger that covers every scenario the
  screens must show (Booking.com stays with commission and a payout mismatch, direct PayPal captures,
  a partial refund, PayPal fees, cleaning invoices including a missing document, laundry allocated by
  nights, a foreign SaaS subscription with a suggested reverse charge, an IKEA basket with asset
  candidates, an Amazon review case, electricity, minibar purchase/sales/waste/adjustment, the tax
  adviser's accountant-locked invoice, a KSt advance payment, an unmatched bank receipt, periods in
  every state, VAT periods with stages, notices, payments, reserves, adjustments, an asset, exports,
  imports including a failed one, an invoice draft). Fixture values are synthetic and carry no guest
  name beyond the booking desk's "Last, F." label.

## What is deliberately not built

- No live bank connection, no PayPal or Booking.com API polling: statements are imported.
- No PDF rendering pipeline for invoices: the issued invoice is frozen as a row and a canonical
  document; the print view renders from the frozen row (see `invoices.md`).
- No e-invoice XML writer and no DATEV file: models and gates exist; the writers wait for a validator
  and the adviser's account confirmation (see `invoices.md`, `accountant.md`).
- No automatic filing, no ELSTER.
