# Booking.com finance statement — import, settlement lines, payouts

The Booking.com Extranet **Finance** statement export is the authoritative source for what
Booking.com says each reservation grossed, what it kept as commission and as payment-service fee,
what it paid out net, and under which payout. This document describes how that file enters the
finance system, what it becomes, and what it deliberately does **not** do.

Code: `lib/finance/import/booking-com-statement.ts` (parse, pure) · `lib/finance/settlements.ts`
(match, reconcile, aggregate, pure) · `lib/finance/import/adapters.ts` (adapter
`booking_com_finance_statement`) · `lib/finance/commands.ts` (record, post, re-match, amendments) ·
`supabase/migrations/20260926120000_booking_com_finance_statement.sql` ·
`app/(admin)/admin/(control)/finance/booking-com/` · `components/admin/finance/settlement-views.tsx`.

---

## 1. Source authority matrix

| Fact | Authority | Where it lives | Never taken from |
|---|---|---|---|
| Booking identity, status, stay dates, unit, guest | **Beds24** | `bolagio_reservations` (read-only import) | the finance statement |
| Local reservation gross ("price as the provider states it") | **Beds24** | `bolagio_reservations.total_amount_cents` | — (kept; never overwritten) |
| Statement gross (`Amount`) | **Booking.com finance statement** | `bolagio_finance_ota_settlements.gross_cents` | Beds24 |
| Commission | **Booking.com finance statement** | `…commission_cents` (+ signed `source_commission_cents`) | Beds24 — see below |
| Payment-service fee | **Booking.com finance statement** | `…payment_service_fee_cents` (+ signed source) | Beds24 |
| Net settlement per reservation | **Booking.com finance statement** | `…net_cents` | — |
| Payout ID and payout date | **Booking.com finance statement** | `bolagio_finance_ota_payouts` + each line | — |
| Cash actually received for a payout | **Bank statement** (bank import) | `bolagio_finance_payments` (source `bank`), linked to the payout via `bolagio_finance_ota_payouts.bank_payment_id` | the finance statement |
| Direct-booking money | **PayPal** (when direct booking is enabled) | `bolagio_finance_payments` (source `paypal`) | — |
| VAT classification of any of the above | **Adviser-confirmed rules** | ledger lines, reclassified by a person | the statement, Beds24, this importer |

**Beds24 `commission = 0` is not evidence of zero commission.** Beds24 has returned 0 where the
commission was simply not supplied. Nothing in this system reads a commission from Beds24; the only
commission figure used is the one on the Booking.com finance statement.

---

## 2. The operator workflow

```
Booking.com Extranet
  → Finance
  → statement / export
  → CSV (download as-is; do not open and re-save in Excel)
→ BoLaGio Admin
  → Finance
  → Imports
  → Adapter: "Detect from the file's columns" (or "Booking.com finance statement")
  → Stage and validate
  → Preview (summary card, every line, its match, payouts)
  → Import valid rows (commit)
→ Finance → Booking.com   (the dashboard)
```

The file works exactly as Booking.com exports it. Nothing has to be transformed by hand.

### What the file must look like

Exactly these fifteen columns (extra columns are tolerated; a missing one rejects the file and names
it):

`Type, Booking number, Check-in, Checkout, Guest name, Payments service provider, Reservation status,
Currency, Payment status, Amount, Commission, Payments Service Fee, Net, Payout date, Payout ID`

Validated against a live export (September 2026): comma-separated, `Type = Reservation`, dates like
`11 Sept 2026`, `Commission` and `Payments Service Fee` **negative**, `Amount` and `Net` positive,
`Payment status = by_booking`, several reservations sharing one `Payout ID`.

---

## 3. Parsing and validation (per row; never repaired)

| Check | Result when it fails |
|---|---|
| `Type` is a validated row type (`Reservation`) | error row, kept as evidence — other types are not guessed at |
| `Booking number` is 6–20 digits | error row |
| `Check-in`, `Checkout`, `Payout date` are real calendar dates (`11 Sept 2026`, `Sep`, full names, ISO, `DD.MM.YYYY`) | error row; `31 Sept` is refused |
| `Checkout` after `Check-in` | error row |
| `Currency` is a 3-letter code **and** supported (EUR only) | error row: *unsupported*, never read as euros, never converted |
| amounts: `1234.56`, `1,234.56`, `-358.96`, optional `EUR`/`€`; at most two decimals | error row: a German decimal comma, three decimals, brackets or a formula are refused |
| `Amount ≥ 0`, `Commission ≤ 0`, `Fee ≤ 0` on a reservation row | error row (a positive commission has not been seen live) |
| **`Amount + Commission + Payments Service Fee = Net`**, to the cent | error row naming the numbers and the drift |
| `Payout ID` present | error row: *not settled yet — import again after the payout* |
| field length ≤ 200, file ≤ 5 MB, ≤ 20 000 rows | error row / rejected upload |

**Rounding tolerance: zero.** The live export balances to the cent on every row, so there is no
evidence that Booking.com rounds components independently. `ROW_IDENTITY_TOLERANCE_CENTS` documents
where to change it, with a real file as the evidence.

**Money** is parsed digit-by-digit into integer cents; no floating-point value ever holds an amount.
Costs are normalised to **positive** internally (`commission_cents = −source_commission_cents`), and
the file's signed values are stored beside them, so the sign convention is visible, not assumed. The
database enforces both identities with CHECK constraints.

**Dates** are calendar dates. No `Date` object is built from the file's text, so no server time zone
can shift `15 Sept 2026` to the 14th.

**CSV** is data only: RFC 4180 quoting, `,`/`;`/tab detection, UTF-8 BOM and CRLF/LF tolerated. A
cell such as `=1+1` is a string that fails validation; nothing is evaluated.

---

## 4. Data model

The existing ledger holds *economic facts* (transactions + lines) and *cash facts* (payments). A
statement line is neither: it is a **settlement** — gross, two costs and a net — tied to a payout
that bundles several reservations. Forcing it into one ledger row would lose the commission/fee
split; recording its net as a payment would double count cash. So two small tables were added, and
the ledger is reused for the economics.

### `bolagio_finance_ota_settlements` — one row per statement line

| Column(s) | Meaning |
|---|---|
| `provider` | `booking_com` |
| `identity_key` | `booking_com|<booking number>|<payout id>|<row type>` — the logical identity |
| `content_sha256` | SHA-256 over the financial content (dates, currency, all four amounts as signed in the file, payout date, statuses). No guest name. |
| `booking_number`, `row_type`, `check_in`, `check_out`, `reservation_status`, `payment_status`, `payments_service_provider` | statement evidence |
| `payout_id`, `payout_date` | the payout (composite FK to `bolagio_finance_ota_payouts`) |
| `currency`, `gross_cents`, `commission_cents`, `payment_service_fee_cents`, `net_cents` | normalised money, costs positive; `net = gross − commission − fee` enforced |
| `source_commission_cents`, `source_payment_service_fee_cents` | the file's signed values; `= −cost` enforced |
| `reservation_id` (FK → `bolagio_reservations`), `unit_id`, `match_state`, `match_candidates`, `matched_at`, `match_rule_version` | the match (§5) |
| `local_gross_cents`, `local_currency`, `gross_delta_cents`, `gross_state` | the local gross **snapshot** and the delta (§6) |
| `amendment_state` (`current` / `conflict` / `superseded`), `supersedes_id` | amendments (§7) |
| `ledger_state` (`pending` / `posted` / `not_posted` / `legacy_posted`), `revenue_/commission_/fee_transaction_id` | what the line posted (§8) |
| `import_batch_id`, `import_row_id`, `created_by`, `created_at`, `updated_at` | provenance and audit |

Indexes: booking number, reservation FK, `(provider, payout_id)`, payout date, check-out, batch,
unit, `(match_state, gross_state)` on current lines, conflicts. Unique: `(identity_key,
content_sha256)`, and **one `current` line per `identity_key`** (partial unique index).

Guards (trigger `bolagio_finance_ota_settlement_guard`): every evidence and money column is
immutable; delete is refused (`BLG20`); `amendment_state` changes only inside
`bolagio_finance_accept_ota_amendment`; a ledger link, once set, is fixed. Only the match columns and
`ledger_state` may change.

### `bolagio_finance_ota_payouts` — one row per payout ID

`provider`, `payout_id` (unique per provider), `payout_date` (DATE), `currency`,
`first_import_batch_id`, and — for bank reconciliation — `bank_payment_id` (FK → a bank payment,
unique), `bank_state` (`awaiting_bank` / `matched` / `mismatch`), `bank_matched_at/_by`. **No totals
are stored**: `bolagio_finance_ota_payout_totals` (view) sums the current lines, so a total can never
disagree with its lines. A second line claiming the same payout ID with another date or currency is
refused (`BLG21`).

### Import tables (reused)

`bolagio_finance_import_batches` (source type widened to `booking_com_finance_statement`) and
`bolagio_finance_import_rows` (new nullable `settlement_id`, pointing at the line a row became — or,
for a recognised duplicate, the line that already existed).

---

## 5. Matching a line to a local reservation

1. **Exact Booking.com reservation number** against `bolagio_reservations.channel_reference` — the
   persisted OTA reference. Beds24 delivers it as `apiReference` (`lib/integrations/beds24/
   reservations.ts` maps `apiReference ?? channelReference` into that column).
2. Exactly one reservation → **matched** (reservation FK and unit recorded).
3. None → **unmatched**. The line is imported, kept, visible, and can be re-matched later.
4. More than one → **ambiguous**. None is chosen; the candidate count is recorded.

A guest name, stay dates, a unit or an amount are **never** an identity key. The matcher's input type
carries no guest field at all; the unit and dates appear on screen as evidence for a person only.

**Re-matching** (`Finance → Booking.com → Re-match reservations`, `finance.edit`) re-runs the rule on
every current line after a reservation backfill or a fixed reference. It writes only the match
columns — never the statement figures, never the reservation — and posts any line whose ledger
posting is still pending. The unit on an already-posted ledger transaction is not changed by a later
match: allocate it through the transaction screen if needed.

---

## 6. Gross reconciliation (statement vs. local)

Both concepts are stored separately and neither overwrites the other:

- `local_gross_cents` — the Beds24 reservation gross *at match time*
- `gross_cents` — the statement gross

`gross_delta_cents = statement − local`. Classification (tolerance **0 cents**, no evidence for more):

| State | When |
|---|---|
| **Reconciled** | matched, same currency, delta 0 |
| **Gross differs** | matched, delta ≠ 0 or a different currency |
| **No local amount** | matched, Beds24 supplied no amount |
| **Unmatched** / **Ambiguous** | §5 |

A discrepancy is a finding — an adjustment, a cancellation charge, a changed price — never a reason
to write either side.

---

## 7. Idempotency and amendments

**File level:** the SHA-256 of the uploaded bytes is unique per batch; the same file is refused
before anything is parsed into a batch.

**Row level:** `bolagio_finance_record_ota_settlement(row, actor)` runs in one database transaction,
serialised on the line's identity (advisory lock):

| Seen before? | Outcome | Written |
|---|---|---|
| same identity **and** content | `duplicate` | nothing; the import row is `skipped` and points at the existing line |
| same identity, different content | `amendment` | the new content as `conflict` (`supersedes_id` → the current line), **no ledger posting**, shown under *Amended by Booking.com* |
| new identity | `created` | a `current` line, then its ledger postings |

So January–September followed by September–October writes each September line once. Within one
file, an exact repeat is a *duplicate*; two rows with the same identity and different figures are
both flagged as errors — dropping either would silently lose money.

**Accepting an amendment** (`finance.review`, reason required, enforced by the database):
`bolagio_finance_accept_ota_amendment` reverses the original's posted ledger transactions through
the ledger's own reversal function (dated today or the original's date, whichever is later; a locked
period refuses), marks the original `superseded` and the amendment `current` — atomically — and the
amendment's own facts are then posted under their own keys. Both versions stay. Nothing is deleted
or edited.

---

## 8. Ledger posting — and why cash is never double counted

Per **current** line, in the existing ledger (`bolagio_finance_post_transaction`), each idempotent
on `source_system = 'booking_com_statement'`, `source_reference = <identity>#<content hash prefix>`
(`:commission`, `:payment_service_fee` suffixes):

| Transaction | kind / category | Amount | VAT |
|---|---|---|---|
| Statement revenue | `revenue` / `accommodation_revenue` (`other_guest_charges` if the reservation status is not `ok`) | `gross_cents` | `DE_REVIEW_REQUIRED`, rate 0, `needs_review` |
| Commission | `commission` / `ota_commission` | `commission_cents` | `DE_REVIEW_REQUIRED`, input VAT `review_required` |
| Payment service fee | `fee` / `payment_fees` | `payment_service_fee_cents` | `DE_REVIEW_REQUIRED`, input VAT `review_required` |

All three are dated on the check-out date (the existing recognition rule), carry the booking number
as `booking_reference`, the matched unit if any, and `payment_state = reconciliation_state =
not_applicable`: they are settled by Booking.com — costs deducted, net paid out in the payout — and
their cash is reconciled **per payout group**, not per stay.

**No payment is created.** The payout's money is a fact about the bank account. When the bank
statement is imported, its Booking.com credit (already classified `kind = payout` by the bank
adapter) is the one cash fact, and it is linked to one payout group via `bank_payment_id`, compared
against the group's net. The retired `booking_com_payouts` adapter, which recorded each payout as a
cash fact of its own, is no longer offered for new uploads precisely because doing both would count
the same euros twice. `verify.sql` asserts that no payout is both.

**Revenue is not double counted either:**

- Beds24 reservations are **not** ingested into the ledger (`docs/beds24-reservations.md` §14);
  direct-booking ingestion reads only `bolagio_booking_intents`. The statement is the only source of
  Booking.com revenue in the ledger.
- If the retired `booking_com_reservations` adapter ever posted revenue for a reservation (key
  `bcom:<number>`), the new line records `ledger_state = legacy_posted` and posts nothing.
- Amendments never post until accepted, and accepting reverses the original first.
- Operational KPIs (occupancy, ADR, RevPAR, ALOS, cancellation rate, gross reservation revenue) are
  computed on `/admin/performance` from `bolagio_reservations` and never read the finance ledger, so
  nothing here can inflate them.

---

## 9. The screens

**Finance → Imports → batch.** For a Booking.com statement: the six headline figures (gross,
commission, payment service fee, total fees, net, effective total fee %), matched / unmatched /
ambiguous / discrepancy counts, every line with its match and the local unit and delta, and the
payouts in the file — computed with the same rules the commit applies, against the reservations as
they are *now*. After commit: the recorded lines with their ledger links.

**Finance → Booking.com** (`/admin/finance/booking-com`). Filters: period (by payout date or by
check-out), unit, payout, reconciliation state. Headline KPIs for the selection, amendments awaiting
review (never in any total), payout groups (ID, date, lines, gross, commission, fee, net, line state,
bank state), and the reservation lines. `Effective total fee % = (commission + payment service fee)
÷ gross × 100`, computed on integer cents. Viewers read; `finance.edit` may re-match;
`finance.review` may accept amendments.

---

## 10. Security and personal data

- Admin-only: every action is a server action gated by `currentOperator` + capability
  (`finance.edit` to stage, commit and re-match; `finance.review` to accept an amendment); a
  read-only preview session is refused. `tests/finance/booking-com-security.test.ts` calls them with
  each kind of caller.
- The service role never leaves the server: every module that uses it imports `server-only`, and no
  client component imports it (asserted by the same test).
- Tables: RLS on, no policy, `anon`/`authenticated` revoked; functions executable by `service_role`
  only (`verify.sql` and the integration test assert it).
- **Guest names are never stored.** The adapter declares `Guest name` as a redacted column: its
  value is replaced by `[redacted]` in the staged raw row *before* the row is written; the parsed row,
  the settlement tables and the ledger have no guest field. File integrity is still provable by the
  batch's SHA-256 of the original bytes.
- Logs and audit entries carry counts, adapter, filename and outcome only — never a row, a name or a
  reservation number. Errors shown to an operator name columns and numbers, not people.
- The raw import rows of *other* adapters (bank counterparties, PayPal payers) can contain names;
  `lib/retention/policy.ts` now records that on `bolagio_finance_import_rows`. They follow the finance
  access control (`finance.view`) and the finance retention class; no deletion period is invented
  here.

---

## 11. Tax — what this is not

This importer records **operational facts**: *Booking.com states* this gross, this commission, this
fee, this net, this payout. It does **not** decide:

- whether a reservation's amount is all accommodation (7 %) or contains cleaning or other services
  (Aufteilungsgebot);
- how a cancellation or no-show charge is treated;
- the input-VAT / reverse-charge treatment of Booking.com's commission and payment-service fee.

Every posted line is therefore on `DE_REVIEW_REQUIRED` (counts toward no VAT figure) and
`needs_review`, until a person reclassifies it under adviser-confirmed rules through the existing
reclassify path (which records an override row). Until then, P&L revenue for these lines is the
statement gross, not a net-of-VAT figure. No claim of GoBD compliance is made by this feature; it
preserves source evidence (file hash, per-row source values, identifiers), timestamps, an
immutable-and-correct-by-reversal trail, operator audit entries, and the existing accountant exports.

---

## 12. Staging validation — step by step

Prerequisite: apply `supabase/migrations/20260926120000_booking_com_finance_statement.sql` to the
staging database (after 20260922 and 20260923), then open
`https://bolagio-staging.popovic-lazar0603.workers.dev/admin/login` as an operator/admin.

1. **Finance → Imports** loads; the *Adapters* table lists **Booking.com finance statement ·
   validated**, and the two old Booking.com adapters as **retired**.
2. *Stage a file*: Adapter "Detect from the file's columns", choose the real exported CSV exactly as
   downloaded → **Stage and validate** → "Booking.com finance statement: 5 valid, 0 error, 0
   duplicate rows (validated adapter)". Open **Preview →**.
3. The summary shows **€2,492.16** gross, **€358.96** commission, **€34.89** payment service fee,
   **€393.85** total fees, **€2,098.31** net, **15.80 %** effective fee, **3 payouts**; the table has
   5 lines; *Payouts in this file* has 3 rows.
4. Note matched / unmatched / ambiguous per line. Unmatched means Beds24 has not (yet) stored that
   number as the reservation's channel reference — check with the SQL in §14 below.
5. In the *Rows* table, the raw column shows `Guest name=[redacted]`.
6. **Import valid rows** → "5 rows posted…".
7. **Finance → Booking.com**, preset *Year to date* (or a period covering the payout dates): the same
   five figures and 3 payouts.
8. Upload the **same file** again → refused: "This exact file was already uploaded".
9. Optional overlap check: export a period overlapping the first one; stage and import it → the
   overlapping rows show `skipped` ("Already imported…"), only new rows post.
10. Confirm zero duplicated finance facts and untouched reservations (SQL below).
11. **Operations** screens and **Performance** show the same figures as before the import; the Beds24
    sync keeps running (System → `reservation_sync` heartbeat).

```sql
-- Settlement totals: expect 5 lines, 3 payouts, 249216 / 35896 / 3489 / 209831
select count(*) lines, count(distinct payout_id) payouts, sum(gross_cents), sum(commission_cents),
       sum(payment_service_fee_cents), sum(net_cents)
from bolagio_finance_ota_settlements where amendment_state = 'current';

-- Exactly one revenue, commission and fee posting per line; no payment created by the import
select kind, count(*), sum(gross_cents) from bolagio_finance_transactions
where source_system = 'booking_com_statement' group by kind;
select count(*) from bolagio_finance_payments where source = 'booking_com_payout';   -- unchanged

-- Why a line is unmatched: is the number stored on any reservation?
select s.booking_number, r.id, r.channel_reference, r.external_booking_id
from bolagio_finance_ota_settlements s
left join bolagio_reservations r on r.channel_reference = s.booking_number
where s.match_state <> 'matched';

-- No guest name stored anywhere by the import
select count(*) from bolagio_finance_import_rows
where raw->>'Guest name' is not null and raw->>'Guest name' not in ('', '[redacted]');
```

---

## 13. Rollback

`supabase/ops/rollback_20260926.sql`, in one transaction. It refuses while settlement lines or
payouts exist unless `bolagio.ota_rollback_confirmed = 'I have exported the settlements'` is set in
the session, and refuses while any batch was staged with the adapter (the narrowed check could not be
restored over it). Ledger transactions already posted by the import are **not** touched: reverse them
through the finance screens first if they must go. Run it before `rollback_20260923.sql`.

---

## 14. Known limits and open points

- **Only `Type = Reservation` rows are validated.** Other row types Booking.com may emit
  (adjustments, cancellation fees as separate rows) are staged as errors and kept, until a real file
  shows their shape.
- **Rows without a payout ID** are not imported (not yet settled); re-export after the payout.
- **Bank ↔ payout linking** is designed (`bank_payment_id`, `bank_state`, one-to-one) but has no
  screen or rule yet; the payout table shows *Awaiting bank* until it does.
- **VAT classification** of the posted lines is open by design (§11).
- Matching depends on Beds24 storing Booking.com's number as `apiReference`; this was the mapping
  before this change and is not re-verified live here (see `docs/beds24-reservations.md` §2).
- The local reservation gross is a snapshot at match time; a later Beds24 price change is picked up
  by *Re-match reservations*.
