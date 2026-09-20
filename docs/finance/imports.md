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
| `booking_com_reservations` | Extranet reservation statement | **experimental** |
| `booking_com_payouts` | Extranet payout report | **experimental** |

Experimental adapters are labelled so on the screen and in the batch row; their header check is
strict, and a file of the wrong shape is *rejected* with the missing columns named. Nothing is
"guessed" into production readiness: promote an adapter only after a real file has been staged,
inspected and committed against a test database.

## Flow

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

## Privacy

Booking.com guest names are reduced to an initial at staging; PayPal payer names are kept only as a
short counterparty label on the payment row; nothing from an import appears in a URL.

## Tests

`tests/finance/imports-invoices.test.ts` (parser, delimiter detection, round trip, dates, adapter
readiness, rejection, bank rows incl. tax and payout kinds and hash keys, expense arithmetic check,
PayPal status filter, Booking.com initials and date check), `tests/integration/finance.test.ts`
(stage → commit → payments once; duplicate file; wrong format rejected).
