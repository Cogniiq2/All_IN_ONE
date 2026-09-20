# Invoicing — the foundation

What exists: a gapless number sequence in the database, an `invoice.required`
event once per confirmed, paid direct booking (an invoice is owed at confirmation), and a draft contract in
`lib/invoicing/` that turns a paid booking into invoice lines **only once the
tax facts are configured**. What does not exist: a document, a sender, an
accounting export, or any guessed rate.

## 1. Why nothing is assumed

A German invoice must state the VAT rate and amount per line (§ 14 UStG), or
the § 19 UStG small-business notice instead. Whether accommodation is 7 %,
whether cleaning is 19 %, whether a Kurtaxe is out of scope, and whether the
company is a small business are facts the tax adviser supplies. A default
would be a wrong invoice with a valid-looking number. So:

- `invoiceReadiness()` lists the blockers by name;
- `prepareInvoiceDraft()` throws `InvoiceNotReadyError` while any remains;
- a line whose tax category Beds24 did not identify (`unknown`) is refused,
  not defaulted.

## 2. Configuration (all optional, none defaulted)

| Variable | Meaning |
|---|---|
| `INVOICE_SMALL_BUSINESS` | `true` / `false`. § 19 UStG status. |
| `INVOICE_VAT_ACCOMMODATION_PERCENT` | Rate for `accommodation` lines. |
| `INVOICE_VAT_SERVICE_PERCENT` | Rate for `service` lines (cleaning etc.). |
| `INVOICE_VAT_CITY_TAX_PERCENT` | Rate for `city_tax` lines (0 if out of scope). |
| `INVOICE_VAT_DEPOSIT_PERCENT` | Rate for `deposit` lines. |
| `INVOICE_ISSUER_LEGAL_NAME` | As it must appear on the document. |
| `INVOICE_ISSUER_ADDRESS` | One line. |
| `INVOICE_ISSUER_TAX_ID` | Steuernummer or USt-IdNr. |
| `INVOICE_SERIES` | e.g. `BLG-2026`. One sequence per series. |

Values are not secrets but are business facts; keep them with the deployment
variables, never in the repository.

## 3. The draft

- Lines: the booking's **mandatory** quote components, gross as charged, in
  the booking currency. A component "payable on site" is not invoiced.
- Split: `net = round(gross / (1 + rate))`, `VAT = gross − net`, so the
  document total equals the PayPal capture to the cent. `tests/invoicing.test.ts`
  proves the identity for every rate.
- Recipient: the guest as recorded on the booking.
- Number: **none** on the draft. `allocateInvoiceNumber(series)` draws from
  `bolagio_next_invoice_number` at issue time, under a row lock, gaplessly.
  An abandoned draft consumes no number.

## 4. Where it plugs in

`invoice.required` (outbox) → n8n (`bolagio-outbox-event-pump`) → a future
"issue invoice" step that calls a not-yet-written internal endpoint which
runs `prepareInvoiceDraft`, allocates the number, renders the document and
records it. That endpoint is not written because its first call would issue
a legally relevant document; it is listed in the remaining code work of the
completion report.

## 5. Decisions required before the next step

1. § 19 UStG status.
2. VAT rates per category; treatment of the Kurtaxe.
3. Issuer identity and tax id.
4. Numbering series convention (per year? per property?).
5. Whether the invoice is issued at confirmation or at departure (the event
   fires at confirmation; the accountant may prefer departure).
6. Storage and retention of the document (10 years, § 147 AO) — see
   `docs/data-retention.md`.

## Guest invoices in Finance

The Finance & Tax section issues guest invoices and credit notes through a fail-closed § 14 UStG gate, reusing this module's series and gapless numbering (`allocateInvoiceNumber`, `formatInvoiceNumber`). See `docs/finance/invoices.md`.
