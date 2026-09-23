# Revenue

## Sources

| Source | How it enters | Idempotency key |
|---|---|---|
| Direct stays (website, PayPal) | `ingestBookingFacts` reads `bolagio_booking_intents` after every operations pass | `booking:<intent id>` |
| Booking.com stays | Booking.com **finance statement** import: statement gross, commission and payment-service fee per settlement line, VAT parked on `DE_REVIEW_REQUIRED` (`booking-com-statement.md`) | `booking_com_statement` / `<identity>#<content hash>` (+ `:commission`, `:payment_service_fee`) |
| Booking.com stays (historical) | the retired reservation-statement adapter | `bcom:<book number>` — a later statement line for the same reservation posts nothing (`legacy_posted`) |
| Minibar | `bolagio_minibar_record_movement` (sale) | `<booking>:<sku>` or the caller's key |
| Manual / corporate | expense/revenue forms | `manual:<hash>` |

## Recognition rule (configurable policy, documented)

Accommodation revenue is recognised on the **check-out date** (`booked_on = service_to`), with the
stay as the service period. Rationale: the supply is complete at departure; the month in which the
guest leaves carries the revenue; the cash fact (capture at booking time, payout weeks later) keeps
its own date. The P&L screen says explicitly that profit is not cash.

The stages that count as a revenue fact are `confirmed`, `paid`, `paid_unfinalized`, `finalizing`,
`finalization_failed` (`REVENUE_RECOGNISING_STATUSES`); a pending or cancelled intent posts nothing.

## Components → lines

Each quote component becomes a line. Tax category mapping (`taxCodeForComponent`):

| Quote category | Tax code | Classification |
|---|---|---|
| `accommodation` | `DE_ACCOMMODATION_REDUCED` (7 %, § 12 Abs. 2 Nr. 11 UStG) | auto_verified |
| `service` (cleaning fee, etc.) | `DE_ANCILLARY_REVIEW` | needs_review — the Aufteilungsgebot (§ 12 Abs. 2 Nr. 11 S. 2) taxes services that do not directly serve the letting at 19 %; whether a mandatory final cleaning fee is part of the accommodation supply or a separate service is an adviser decision, so the system does not decide it |
| `city_tax` | `DE_REVIEW_REQUIRED` | needs_review (Bavaria prohibits municipal accommodation taxes; a value here is unexpected) |
| `deposit` | `DE_OUTSIDE_SCOPE` | not revenue |

Gross is split into net and VAT with half-up rounding; the header equals the sum of lines.

## Channels

`direct`, `booking_com`, `airbnb`, `manual`, `other`. Booking.com commission is a separate
`commission` transaction (kind `commission`, category `ota_commission`) and the payment-service fee a
separate `fee` transaction (category `payment_fees`), so gross revenue, commission, fee and net
proceeds are all visible. The payout is **not** posted as a cash fact from the statement: its cash is
the bank's, reconciled once per payout group (`booking-com-statement.md` §8). Beds24 reservations are
never ingested into the ledger, and Beds24's `commission = 0` is never read as a commission.

## Refunds

A completed refund (`refund_state = completed`, provider refund id present) posts a `refund`
transaction with **negative** lines allocated pro-rata over the original lines (largest remainder),
dated on the refund completion date, plus an outgoing payment keyed by the refund id. An amount
above the original stay is capped and flagged `needs_review`. The original revenue row stays as
posted: corrections are rows, never edits.

**The outgoing cash is recorded first, and on its own.** Money leaving the account is a fact about
the bank, not about the P&L, so `refundCashFact` is written before — and independently of — the
pro-rata reversal. A stay cancelled and refunded *before* the first ingestion pass never reached a
revenue-recognising status, so there are no original lines to allocate over; the reversal is skipped,
the euros are not. That case is counted as `refundsWithoutRevenue` on the ingestion report and in
the operations summary, and shows up as an unmatched outgoing payment — the honest state: money
left, and no stay was ever recognised. (Nesting the cash fact under the reversal lost it silently,
on every pass: see `docs/final-integration-review.md` §1.)

Revenue, the capture and the refund each have their **own failure boundary**. A revenue posting the
database refuses — a locked period, an inactive tax code — must not take the guest's captured money
with it.

## Screens

`/admin/finance/revenue` — by channel, by unit, nights, ADR, occupancy, refunds, with drill-downs to
transactions and to `/admin/finance/properties`. Nights and occupancy come from the booking core's
paid-side stays, never from the ledger.
