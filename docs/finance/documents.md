# Documents

The registry (`bolagio_finance_documents`) is the evidence layer: every invoice, statement, receipt,
notice and contract the finance domain relies on, with its **SHA-256**, size, type, source, dates,
retention class and links.

## Upload

`uploadDocumentAction` (`finance.edit`): PDF, JPEG, PNG, WebP, XML, CSV, text; 15 MB max. The action
hashes the bytes, sniffs a structured e-invoice (`factur-x.xml` / `zugferd-invoice.xml` in a PDF,
`urn:cen.eu:en16931` + XRechnung in XML, `CrossIndustryInvoice`), stores the original in the private
bucket `FINANCE_DOCUMENT_BUCKET` when configured (key `finance/<sha[0..2]>/<sha>`), and registers the
row. The same bytes register once: a duplicate upload links the existing document and says so.
Without a bucket the registry still works (hash, metadata, links); the original is not stored — the
settings screen says so.

Structured e-invoices are **detected, never validated** here: `structured_valid` stays `null` until a
validator is wired (see `invoices.md`).

## Links and states

A document links to transactions, payments, invoices and notices (`document_links`). Linking to a
transaction sets its `document_state` to `complete`. `missing` expenses are inbox items and are listed
on the accountant screen; `not_required` needs a reason (e.g. bank fee).

## Retention

Class from the type (`retentionClassFor`), period from the end of the calendar year of the document
date (§ 147 Abs. 4 AO):

| Class | Years | Basis |
|---|---|---|
| invoice (supplier, guest, credit note, Booking.com commission, e-invoice) | 8 | § 14b Abs. 1 UStG; § 147 Abs. 1 Nr. 4, Abs. 3 AO (BEG IV, from 1 Jan 2025 for documents whose old period had not expired on 31 Dec 2024) |
| accounting voucher (statements, receipts) | 8 | § 147 Abs. 1 Nr. 4, Abs. 3 AO |
| annual accounts / books | 10 | § 147 Abs. 1 Nr. 1 AO; § 257 HGB |
| tax notice | 10 (planning; adviser to confirm) | kept with the books |
| contract | 10 (planning; adviser to confirm) | |
| business letter | 6 | § 147 Abs. 1 Nr. 2, 3 AO |

`retain_until` is computed at registration; `legal_hold` blocks any deletion; nothing is deleted by
the system today (see `retention.md`). GoBD: originals are kept unchanged (hash), every change to the
record is a new row, and the audit log names who did what.

## Privacy

Documents may carry guest data (a guest invoice). Finance screens show the booking reference, never
the guest's name beyond the desk's "Last, F." label; exports carry references, not names; URLs carry
ids, never names or e-mails.
