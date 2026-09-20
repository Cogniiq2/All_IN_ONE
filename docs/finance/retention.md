# Retention

Finance data is subject to the statutory retention periods; the website's existing retention job
(`lib/retention/policy.ts`, `docs/data-retention.md`) knows the finance tables through
`financeClasses()` and **never deletes** any of them.

| Data | Class | Period | Basis |
|---|---|---|---|
| transactions, lines, overrides, payments, reconciliations, tax estimates/adjustments/payments, reserves, exports, import batches/rows, minibar movements | books and records | 10 years from the end of the calendar year | § 147 Abs. 1 Nr. 1, 4, 5, Abs. 3, 4 AO; § 257 HGB |
| invoices, invoice lines, documents of class invoice / accounting voucher | invoices and vouchers | 8 years | § 14b Abs. 1 UStG; § 147 Abs. 3 AO as amended by the Viertes Bürokratieentlastungsgesetz (BGBl. 2024 I Nr. 323), applicable from 1 Jan 2025 to documents whose old 10-year period had not expired on 31 Dec 2024 |
| tax notices | with the books | 10 years (planning) | adviser to confirm |
| business letters | correspondence | 6 years | § 147 Abs. 1 Nr. 2, 3 AO |
| admin audit log rows for finance actions | operational record | as the existing audit log | `docs/data-retention.md` |

Rules the code enforces:

- `retain_until` is computed at document registration from the document date's calendar year.
- `legal_hold = true` blocks deletion regardless of the date.
- The retention period **starts anew** when the underlying tax assessment is still open (§ 147 Abs. 3
  S. 5 AO): the system does not track assessment finality, so **no automatic deletion of finance data
  is implemented**. A future purge needs the adviser's confirmation per year and a documented
  DSGVO deletion concept (Art. 17 Abs. 3 lit. b DSGVO covers the statutory retention).

Guest personal data inside finance (recipient name and address on an issued invoice) is retained
with the invoice for its statutory period; the booking core's own guest-data retention applies to the
booking row.

GoBD (BMF letter of 28 Nov 2019 as amended 11 Mar 2024 and 14 Jul 2025): unchangeability is met by
append-only tables and hashes, traceability by actor and reason on every override and status change,
completeness by idempotent ingestion keys, and the procedural documentation is this `docs/finance/`
set plus `data-model.md`.
