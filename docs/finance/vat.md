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
