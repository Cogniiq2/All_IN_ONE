# Guest invoices

## Principle: fail closed

An invoice is issued only when **every** § 14 Abs. 4 UStG requirement is satisfied by the
configuration and by the draft (`lib/finance/invoices.ts` → `invoiceRequirements`, `canIssue`):

| Check | Legal basis | Source |
|---|---|---|
| Issuer name and address | § 14 Abs. 4 Nr. 1 | `INVOICE_ISSUER_LEGAL_NAME`, `INVOICE_ISSUER_ADDRESS` |
| Recipient name and address | Nr. 1 | the booking (no postal address → blocked) |
| Steuernummer or USt-IdNr | Nr. 2 | `INVOICE_ISSUER_TAX_ID` (never in source; shown masked) |
| Issue date | Nr. 3 | set at issue |
| Sequential unique number | Nr. 4 | `INVOICE_SERIES` + gapless counter (`bolagio_invoice_sequences`) |
| Quantity and description per line | Nr. 5 | draft lines |
| Date or period of supply | Nr. 6 | stay dates |
| Net per rate, reductions | Nr. 7 | line sums must equal the header |
| Rate and VAT per line (or exemption note) | Nr. 8 | no line under a review-required code |
| Small-business status decided | § 19 UStG | `INVOICE_SMALL_BUSINESS=false` for regular taxation |
| Copy retained | § 14b UStG | the issued invoice is registered as a document (8 years) |

The screen lists every requirement with its state; the issue button exists only when all are green,
and the server re-checks. No configuration → no invoice, ever. Nothing is e-mailed by this system.

## Drafts

`buildDraft(stay, minibar, config)` maps the stay's components to lines (accommodation 7 %; a
service fee stays review-required until the adviser decides the Aufteilungsgebot question; deposits
outside scope) and appends minibar consumption at its product tax code. Gross → net + VAT with
half-up rounding; the footer sums by rate (§ 14 Abs. 4 Nr. 7, 8).

## Issue

`issueInvoice`: draws the next number for the series, freezes the row (status `issued`, issuer
snapshot, masked tax id), registers the canonical content as a document with its hash and links it to
the invoice and to the revenue transaction. Issued rows refuse updates. A wrong invoice is not
edited: a **credit note** (`buildCreditNote`, negative mirror of chosen lines, `corrects_invoice_id`)
and a new invoice.

The print view (`/admin/finance/invoices/[id]`) renders from the frozen row; a PDF pipeline is not
part of this branch.

## Numbering

Shared with the existing invoicing module: `formatInvoiceNumber(series, counter)` →
`SERIES-000001`. One series per legal entity is enough; the counter is allocated inside the database
so two operators cannot draw the same number.

## E-invoice (EN 16931)

`lib/finance/e-invoice.ts` maps an issued draft to the EN 16931 core model (BT/BG ids, VAT categories
S/E/AE/O, per-rate breakdown, 380/381 type codes) and `eInvoiceGate` keeps generation **off** until
`FINANCE_EINVOICE_GENERATION_ENABLED=true` *and* a validator (`FINANCE_EINVOICE_VALIDATOR_URL`, the
KoSIT schematron) is configured. Receiving e-invoices has been mandatory for domestic B2B since
1 January 2025; issuing becomes mandatory on 1 January 2027 for companies above 800 000 € previous-year
turnover and on 1 January 2028 for all (§ 27 Abs. 38 UStG). Guest (B2C) invoices are not affected;
corporate guests with a German VAT id are (`isDomesticB2B`). Uploaded XRechnung / ZUGFeRD files are
detected and kept as originals.

## Tests

`tests/finance/imports-invoices.test.ts` (requirements, fail-closed gate, blocked drafts, tampered
header, credit note, totals by rate, EN 16931 model), `tests/integration/finance.test.ts` (blocked
without configuration; issued with it; numbers `TST-000001`, `TST-000002`; frozen row; registered copy
with retention class).
