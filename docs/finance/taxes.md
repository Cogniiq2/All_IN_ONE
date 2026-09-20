# Company taxes (KSt, Soli, GewSt) — estimation

The system produces a **planning estimate** of the GmbH's income taxes from the management P&L and
a handful of effective-dated rates. It is not a tax computation: no tax balance sheet, no
depreciation schedule, no loss carry-forward, no § 8b, no interest barrier. Every figure is stage
`system_estimate` until the adviser records otherwise.

## Rates (`bolagio_finance_tax_rates`, mirrored in `lib/finance/tax/rates.ts`)

| Tax | Rate | Basis | Status in the seed |
|---|---|---|---|
| Körperschaftsteuer | 15 % (until 2027), then 14 → 13 → 12 → 11 → 10 % (2028–2032) | § 23 Abs. 1 KStG; step-down enacted by the Gesetz für ein steuerliches Investitionssofortprogramm of 14 July 2025 | 15 % confirmed; step-down rows review-flagged until the adviser confirms them for the estimate year |
| Solidaritätszuschlag | 5.5 % of the KSt | § 4 SolzG 1995; upheld by the BVerfG on 26 March 2025 (2 BvR 1505/20) | confirmed |
| Gewerbesteuer Messzahl | 3.5 % | § 11 Abs. 2 GewStG | confirmed |
| Gewerbesteuer Hebesatz Bayreuth | **390 % placeholder** | Hebesatzsatzung der Stadt Bayreuth | **review_required** — secondary sources disagree (390 % for 2025; 370 % and 395 % quoted for 2026); the official Hebesatzsatzung was not reachable from this environment. Record the confirmed value with its source on `/admin/finance/settings`. |

No Freibetrag for a GmbH (§ 11 Abs. 1 S. 3 GewStG applies to natural persons and partnerships only).
Gewerbeertrag is rounded down to full 100 € (§ 11 Abs. 1 S. 3 GewStG). GewSt is not deductible from
its own base nor from the KSt base since 2008 (§ 4 Abs. 5b EStG).

## Computation (`lib/finance/tax/company.ts`)

```
result before tax (management P&L, fiscal year to date)
+ adviser adjustments (non-deductible expenses, GewSt additions § 8 GewStG, …)   ← tax_adjustments
= estimated taxable income
KSt  = income × KSt rate(year)
Soli = KSt × 5.5 %
Gewerbeertrag = round_down_100(income + GewSt additions)
GewSt = Gewerbeertrag × 3.5 % × Hebesatz
```

Negative income → zero taxes (losses are not carried by the system; the adviser records them as an
adjustment when relevant).

## Calendar

| Tax | Advance payments | Basis |
|---|---|---|
| KSt / Soli | 10 March, 10 June, 10 September, 10 December | § 31 Abs. 1 KStG i.V.m. § 37 Abs. 1 EStG |
| GewSt | 15 February, 15 May, 15 August, 15 November | § 19 Abs. 1 GewStG |
| Returns | planning date 31 July of the following year; with adviser representation the statutory date is later (§ 149 Abs. 3 AO) — the adviser sets the real one | |

All dates shift to the next working day after Bavarian holidays (§ 108 Abs. 3 AO). Official dates
from notices (`tax_notice_dues`) override planning dates and are labelled *official*.

## Notices and payments

A notice (Vorauszahlungsbescheid, Steuerbescheid, Änderungsbescheid, Zinsbescheid, …) is recorded with
its authority, assessment date, amounts and due dates, optionally with the scanned document. Recording
an assessment moves the period to stage `assessed`; the difference to the estimate is shown. Tax
payments (advance, final, refund, interest, surcharge) reduce the open liability.

## Reserve and free cash (`lib/finance/tax/reserve.ts`)

```
required reserve = Σ over open periods of max(0, governing liability − paid)
coverage         = held (latest 'tax' reserve rows) / required
free cash        = cash now − required reserve − open supplier liabilities − other reserves
```

`cash now` is `null` (and so is free cash) until an account opening balance exists. Coverage under
25 % raises a high attention item and the `TAX_RESERVE_UNDERFUNDED` alert.

## What the adviser decides (never the system)

Depreciation (useful lives, GWG, Sammelposten), provisions, accruals, loss carry-forwards, § 8b,
the trade tax additions and deductions, the fiscal-year and filing dates, and every filed amount.
