# Finance & Tax — data model

All tables are prefixed `bolagio_finance_` (minibar: `bolagio_minibar_`), live in `public`, have RLS
enabled without browser policies, and store money as `bigint` cents and rates as integer basis points.
Migration: `supabase/migrations/20260922120000_finance_foundation.sql` (idempotent; proven by
`scripts/db-ops-check.sh`, which rolls it back and re-applies it twice).

## Reference data (effective-dated)

| Table | Purpose |
|---|---|
| `tax_codes` | 11 codes: side (output/input/both), treatment, `rate_bp`, `reverse_charge`, `review_required`, `effective_from/to`, legal reference. Mirrored in `lib/finance/tax-codes.ts`; the unit test compares the mirror with the migration text. |
| `categories` | 40 P&L categories with `pl_group` (revenue, direct_cost, property_cost, company_cost, depreciation, interest, other_adjustment, balance, excluded), kind, default tax code, asset-candidate flag, `requires_unit`, DATEV account columns (`datev_account_skr03/skr04`, `datev_confirmed`). |
| `tax_rates` | KSt, Soli, GewSt Messzahl, GewSt Hebesatz rows with `effective_from/to`, `review_required`, legal reference, source URL. The Bayreuth Hebesatz is seeded as a **review-required placeholder**. |
| `policy` | key/value with `effective_from`: `vat_filing_frequency`, `dauerfristverlaengerung`, `fiscal_year_start_month`, `vat_annual_return_month`, `tax_reserve_policy`, `local_levy_enabled`, `small_business_scheme`, `default_shared_cost_allocation`. |
| `counterparties` | suppliers, OTAs, payment providers, authorities, banks: country, VAT id, defaults (category, tax code, input VAT, allocation), `auto_verify`, `match_patterns`. |
| `accounts` | bank / PayPal / cash accounts with a masked IBAN and an opening balance + date. Cash is `null` on every screen until an opening balance exists. |

## Facts

| Table | Purpose | Guards |
|---|---|---|
| `transactions` | one economic fact: `kind` (revenue, expense, refund, credit_note, commission, fee, tax_payment, adjustment, cogs), `booked_on`, service period, invoice/due dates, currency, header totals, counterparty, booking link, unit, `source_type/system/reference` (idempotency key), `status` (posted/reversed), `review_state`, `document_state`, `payment_state`, `reconciliation_state`, `correction_of`, `reversed_by`, note, actor | header totals are synced from lines; money fields immutable; delete refused; posting into a locked period refused (`BLG11`); accountant-locked rows refuse the ordinary path (`BLG13`) |
| `transaction_lines` | category, description, quantity, tax code + `rate_bp`, net/vat/gross, `reverse_charge_vat_cents`, input-VAT treatment + `deductible_bp`, unit, allocation method + note, cost centre, asset state, minibar product, classification + who/when | gross = net + VAT; tax code must match rate and side (`BLG14`); classification changes only through `reclassify_line` |
| `overrides` | audit of every reclassification: target, field, old, new, reason, actor | append-only |
| `payments` | cash facts: direction, source (paypal, booking_com_payout, bank, …), provider reference (unique per source), amount, fee, currency, occurred/value date, counterparty label, reference text, booking link, kind, reconciliation state | immutable money; append-only |
| `reconciliations` | links transaction ↔ payment (↔ document) with amount, state, rule, rule version, confidence, reason, actor | append-only |
| `documents` | registry: type, filename, mime, size, `sha256` (unique), optional storage key, source, structured format (none/xrechnung/zugferd/…), counterparty, dates, review state, retention class + basis + `retain_until`, legal hold, deletion flags, `supersedes_id` | immutable identity; append-only |
| `document_links` | document ↔ transaction / payment / invoice / notice | append-only |
| `invoices`, `invoice_lines` | guest invoices and credit notes: recipient, booking, service period, lines, totals, status (draft/issued/cancelled), series + gapless `number` (shared `bolagio_invoice_sequences`), issuer snapshot with masked tax id, `document_id`, `corrects_invoice_id` | issued rows frozen |
| `periods` | month rows with `status` (open/review/accountant_reviewed/locked), who/when, note | status changes only through `set_period_status` |
| `tax_periods`, `tax_estimates` | per tax type and period: status ladder; every estimate row carries `stage`, amount, basis JSON, rules version, actor; the governing figure is the highest stage, ties broken by recency | estimates append-only; a system estimate never overwrites a higher stage |
| `tax_adjustments` | adviser adjustments (non-deductible expense, GewSt additions, …) with type, period, amount, reason | append-only |
| `tax_notices`, `tax_notice_dues` | Finanzamt / Stadt notices: type, assessment date, amounts, status, document, dues with paid amounts | |
| `tax_payments` | payments to authorities (advance, final, refund, interest, surcharge) linked to a period | append-only |
| `reserves` | declared reserves (tax, maintenance, deposit, other), latest row per label governs | append-only |
| `assets` | asset candidates confirmed by the adviser: acquisition, useful life, method | |
| `exports` | every export: kind, period, format, generator + version, row count, `sha256`, parameters, who/when | append-only |
| `import_batches`, `import_rows` | staged files: adapter + version, filename, `sha256` (duplicate file refused), counts, status (validated/imported/rejected/failed), per-row raw + parsed + status + error | |
| `ota_settlements` | Booking.com finance-statement lines: identity key + content hash, booking number, stay, statuses, currency, gross / commission / payment-service fee / net (costs positive) with the file's signed values, payout, match to `bolagio_reservations` (FK) with local-gross snapshot and delta, amendment state, ledger links, batch/row provenance (20260926) | `net = gross − commission − fee`; `cost = −source`; one `current` line per identity; evidence columns immutable; delete refused (`BLG20`) |
| `ota_payouts` | one row per payout ID: date, currency, bank receipt link (`bank_payment_id`, `bank_state`) — totals come from the view `ota_payout_totals`, never stored | identity immutable; a line with another date/currency for the same payout refused (`BLG21`) |
| `turnover_costs` | expected cleaning cost per turnover (an expectation, never an expense) | |
| `minibar_products`, `minibar_movements` | products with purchase cost, selling price, tax code; signed movements (purchase +, sale/waste/complimentary −, adjustment/correction any) with charge state and the posted transaction | sign constraint; append-only |

## Views

`bolagio_finance_ledger_lines` (lines joined with headers, categories and tax codes; reversed rows
excluded by sign, not by filter), `pl_monthly`, `vat_monthly`, `cash_monthly`, `unit_monthly`,
`exception_counts`, `bolagio_minibar_stock`.

## Command functions (service_role only)

`post_transaction(header, lines, actor)` · `reverse_transaction(id, reason, actor, booked_on)` ·
`reclassify_line(line, patch, reason, actor, as_accountant)` · `set_transaction_state(id, patch, actor, reason)` ·
`record_payment(payment, actor)` · `record_match(match, actor)` · `register_document(doc, actor)` ·
`link_document(doc, target_type, target_id, actor)` · `set_period_status(period, to, actor, as_accountant, note)` ·
`record_tax_stage(…)` · `bolagio_minibar_record_movement(move, actor)` ·
`record_ota_settlement(row, actor)` · `accept_ota_amendment(id, reason, actor)` · helpers `period_key`,
`ensure_period`, `period_locked`.

Session GUCs used by the guards: `bolagio.finance_posting`, `finance_override`, `finance_accountant`,
`finance_unlock`, `finance_sync_totals`. They are set *inside* the command functions only; a direct
`update` from outside never carries them.

## Error codes

| SQLSTATE | Meaning |
|---|---|
| `BLG10` | delete / update on an append-only table |
| `BLG11` | the period is locked |
| `BLG12` | immutable field |
| `BLG13` | accountant-locked (or a change that must go through the override path) |
| `BLG14` | tax code inconsistent with rate or side |
| `BLG20` | settlement line / payout evidence changed or deleted, or an amendment state changed outside its function |
| `BLG21` | a payout ID recorded with another date or currency |

## Retention

Finance tables are classified in `lib/retention/policy.ts` (`financeClasses()`); documents carry
their own class and `retain_until` (see `retention.md`). Nothing in finance is deleted by the
retention job.
