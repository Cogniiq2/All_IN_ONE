# VAT (Umsatzsteuer)

**Everything here is a system estimate** unless a person recorded a later stage. Rates and rules are
effective-dated tax codes (`bolagio_finance_tax_codes`); the engine is `lib/finance/tax/vat.ts`
(`VAT_RULES_VERSION`).

## Tax codes

| Code | Rate | Treatment | Notes |
|---|---|---|---|
| `DE_ACCOMMODATION_REDUCED` | 7 % | reduced | § 12 Abs. 2 Nr. 11 UStG, short-term letting of living/sleeping rooms |
| `DE_STANDARD` | 19 % | standard | § 12 Abs. 1 |
| `DE_REDUCED` | 7 % | reduced | § 12 Abs. 2 Nr. 1, Anlage 2 |
| `DE_FOOD_REDUCED` | 7 % | reduced | food items (Anlage 2); minibar snacks |
| `DE_BEVERAGE_STANDARD` | 19 % | standard | beverages stay at 19 % (also after 1 Jan 2026) |
| `DE_ANCILLARY_STANDARD` | 19 % | standard | services not directly serving the letting (Aufteilungsgebot) |
| `DE_ANCILLARY_REVIEW` | — | review_required | cleaning fee etc. until the adviser decides |
| `DE_REVERSE_CHARGE` | 19 % | reverse charge | § 13b: output and input in the same return |
| `DE_EXEMPT` | 0 % | exempt | § 4 (e.g. payment fees, § 4 Nr. 8) |
| `DE_OUTSIDE_SCOPE` | 0 % | outside scope | deposits, internal transfers, taxes |
| `DE_REVIEW_REQUIRED` | — | review_required | parked; counts toward nothing |

## Position per period

```
output VAT      = Σ vat_cents of revenue / refund / credit_note lines (net of refunds)
reverse charge  = Σ reverse_charge_vat_cents (added to output AND to input, § 13b / § 15 Abs. 1 Nr. 4)
input VAT       = Σ vat_cents × deductible_bp / 10000 of expense lines with treatment deductible / partially_deductible
excluded        = input VAT on lines under review, or whose transaction has no document (listed, not deducted)
payable         = output + reverse charge − input − reverse charge (+ adviser adjustments)
```

Refund lines are negative, so the sums net out without special cases. Lines under a review-required
code appear in the *excluded* bucket with their amount so nobody forgets them.

## Filing calendar

Policy: `vat_filing_frequency` (monthly / quarterly / annual_only) and `dauerfristverlaengerung`
(true/false). Deadline: the 10th day after the period (§ 18 Abs. 1 UStG), + 1 month with
Dauerfristverlängerung (§§ 46–48 UStDV; the 1/11 Sondervorauszahlung is due by 10 February each year
and is recorded as a tax payment of kind `advance`). Deadlines falling on a Saturday, Sunday or a
Bavarian public holiday move to the next working day (§ 108 Abs. 3 AO). Annual return: policy month
(`vat_annual_return_month`, default July of the following year — the statutory date with adviser
representation is later; the adviser sets it).

Which frequency applies to BoLaGio GmbH (previous-year VAT thresholds in § 18 Abs. 2, 2a UStG) is
**not known to the system**: it is a policy value the adviser confirms.

## Stages

`system_estimate → accountant_reviewed → filed → assessed → paid`. `recordSystemTaxEstimates` writes a
`system_estimate` row per VAT period every run; a higher stage recorded by the accountant path
always governs. Screens show the stage badge; exports mark system figures `ESTIMATE`.

## Small business scheme

`small_business_scheme` policy (§ 19 UStG, thresholds 25 000 € / 100 000 € since 2025). The invoice
gate requires the value to be decided (`false` for regular taxation). Not decided → no invoice.

## Open decisions for the adviser

- Final cleaning fee: part of the accommodation supply (7 %) or a separate service (19 %)?
- Filing frequency and Dauerfristverlängerung for the current year.
- Treatment of Booking.com commission invoices (Booking.com B.V., NL): reverse charge is the
  suggestion; the counterparty rule is seeded with it but not auto-verified.

## The VAT return from the stays (since 19 Oct 2026)

`lib/finance/tax/stay-tax.ts` (`STAY_TAX_RULES_VERSION`) computes, for every reservation, the German VAT
consequences of the stay — and `buildVatReturn` turns the stays whose VAT month falls in a period into the
boxes of the Umsatzsteuer-Voranmeldung. The same function feeds the VAT page (`/admin/finance/vat`), the
"Money & tax" section of every reservation page, the recorded `system_estimate` and the posting of
Booking.com statement lines, so the four cannot disagree.

| Step | Rule | Certainty |
|---|---|---|
| What was sold | ≤ 6 months: short-term accommodation, 7 % (§ 12 Abs. 2 Nr. 11 S. 1); > 6 months: exempt long-term letting (§ 4 Nr. 12 S. 1 a, S. 2; Abschn. 4.12.9 UStAE) | law |
| Taxable amount | the full price the guest paid; the platform's commission never reduces it (§ 10 Abs. 1 S. 2) | law |
| Split | net = gross ÷ 1.07, rounded half-up; VAT = gross − net | law |
| Period | Sollversteuerung: the month of check-out (§ 13 Abs. 1 Nr. 1 a S. 1) | law |
| Commission | Booking.com B.V. (NL): reverse charge — 19 % owed (Kz 46/47) and deducted (Kz 67); not deductible against an exempt stay (§ 15 Abs. 2 Nr. 1) | law |
| Payment fee | reverse charge (default) or exempt (§ 4 Nr. 8) — policy `ota_payment_fee_vat`; costs no VAT either way on a taxable stay | adviser |
| Cancellation charge | excluded and listed until decided; policy `cancellation_charge_vat=taxable` taxes it at 7 % | adviser |
| Prepayment (Mindest-Ist) | not applied; shown on the VAT page as an adviser question | adviser |

Sources, strongest first: the Booking.com statement line → Beds24 (`price`; `commission` since Booking.com
began sending it on 17 Oct 2026) → "not known yet" (an open question, never an estimate). The books add only
what is not a stay: purchases (Kz 66) and other sales such as the minibar (Kz 81 / other Kz 86) —
accommodation and the platforms' reverse charge are never taken from the books, so nothing counts twice.

ELSTER takes bases in whole euros and computes the tax on Kz 81/86 itself; both the exact sum and the
form figure are kept and shown, so a few cents' difference is explained, not mysterious.

Booking.com statement lines are now posted by the same engine: stay at `DE_ACCOMMODATION_REDUCED` (net/VAT
split), commission and fee at `DE_REVERSE_CHARGE`, all `suggested` (a person confirms). Cancellation charges
and long-term lettings remain on `DE_REVIEW_REQUIRED`.
