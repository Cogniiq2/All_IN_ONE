# Expenses

## Entry points

1. **Form** — `/admin/finance/expenses/new` (`finance.edit`): supplier, country, VAT id, invoice number,
   dates, description, one or more lines (category, tax code, net, VAT, unit, allocation, input-VAT
   treatment, asset flag). Money is typed as decimals and converted to integer cents on the client;
   the action validates again.
2. **Import** — the BoLaGio expenses CSV template (validated adapter) stages rows, then a commit posts
   them through the same rule engine.
3. **Ingestion** — Booking.com commission comes from the reservation statement; PayPal fees from the
   activity download; expected cleaning costs from turnovers (`turnover_costs`, an expectation only).

Idempotency: a manual expense's source key is a hash of supplier, invoice number, date and the line
amounts; the same invoice posts once, from the form or from a file.

## Line splitting

One invoice, many lines: an IKEA basket splits into furniture (asset candidate), kitchen equipment,
guest supplies; a utility bill splits by unit. Each line carries its own category, tax code, unit
and allocation method, so property profitability and the VAT position are right without touching
the header. The header totals are the sum of the lines, always.

## Categorization (rule engine, explainable)

`lib/finance/categorization.ts` → `classifyExpense(input, counterparties)` returns category, tax
code, input-VAT treatment, allocation and a **classification** with reasons in plain sentences:

| Classification | When |
|---|---|
| `auto_verified` | known counterparty with `auto_verify`, domestic, printed VAT agrees with the default code within 1 cent — and the counterparty is not a marketplace / mixed-basket supplier (Amazon, IKEA, Lidl, …: never auto-verified) |
| `suggested` | known counterparty, or printed VAT fits another German rate, or a reverse-charge suggestion |
| `needs_review` | unknown counterparty, review-required code, printed VAT fits no rate (mixed-rate invoice), foreign supplier with VAT printed, EU supplier without a VAT id |

Foreign suppliers (§ 13b UStG): third country, or EU with a VAT id, and no VAT on the invoice →
`DE_REVERSE_CHARGE` suggested (the company declares 19 % output VAT and deducts the same, § 15 Abs. 1
Nr. 4). VAT printed by a foreign supplier → review (foreign VAT is not German input VAT).

## Allocation to units

`direct` (one unit), `manual`, `revenue_share`, `occupied_nights`, `floor_area`, `equal_units`,
`unallocated`. Shared costs default to the policy `default_shared_cost_allocation`
(`occupied_nights`). An unallocated direct or property cost is an inbox item because it understates
every unit's cost.

## Asset candidates

Categories flagged `asset_candidate` (furniture, appliances, IT) and any line above the operator's
judgement can be marked `candidate`. The inbox lists them; the adviser confirms an asset (useful life,
method) or an expense. **The system never depreciates**: GWG limits, useful lives and methods are the
adviser's (see `taxes.md`).

## Documents

An expense without a linked invoice is `document_state = missing`. The inbox escalates it with age
(watch → elevated → high after 14 / 42 days); the VAT position treats its input VAT as *excluded until
documented*; period lock does not require documents but the accountant screen lists them. Upload
links a document (hash, retention class) and sets the state to `complete`; "not required" needs a
reason.

## Cleaning finance

Turnovers from the cleaning board produce `turnover_costs` rows (expected net from
`FINANCE_CLEANING_EXPECTED_NET_CENTS`, supplier from the counterparty with a cleaning default). The
cleaner's monthly invoice is the expense; the reconciliation of expectation vs. invoice is shown per
unit and per stay (`cleaningPerStayCents` in profitability). Expected costs never enter the P&L.

## Payment fees

PayPal fees are `fee` transactions (category `payment_fees`, `DE_EXEMPT`, § 4 Nr. 8 UStG) taken from
the activity download; the capture cash fact keeps its gross so the guest payment reconciles to the
revenue, and the fee reconciles to the payout difference.
