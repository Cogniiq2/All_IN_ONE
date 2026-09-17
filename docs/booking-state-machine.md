# The booking state machine

Two machines, deliberately: what the **reservation** is doing and what the
**money** is doing. They diverge, and the case that forces the separation is:

```
payment = paid     AND     booking = paid_unfinalized
```

The guest's money is ours and Beds24 has not been told. One status column
cannot express that, and a system that cannot express a situation resolves it
by guessing.

**The authority is PostgreSQL** — `bolagio_transition_allowed()` in
`supabase/migrations/20260917110000_booking_core_hardening.sql`, enforced by a
`BEFORE UPDATE` trigger. `lib/booking/states.ts` mirrors it so the application
can reject an illegal move without a round trip, and
`tests/state-machine.test.ts` keeps the two in step. If they disagree, the
database wins.

---

## 1. Booking states

### The happy path

```
draft ─► quoted ─► locking ─► hold_created ─► payment_session_created
                                                      │
                                              awaiting_payment
                                                      │
                                               payment_pending
                                                      │
                                                    paid
                                                      │
                                                 finalizing
                                                      │
                                                  confirmed
```

| State | Means | Reserves? |
|---|---|---|
| `draft` | the row exists; nothing validated | no |
| `quoted` | a live Beds24 offer is attached and priced | no |
| `locking` | the local range is reserved; **no external call made yet** | **yes** |
| `hold_created` | Beds24 holds the nights. The "held" state | yes |
| `payment_session_created` | a provider order exists | yes |
| `awaiting_payment` | the guest is at the provider | yes |
| `payment_pending` | the provider says PENDING — **not settled** | yes |
| `paid` | a verified capture. Money has moved | yes |
| `finalizing` | updating the existing Beds24 booking | yes |
| `confirmed` | Beds24 read back and verified. Done | yes |

### Failure and recovery

| State | Means | Reserves? |
|---|---|---|
| `quote_expired` | the quote aged out before the guest acted | no |
| `unavailable` | Beds24 says the nights are gone | no |
| `hold_failed` | Beds24 **answered**, and the answer was no | no |
| `payment_failed` | the provider denied the capture | **yes** |
| `payment_cancelled` | the guest abandoned at the provider | **yes** |
| `expired` | the lease ran out, unpaid | **yes** |
| `releasing` | cancelling the Beds24 hold | yes |
| `released` | the release was **verified** | no |
| `release_failed` | we asked, and do not know if it worked | **yes** |
| `paid_unfinalized` | paid; Beds24 not updated yet | yes |
| `finalization_failed` | paid; updating Beds24 failed | yes |
| `manual_review` | a human must decide | yes |
| `cancelled` | terminal, reachable only once nothing is held | no |

---

## 2. Reserving inventory — the most consequential definition

A state reserves the local date range from the moment we begin acquiring an
external hold until we have **positively established** that no external hold
exists.

That deliberately includes states that look like failures:

* `expired` — the lease ran out. The Beds24 hold is still there.
* `payment_failed` — the card was declined. The hold is still there.
* `release_failed` — we asked Beds24 to cancel and do not know if it did.
* `manual_review` — we do not know what is true. Assume the worst.

Releasing the local range before the external hold is provably gone is how a
database advertises a night Booking.com has already sold. **Being wrong in this
direction costs one unsold night. Being wrong the other way costs a guest their
holiday.**

Enforced by `bolagio_status_reserves()`, which is the `WHERE` predicate of the
gist exclusion constraint:

```sql
exclude using gist (unit_id with =, stay_range with &&)
where (bolagio_status_reserves(status))
```

`stay_range` is `[check_in, check_out)` — half-open, so a checkout and the next
guest's check-in on the same day do not conflict.

---

## 3. Transitions worth explaining

### `expired → paid` and `payment_failed → paid` are LEGAL

A verified capture that arrives after we gave up must win. The alternative is
keeping a guest's money and telling them their booking expired.

### `confirmed → cancelled` is NOT legal

A confirmed reservation leaves through `releasing → released → cancelled`, or
through `manual_review`. This is what makes it impossible for a cancellation to
free the local range before Beds24 has been dealt with.

### Nothing reaches payment without a hold

There is no edge from `quoted` or `locking` to any payment state. Money is
never taken for nights that are not already blocked at the channel manager.

### `quoted → quoted` is the one legitimate same-state write

Re-quoting genuinely rewrites the authoritative total. Every other same-state
transition is a no-op, which is what makes a duplicate webhook harmless.

### A paid booking never transitions to a non-reserving state

Asserted as a property in `tests/state-machine.test.ts`, over the whole table
rather than case by case — so an edge added later that violates it fails.

---

## 4. Payment states

```
not_created ─► order_created ─► approved ─► capture_pending ─► paid
                                                                │
                                        refunded / partially_refunded / disputed
```

| State | Means |
|---|---|
| `not_created` | no provider order exists |
| `order_created` | an order exists, the guest has not approved |
| `approved` | approved at the provider, **not captured** |
| `capture_pending` | capture requested, provider says PENDING |
| `paid` | capture COMPLETED. **The only state that means money** |
| `denied` | the provider refused the capture |
| `cancelled` | the guest abandoned at the provider |
| `refunded` / `partially_refunded` / `disputed` | after the fact |
| `unknown` | we could not determine what the provider did |

### `unknown` is a first-class state

Never treated as paid and never treated as unpaid. It is an input to
reconciliation and a **hard block on releasing inventory**. Any state may fall
into it: discovering a second capture genuinely destroys what we thought we
knew, and refusing that edge would force the code to keep asserting `paid`
while holding evidence that contradicts it.

### `not_created → paid` is legal

A verified webhook can teach us about an order whose creation response we never
received. Refusing to learn it would mean holding a guest's money in a booking
our own column calls unpaid.

### PENDING is not paid

PayPal uses PENDING for funds under review and for eCheck settlement. Both can
still fail. `stateFromCaptureStatus('PENDING')` is `capture_pending`, and there
is no path from there to `confirmed` that does not go through a later
COMPLETED.

---

## 5. How a transition happens

Every one, without exception:

```sql
bolagio_booking_transition(
  p_intent_id, p_expected, p_to, p_reason, p_patch,
  p_correlation_id, p_outbox_type, p_outbox_payload)
```

In one transaction, under a row lock, it:

1. refuses a **stale `p_expected`** — two racing callbacks cannot both move one
   booking;
2. returns the row unchanged for an idempotent repeat;
3. validates against `bolagio_transition_allowed()`;
4. writes the row;
5. appends the audit row to `bolagio_booking_intent_events`;
6. writes the outbox row to `bolagio_outbox_events`.

Steps 4, 5 and 6 commit together or not at all. That is why a confirmed booking
and the event announcing it cannot come apart, and why the audit log can never
disagree with the row it describes.

A direct `UPDATE ... SET status = ...` raises:

```
bolagio: direct status change hold_created -> confirmed is not permitted;
use bolagio_booking_transition()
```

— including with the service role key. Before this, anything holding that key
could write `confirmed`.

The typed wrapper is `transitionIntent` in `lib/booking/commands.ts`. It
returns `null` for "refused", which is **not an error**: refusing a duplicate
webhook delivery is the system working.

---

## 6. Where each transition is made

| Transition | Made by |
|---|---|
| `draft → quoted` | `startBooking` |
| `quoted → locking` | `bolagio_acquire_lock` via `acquireHold` |
| `locking → hold_created` | `acquireHold`, after verification |
| `locking → manual_review` | `acquireHold`, on an uncertain create |
| `* → payment_session_created` | `createPaymentOrder` |
| `* → paid` | `bolagio_record_payment_capture` **only** |
| `paid → finalizing → confirmed` | `finalizeBooking` |
| `finalizing → paid_unfinalized` | `finalizeBooking` on failure |
| `* → releasing → released` | `releaseHold` |
| `releasing → release_failed` | `releaseHold`, unverified |
| `* → expired` | `expireStaleHolds` / reconciliation, **after** the lease check |
| anything → `manual_review` | any handler that cannot establish the truth |

Note the third row from the bottom. Nothing reaches `paid` except
`bolagio_record_payment_capture`, which validates provider, order, amount and
currency against the authoritative quote inside one transaction.
