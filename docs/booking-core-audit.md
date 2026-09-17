# Booking core — audit of the pre-existing implementation

Audit date: 2026-09-17
Branch audited: `claude/opernstrasse-ii-iii-calendar-cta-dates` at `5d957b2`
Audited by: implementation pass "booking core hardening".

This document records what was already there, what was kept, what was replaced
and what remains unresolved. It is the justification for every change in the
hardening migration and the modules beside it.

---

## 1. What existed

### 1.1 Files

| Area | Files | Verdict |
|---|---|---|
| Domain types | `lib/booking/types.ts` | **Kept**, extended |
| State machine | `lib/booking/state-machine.ts` | **Replaced** by `lib/booking/states.ts` (compat shim kept) |
| Config | `lib/booking/config.ts` | **Kept**, extended |
| Repository | `lib/booking/repository.ts` | **Kept**, extended |
| Service | `lib/booking/service.ts` | **Kept**, hardened — hold saga and settlement extracted |
| HTTP plumbing | `lib/booking/http.ts` | **Kept** |
| Logger | `lib/booking/logger.ts` | **Kept**, event + field vocabulary extended |
| Reference / hashing | `lib/booking/reference.ts` | **Kept** |
| Stay rules / occupancy | `lib/booking/stay-rules.ts`, `occupancy.ts` | **Kept** |
| Beds24 adapter | `lib/integrations/beds24/*` | **Kept**, extended with read-back + search |
| Provider seam | `lib/integrations/provider.ts` | **Kept**, extended |
| n8n payment handoff | `lib/integrations/n8n/payment.ts` | **Removed from the payment path** — see 2.1 |
| Migration | `supabase/migrations/20260916120000_booking_foundation.sql` | **Kept**, built on by forward migrations |
| Routes | `app/api/booking/*`, `app/api/webhooks/beds24` | **Kept**, hardened; new routes added |
| Tests | `tests/*.test.ts` | **Kept**, expanded |

Nothing working was deleted to be rewritten. The single architectural removal
is the n8n payment handoff, and that removal is required by the architecture
decision that n8n is never the payment authority.

### 1.2 What the previous implementation got right

These are genuine strengths and were preserved rather than re-derived:

* **Money in integer minor units** everywhere, with `Intl` formatting only at
  the last render step.
* **Half-open date semantics** `[check_in, check_out)`, both in the
  `stay_range` generated column and in the `InventoryDay` three-flag model
  (`available` / `canCheckIn` / `canCheckOut`). Back-to-back stays already did
  not lose a night.
* **A gist exclusion constraint** on active holds. Overbooking from this
  website was already a database-level guarantee, not an application check.
* **No client-supplied amount is ever read.** Verified by reading every write
  path: `quoted_total_cents` is only ever written from a `fetchOffer` result.
  This property is preserved and is now covered by tests.
* **`server-only` on every secret-reading module**, making a browser import a
  build error rather than a review finding.
* **RLS enabled with no permissive policy** on all `bolagio_*` tables, so a
  leaked publishable key reads nothing.
* **Allow-listed structured logging** — a field added upstream cannot leak by
  being forgotten.
* **A closed `BookingErrorCode` vocabulary** and a single error-response
  function, so no provider text or Postgres error can reach a browser.
* **Beds24 `unavailable` is never flattened into "no nights free."**
* **The hold is taken before payment**, not after.

### 1.3 Live-proven facts inherited

Proven against the real Beds24 account before this pass (do not re-test):

* Beds24 V2 auth (`GET /authentication/token` with a `refreshToken` header).
* Property and room discovery via `GET /properties?includeAllRooms=true`.
* `GET /inventory/rooms/calendar` shape, including that `closedArrival` /
  `closedDeparture` are simply absent for this account.
* A booking created with Beds24 status `new` **does** block inventory for
  Schulstraße I, and cancelling it **does** restore inventory.
* `GET /properties/rooms` is not a V2 endpoint (HTTP 500). Nothing may call it.
* Beds24 Auto Actions are absent; outgoing Beds24 guest email is not
  configured. A hold therefore does not currently mail a guest.

Confirmed mappings:

| Unit | Beds24 property | Beds24 room | Booking.com property |
|---|---|---|---|
| `schulstrasse-i` | `354659` | `731147` | `14282341` |
| `schulstrasse-ii` | `354658` | `731146` | `14401037` |

---

## 2. Weaknesses found

Ordered by how much money each one can lose.

### 2.1 n8n was the payment authority — **critical, architectural**

`lib/integrations/n8n/payment.ts` posted the amount to an n8n webhook, n8n
created the Stripe/PayPal session, and `POST /api/booking/callback` accepted
`{ reference, outcome: "succeeded" }` behind a **static shared secret** as
proof that money had moved.

Consequences:

* Anyone holding `BOOKING_CALLBACK_SECRET` — an n8n instance, its credential
  store, an n8n workflow author, a log, a backup — could mark any reference
  paid and confirmed. No provider verification stood behind it.
* Payment truth depended on an n8n workflow execution completing. An n8n
  restart between "PayPal captured" and "call the callback" lost the fact
  permanently; nothing would ever rediscover it.
* No payment provider identity, order id, capture id, amount or currency was
  ever checked against what was quoted. `outcome: "succeeded"` was the entire
  evidence.

**Resolved by:** PayPal is now implemented server-side in this repository;
payment truth comes from a signature-verified PayPal webhook plus an
authoritative server-side capture, both reconciled against the stored amount
and currency. The n8n callback can no longer set `paid` or `confirmed` — see
`docs/n8n-booking-contract.md`.

### 2.2 Failed external writes were assumed failed — **critical**

`startBooking` treated **every** throw from `createHold` as a definitive
failure and moved the intent to `cancelled`:

```ts
} catch (cause) {
  await transition(quoted, 'cancelled', logger, {}, `hold_failed:${error.code}`)
```

`beds24Request` throws `ProviderError('unavailable', 'Beds24 request timed
out')` on an `AbortController` timeout — *after the POST has been sent*. Beds24
may well have created the booking. The old code then:

1. marked the intent cancelled (releasing the local range), and
2. left an orphan Beds24 hold blocking Booking.com and Airbnb forever, with
   no record anywhere that it might exist.

A retry by the guest would create a **second** Beds24 booking.

**Resolved by:** `bolagio_external_operations` with an `outcome_unknown` state,
a deterministic operation key, and a reconciliation job that searches Beds24
for the operation's own reference before any retry is permitted.

### 2.3 Release failures were swallowed — **critical**

```ts
} catch (cause) {
  logger.error('beds24.hold_release', cause, …);   // logged, not thrown
}
```

The local status was already `expired`/`payment_failed`, which removes the row
from the exclusion constraint's predicate. So after a failed release, BoLaGio
advertised the night as free while Beds24 still had it blocked — the exact
inversion of the safe direction. The comment claimed "the next inventory sync
reconciles"; the sync only refreshes the cache, it never retries the release.

**Resolved by:** `releasing` → `released` / `release_failed`, where
`release_failed` **still reserves** the local range, plus a reconciliation job
that retries the release and verifies inventory was restored.

### 2.4 Hold expiry was a blind timer — **critical**

`expireStaleHolds` moved every intent past `hold_expires_at` to `expired` and
cancelled its Beds24 booking, with no check of payment state. A guest who
completed a PayPal payment at minute 14:58 and whose webhook arrived at 15:02
would have had their paid room cancelled and resold.

**Resolved by:** a lease model. Release is refused while any payment evidence
exists — a recorded capture, an `approved` order, an uncertain payment
operation, or an unprocessed payment event for that intent.

### 2.5 The local lock was taken *after* the external hold — **high**

`createIntent` inserted with `status = 'draft'`, which is outside the exclusion
constraint's predicate. The constraint only bit on the transition to
`hold_created`, i.e. *after* the Beds24 POST had already succeeded. Two
simultaneous direct bookings for overlapping dates could therefore both call
Beds24; the loser's local write would then fail with `23P01`, and its Beds24
hold would be orphaned — with the failure surfacing from `updateIntent`, whose
`catch` did not release anything.

**Resolved by:** a `locking` state that **is** inside the exclusion predicate
and is entered *before* any external call, with a short lease and automatic
stale-lock reclamation inside the same transaction.

### 2.6 "Paid but not confirmed" had no operational existence — **high**

A Beds24 confirm failure left the intent at `paid` and logged an error. `paid`
is indistinguishable from "paid, waiting for the confirm call to be made", no
retry existed, no alert existed, and the guest's return page polled six times
and then showed "still settling" forever.

**Resolved by:** `paid_unfinalized` / `finalization_failed` as distinct states,
a high-severity reconciliation job that retries against the **same** Beds24
booking id, an outbox event, and an operations view.

### 2.7 State transitions were enforced only in application code — **high**

`TRANSITIONS` lived in TypeScript. The database's `bolagio_booking_status`
column accepted any enum value from any writer. Anything holding the service
role key — an n8n HTTP node, a psql session, a future admin app — could set
`status = 'confirmed'` directly. The compare-and-set on `expectedStatus` was
correct but was a convention of one code path, not a guarantee.

**Resolved by:** transitions moved into `bolagio_booking_transition()` and the
command RPCs, and a `BEFORE UPDATE` trigger that rejects any status change not
made through them.

### 2.8 There was no outbox — **high**

n8n was called inline, over HTTP, inside the request. If n8n was down the event
was simply lost; there was no record that it should have happened.

**Resolved by:** `bolagio_outbox_events`, written **in the same transaction**
as the state change that caused it, with `FOR UPDATE SKIP LOCKED` claiming,
attempts, retry scheduling and dead-lettering.

### 2.9 Webhook inbox was Beds24-only and payload-hash keyed — **medium**

`bolagio_integration_events` deduplicated on `sha256(raw body)`. Two genuinely
distinct PayPal events with identical bodies (possible for repeated capture
notifications) would collide; and a provider event id — the only identity a
provider guarantees — was not used at all. There was no payment inbox.

**Resolved by:** `bolagio_payment_events` keyed on
`unique (provider, provider_event_id)`. The Beds24 table is kept as-is for
Beds24.

### 2.10 The Beds24 webhook mutated state from the payload — **medium**

`action === 'cancelled'` called `releaseIfHeld` directly on the payload's word.
The webhook secret is a static shared string; a forged payload could release a
confirmed booking's hold.

**Resolved by:** the webhook now records the event and queues a reconciliation
job; state changes only follow a **fresh read** of the booking from Beds24.

### 2.11 `settlePayment` re-read nothing — **medium**

`outcome: 'succeeded'` was applied without checking amount, currency, provider,
order id, or whether that capture had been seen before.

**Resolved by:** `bolagio_record_payment_capture()` validates provider, order
id, amount and currency against the intent inside one transaction and routes a
mismatch to `manual_review` rather than confirming.

### 2.12 Smaller findings

* `quoted → quoted` was `'applied'`, so a re-quote could silently overwrite the
  authoritative total of an intent that was already `hold_created`… except it
  could not, because `hold_created`'s transition list excluded `quoted`. Correct
  by accident; now explicit.
* `findExpiredHolds` had no ordering and no claim, so two concurrent sweeps
  processed the same rows.
* `bolagio_integration_events.status` had a `check` constraint but
  `markIntegrationEvent` ignored its own errors.
* `payment_failed → payment_pending` was legal while the Beds24 hold had
  already been released by `releaseIfHeld`, allowing a payment retry against a
  reservation that no longer existed.
* The rate limiter is per-isolate and is documented as best-effort; unchanged,
  but the production readiness doc now lists the Cloudflare WAF rule as a gate.
* `app/api/booking/sync` performed both inventory sync and hold expiry under
  one secret; expiry is now a separate, separately-scheduled concern.

---

## 3. Decisions made

1. **Postgres owns every hard guarantee.** Concurrency, state transitions,
   idempotency, dedup, audit and the outbox are enforced by constraints,
   triggers and functions — not by TypeScript discipline.
2. **`hold_created` is kept as the name for `held`.** The semantics asked for
   are exactly what it already means, and renaming an in-use enum value buys
   nothing.
3. **PayPal is implemented in this repository, sandbox-only by default**, with
   a fail-closed mode selector. n8n never touches money.
4. **The Supabase Edge Function is the primary PayPal ingress**; a Next.js
   route exists as a documented fallback for environments where the Edge
   Function is not deployed. Both write the same inbox table through the same
   RPC, so there is one processing path.
5. **Reserving states are deliberately generous.** Anything that might still
   hold inventory at Beds24 — including `release_failed` and `manual_review` —
   keeps the local range reserved. Being wrong in the other direction sells a
   night twice.
6. **No automatic refund and no automatic cancellation after a successful
   payment.** Ever, under any failure. That is a human decision.
7. **The n8n callback endpoint is kept but demoted.** It can report automation
   outcomes; it cannot set `paid`, `confirmed` or any reserving state.

---

## 4. Files kept, replaced, added

**Kept unchanged:** `lib/booking/stay-rules.ts`, `occupancy.ts`,
`reference.ts`, `date-format.ts`, `analytics.ts`, `calendar.ts`,
`stay-context.tsx`, `lib/integrations/beds24/{auth,client,mapper,mock,discovery}.ts`,
all of `components/booking/*` except the payment step, the 2026-09-16
migration, and `supabase/seed/bolagio_booking_units.sql`.

**Replaced:** `lib/booking/state-machine.ts` (now a compatibility shim over
`lib/booking/states.ts`), the payment step of `components/booking/booking-modal.tsx`,
`app/api/booking/payment-session/route.ts` (superseded by
`app/api/booking/payment/order` + `.../capture`).

**Removed from the payment path:** `lib/integrations/n8n/payment.ts`. The file
is deleted; its contract lives on, inverted, in `docs/n8n-booking-contract.md`.

**Added:** see `docs/booking-architecture.md` §2.

---

## 5. Unresolved items

These are genuinely unresolved. None is worked around silently.

1. **The Beds24 status that means "confirmed" for this account is not proven.**
   The live test proved `new` blocks and `cancelled` releases. It did **not**
   test `confirmed`. `BEDS24_CONFIRMED_STATUS` is therefore configurable and
   defaults to `confirmed`; the finalizer reads the booking back and verifies
   the status it got, so a wrong value fails loudly into `finalization_failed`
   rather than silently.
2. **Beds24 does not document an idempotency key header for `POST /bookings`.**
   The existing code sends `idempotency-key` and the comment says "harmless
   where it does not [honour it]". That is still true and still unproven. The
   real protection is `bolagio_external_operations`, not the header.
3. **`GET /inventory/rooms/offers` has never been exercised live.** Every quote
   in production depends on it. It is the next controlled test.
4. **Beds24 has no documented booking-search-by-our-reference guarantee.** The
   reconciliation search filters `GET /bookings` by property, room and arrival
   date and then matches on the `reference` field we wrote. If Beds24 does not
   return `reference` on that endpoint for this account, reconciliation of an
   uncertain create degrades to `manual_review` — which is the safe direction,
   and is what the code does.
5. **Beds24 account-level Overbooking Protection is not verified.** It is a
   production prerequisite and is listed as a gate.
6. **PayPal webhook signature verification is implemented against the
   documented `/v1/notifications/verify-webhook-signature` endpoint and has not
   been exercised against a live PayPal sandbox webhook.**
7. **Real Postgres concurrency has not been executed in CI.** The tests exist;
   the command and setup are documented. See `docs/booking-reconciliation.md` §7.
8. **VAT / Kurtaxe treatment is unmodelled.** `taxCategory` records what the
   provider said; nothing computes a tax breakdown. Flagged as a legal gate.
