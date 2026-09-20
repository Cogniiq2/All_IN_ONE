# Accountant hand-over (Steuerberater)

`/admin/finance/accountant` is the monthly hand-over desk: per period the readiness (open items that
block a review or a lock), the period status ladder, the exports, and the open questions.

## Period ladder

| Status | Who | Meaning |
|---|---|---|
| `open` | — | postings and reclassifications allowed |
| `review` | operator (`finance.review`), only when ready | handed to the adviser; postings still allowed |
| `accountant_reviewed` | accountant path (`finance.tax_review`) | reviewed; blockers (unclassified lines, mismatches) must be zero |
| `locked` | accountant path | nothing dated in the period can change; reopening needs a recorded reason |

Locking is enforced by the database (`BLG11`), not by the screen: an import, an ingestion or a form
dated into a locked month is refused.

## Accountant lock on a line

A reclassification with *Lock as accountant* sets the line's classification to `accountant_locked`;
operators can no longer touch it, and even the accountant path must reverse and repost to change
its money.

## Exports (`lib/finance/export/builders.ts`)

CSV, `;`-separated, UTF-8 with BOM, CRLF, decimal comma — what German Excel and DATEV tools open.
Every file starts with a metadata header: kind, period, generated at/by, generator + version, source,
amount conventions, and an *ESTIMATE* note when any figure is a system estimate. Every export is
registered (`bolagio_finance_exports`) with its SHA-256, so a file the adviser holds can be matched to
the run that produced it.

Kinds: revenue ledger, expense ledger, transaction ledger, payments ledger, VAT report, reverse-charge
report, Booking.com commission, property profitability, P&L, cash flow, tax estimate, tax adjustments,
missing documents, asset candidates, accountant review summary.

## DATEV

`lib/finance/export/datev.ts` is a **mapping layer, not an export**. It proposes rows in the shape
of the DATEV-Format Buchungsstapel (format version 700, category 21: Umsatz, S/H, Konto, Gegenkonto,
BU-Schlüssel, Belegdatum DDMM, Belegfeld 1, Buchungstext, KOST1) with per-row blockers (no confirmed
account, unexportable tax code, missing document). `datevGate` stays closed until
`FINANCE_DATEV_EXPORT_ENABLED=true`, `FINANCE_DATEV_SKR` (SKR03/SKR04) is set, and every used category
has an adviser-confirmed account (`datev_confirmed`). The BU keys in `BU_KEY_PROPOSAL` are proposals
for the adviser to confirm. A file is written only after a test import at the adviser's DATEV.

## What the adviser gets each month

1. Ledger exports for the period, with the document coverage list.
2. VAT position with the excluded bucket (undocumented / under review) spelled out.
3. Open questions: review-required lines, reverse-charge suggestions, asset candidates, mismatches.
4. Tax estimate vs. notices, reserve coverage.
5. Uploaded originals (or the note that no bucket is configured yet).

## What the adviser gives back

Reviewed lines (locked), the period status, notices and assessments, adjustments (non-deductible,
GewSt additions), confirmed rates (Hebesatz), confirmed DATEV accounts, and the filed amounts as
stages — each recorded through the accountant path and audited.
