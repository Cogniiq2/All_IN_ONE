# Imports

`lib/finance/import/` — a strict CSV parser (RFC 4180 quoting, `;` `,` tab auto-detection, BOM and
CRLF tolerant, malformed rows reported by line) and adapters that turn rows into staged payments,
expenses or revenue.

## Adapters and their honesty labels

| Adapter | Source | Readiness |
|---|---|---|
| `bolagio_bank_csv` | bank statement in the BoLaGio template (Buchungstag; Valuta; Betrag; Auftraggeber/Empfaenger; Verwendungszweck; Transaktions-ID) | **validated** (unit + integration tests) |
| `bolagio_expenses_csv` | expenses template (Datum; Rechnungsdatum; Faellig; Lieferant; Land; USt-ID; Rechnungsnummer; Beschreibung; Kategorie; Einheit; Netto; USt; Brutto) | **validated** |
| `paypal_activity` | PayPal → Activity → Download (English headers) | **experimental** — not validated against a live download |
| `booking_com_finance_statement` | Booking.com Extranet → Finance → statement export, as downloaded (15 columns incl. Amount, Commission, Payments Service Fee, Net, Payout date, Payout ID) | **validated** against a live export — see [`booking-com-statement.md`](booking-com-statement.md) |
| `booking_com_reservations` | assumed "reservation statement" columns that no real export carries | **retired** — kept only so historical batches render |
| `booking_com_payouts` | assumed "payout report" columns; recorded each payout as a cash fact, which double counts against the bank | **retired** — kept only so historical batches render |

Readiness `retired` means: still resolvable for a batch staged with it (label, rows, evidence), never
offered in the upload form, never auto-detected, and refused by the stage action and command.

Experimental adapters are labelled so on the screen and in the batch row; their header check is
strict, and a file of the wrong shape is *rejected* with the missing columns named. Nothing is
"guessed" into production readiness: promote an adapter only after a real file has been staged,
inspected and committed against a test database.

## What an adapter refuses rather than guesses

- **A currency that is not EUR.** Nothing here converts currency and every report sums `gross_cents`
  as euros, so a single foreign-currency row would corrupt the P&L silently. All four adapters
  refuse one, naming the currency, and say to post it by hand at the rate it was booked.
- **An unreadable commission.** A `Commission amount` cell that is present but not an amount is an
  error row, not a silent zero — dropping it understates the cost of the stay. An *empty* cell is
  accepted and means no commission.
- **A cancelled or no-show reservation with a price.** This is a cancellation charge, not a night
  sold. Whether it is a taxable supply or untaxed compensation (*echter Schadensersatz*) is
  unsettled, so the amount is posted in full on `DE_REVIEW_REQUIRED` — rate 0, counting toward no
  VAT figure — as `other_guest_charges`, `needs_review`, with a note saying what it is. A cancelled
  row with **no** price is still dropped: there is nothing to post. A reservation that actually
  happened is unaffected and still posts at 7 %.

## Flow

0. **Choose** the adapter, or leave "Detect from the file's columns": detection reads the header line
   only and never picks a retired adapter. The upload must be a `.csv`/`.txt` text file up to 5 MB and
   20 000 rows.
1. **Stage** (`stageImport`): hash the file (the same bytes are refused as `duplicate_file`), parse,
   detect duplicates *within* the file (same provider reference / same expense key), count valid /
   error / duplicate rows, store every row with its raw values, parsed values, status and error.
   Status `validated` or `rejected`.
2. **Preview**: `/admin/finance/imports/[id]` shows every row and its reason.
3. **Commit** (`commitImport`): valid rows become payments (idempotent on source + provider reference)
   or expenses (through the categorization engine) or revenue; skipped rows are counted; the batch
   turns `imported` and refuses a second commit.

Bank rows without a transaction id get a deterministic key from date, amount, purpose and
counterparty, so re-importing an overlapping statement duplicates nothing.

Booking.com finance-statement rows do not go through the payment/expense/revenue path: each becomes a
**settlement line** (`bolagio_finance_ota_settlements`) recorded idempotently on its logical identity
(reservation number + payout ID + row type) and content hash — overlapping exports are skipped, amended
lines are held for review — and only then posted to the ledger. See
[`booking-com-statement.md`](booking-com-statement.md).

Row numbers are the record's own number in the file: a malformed row no longer shifts the numbers of
the rows after it (which could collide on the batch's unique `row_no`).

## Privacy

An adapter may declare **redacted columns**: their values are replaced by `[redacted]` in the raw row
*before* it is stored. The Booking.com finance statement redacts `Guest name` — the finance record
does not need it and nothing matches on it. (The retired reservation adapter reduced the name to an
initial.) PayPal payer names are kept only as a short counterparty label on the payment row. Raw rows
of bank and PayPal files can still contain counterparty names; they are finance evidence behind
`finance.view`, never logged, and follow the finance retention class (`lib/retention/policy.ts`).
Nothing from an import appears in a URL.

## Tests

Booking.com finance statement: `tests/finance/booking-com-statement.test.ts` (fixture, parser, dates,
money, currency, arithmetic, identity, matching, reconciliation, aggregation),
`tests/finance/booking-com-security.test.ts` (who may stage/commit/re-match/accept; no client access
to the service role), `tests/integration/booking-com-statement.test.ts` (real schema: totals, payouts,
idempotency, amendments, re-match, guards, screens).

`tests/finance/imports-invoices.test.ts` (parser, delimiter detection, round trip, dates, adapter
readiness, rejection, bank rows incl. tax and payout kinds and hash keys, expense arithmetic check,
PayPal status filter, Booking.com initials and date check), `tests/integration/finance.test.ts`
(stage → commit → payments once; duplicate file; wrong format rejected).
