# Reconciliation

`lib/finance/reconciliation.ts` (`RECONCILIATION_RULES_VERSION`) proposes links between economic
facts (transactions) and cash facts (payments). Every proposal carries a rule, a confidence, a
human-readable reason and whether the runner may apply it without a person.

| Rule | Match | Confidence | Result | Auto |
|---|---|---|---|---|
| R1 booking-key exact | same booking (intent id or reference), same currency, expected direction, amount equal (± tolerance, default 0) — or several payments summing to the gross | exact | matched | yes |
| R2 booking-key partial | same booking, payment smaller | high | partially_matched | yes |
| R3 booking-key mismatch | same booking, payment larger | high | **mismatch** — a person decides | yes (the state, not a resolution) |
| R4 reference text | payment text names the booking reference or the supplier invoice number, amount equal, within 45 days | high | matched | yes |
| R5 amount + date | same amount within 10 days of the due/booked date, unique on both sides | medium | needs_review | **no** |
| R6 payout bundle | a Booking.com payout equals the sum of ≥ 2 open Booking.com stays in a 45-day window (subset sum, bounded at 22 candidates) | medium | needs_review | **no** |

Direction: refunds and credit notes always expect money *out*; other kinds flip with a negative gross
(a supplier credit note posted as a negative expense expects money *in*). Currencies never mix.

The runner (`runReconciliation`) records auto-apply proposals as reconciliations (the SQL function
updates both sides' states) and records medium-confidence proposals as `needs_review` for the
Inbox, where an operator confirms or rejects with a reason (`finance.review`).

## States

Transactions and payments: `unmatched → needs_review / partially_matched / matched / mismatch`;
`not_applicable` for facts that have no cash counterpart (COGS, included minibar). A mismatch is
never resolved by editing the payment: it is a correction posting (commission, fee, refund) plus a
new match.

## Screens

`/admin/finance/reconciliation` — unmatched payments, unreconciled revenue, proposals with their
reasons, mismatches with the delta; `/admin/finance/inbox` — the same as prioritised items;
transaction and booking pages show the linked payments and the rule that linked them.

## Tests

`tests/finance/engines.test.ts` (R1 exact and split, R2/R3, direction and currency, R4 window, R5
uniqueness, R6 bundle, ignored rows, `openReason`), `tests/integration/finance.test.ts` (a real paid
stay reconciles by R1; a refund reconciles its outgoing payment).
