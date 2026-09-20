# Booking core architecture

> The system-wide map, including the environment model, observability,
> schedulers and guest operations added on 2026-09-20, is
> `docs/architecture.md`. This file remains the detailed account of the
> booking core itself.

---

## 1. Authority boundaries

Each system is authoritative for exactly one thing, and nothing else is allowed
to have an opinion about it.

| System | Authoritative for |
|---|---|
| **Supabase / Postgres** | booking state, concurrency, idempotency, dedup, audit, outbox, recovery |
| **Beds24** | real availability across Booking.com and Airbnb, the external reservation |
| **PayPal** | whether money moved |
| **Next.js / Cloudflare** | the synchronous guest path |
| **Supabase Edge Functions** | webhook ingress that must survive the website being down |
| **n8n** | automation **outside** the transactional core |

```
                       ┌──────────────────────────────┐
  guest ──────────────►│  Next.js (Cloudflare)        │
                       │  availability · quote        │
                       │  intent · order · capture    │
                       └───────┬──────────────┬───────┘
                               │              │
                   ┌───────────▼──┐      ┌────▼─────────┐
                   │  PostgreSQL  │      │   Beds24     │──► Booking.com
                   │  the truth   │      │  inventory   │──► Airbnb
                   └───┬──────┬───┘      └──────────────┘
                       │      │
             outbox ───┘      └─── inbox ◄── Edge Function ◄── PayPal webhook
                │
                ▼
          n8n (messages, invoices, alerts)
```

The single most important property of that diagram: **n8n is downstream of the
database, not between anything.** If it is offline for six hours, nothing is
lost — events accumulate in the outbox and drain when it returns.

---

## 2. What is where

### Added by the hardening pass

```
lib/booking/
  states.ts              the canonical machines (mirrors PostgreSQL)
  errors.ts              the closed set of operational codes
  commands.ts            typed wrappers over the command RPCs
  hold.ts                the hold saga
  finalization.ts        paid → confirmed, with read-back verification
  release.ts             the release saga, verified
  lease.ts               whether an expired hold may be released
  payments.ts            order, capture, and the verified-event processor
  reconciliation.ts      the recovery engine
  quote-hash.ts          the quote fingerprint
lib/payments/
  provider.ts            the payment seam
  index.ts               adapter selection, no fallback
  paypal/{client,provider,mapper,types}.ts
lib/ops/
  external-operations.ts tracked external mutations
lib/n8n/
  signing.ts             HMAC verification
  internal-api.ts        the narrow surface n8n may use
app/api/booking/payment/{order,capture,config}/route.ts
app/api/booking/reconcile/route.ts
app/api/internal/{outbox,booking}/route.ts
app/api/webhooks/paypal/route.ts
components/booking/paypal-button.tsx
supabase/functions/paypal-webhook/index.ts
supabase/migrations/20260917{100000,110000}_booking_core_*.sql
tests/sql/{concurrency.sql,race.sh}
scripts/db-test.sh
```

### Removed

`lib/integrations/n8n/payment.ts`, `app/api/booking/payment-session/`,
`app/api/booking/callback/`. n8n was the payment authority; it is not any more.

---

## 3. The synchronous guest path

| Step | Endpoint | Source of truth | Gated |
|---|---|---|---|
| browse | `GET /api/booking/availability` | Supabase cache | no |
| price | `POST /api/booking/quote` | **live Beds24** | no |
| book | `POST /api/booking/intent` | live Beds24 + Postgres lock | **yes** |
| pay | `POST /api/booking/payment/order` | Postgres → PayPal | **yes** |
| capture | `POST /api/booking/payment/capture` | PayPal | **yes** |
| read | `GET /api/booking/status` | Postgres | no |

"Gated" means `DIRECT_BOOKING_ENABLED` is checked server-side, before anything
else. A hidden button is not a gate.

### The one rule about amounts

`POST /api/booking/payment/order` takes **a booking reference and nothing
else**. There is no parameter for an amount anywhere in the payment path,
because the server reads the total from the row it wrote from a live Beds24
offer. A body carrying `amountCents` is not rejected — it is never read.

---

## 4. The hold saga

Postgres cannot transact with Beds24. That is not a limitation to engineer
around; it is a fact to model.

```
1. LOCK LOCALLY           exclusion constraint covers `locking`, so of two
                          overlapping requests exactly one reaches Beds24
2. RE-ASK BEDS24 LIVE     where a Booking.com reservation that landed while
                          the guest typed their name surfaces
3. CREATE THE HOLD        tracked. A timeout is outcome_unknown, NOT failed
4. VERIFY                 read it back: right property, right room, right dates
5. CHECK INVENTORY CLOSED a hold that does not block is worse than no hold,
                          because it looks like protection
```

Step 1 is the change. The old order called Beds24 first and wrote afterwards,
so both of two concurrent bookings reached the provider and the loser's hold
was orphaned with no record that it existed.

### Compensation

| Outcome | Response |
|---|---|
| lock refused | conflict. **No provider call was made** |
| Beds24 answered "no" | release the lock. Nothing was created |
| **Beds24 did not answer** | keep the range, `manual_review`, severity-1 job. **No retry, no release** |
| booking came back wrong | keep the range, `manual_review`. **Never released** — it might be someone else's |
| nights did not close | `manual_review` |
| local write lost the race | severity-1 job; the hold is findable via `bolagio_external_operations` |

The third row is the one that matters. A retry after a timeout is how a guest
gets two reservations. The guest is told to **wait**, not to try again, and the
copy for `pending_verification` says so explicitly.

---

## 5. Payment

Three paths reach `paid`:

1. the browser-triggered capture (fast, latency-driven);
2. the PayPal webhook (authoritative, works when the guest closes the tab);
3. reconciliation reading the order (recovery).

All three converge on `bolagio_record_payment_capture`, which in one
transaction validates provider, order id, amount and currency against the
authoritative quote. That is why they cannot produce three different answers,
why arriving twice is harmless, and why arriving out of order is harmless.

A mismatch → `manual_review` + severity-1 job. **It never confirms and never
refunds.** Both are human decisions.

### Webhook ingress

Primary: `supabase/functions/paypal-webhook`. It must not depend on the website
deployment being healthy — a Cloudflare outage or a bad build must not stop
PayPal telling us a guest paid.

It does four things and nothing else: verify against PayPal, store deduplicated
on PayPal's event id, return 2xx. No Beds24 call, no email, no invoice, no n8n
— PayPal retries for three days on a non-2xx, so a slow handler turns one
payment into a redelivery storm.

A Next.js fallback exists at `/api/webhooks/paypal` for deployments without the
Edge Function. **Register exactly one** in the PayPal dashboard.

---

## 6. Finalization

```
paid → finalizing → update the EXISTING Beds24 booking → read back → verify → confirmed
```

No second booking is ever created. The reservation already exists; payment
promotes it.

Failure does **not** undo the payment. There is no branch in
`lib/booking/finalization.ts` that releases inventory, cancels or refunds:

```
paid + Beds24 update failed  →  paid_unfinalized / finalization_failed
                                the hold STAYS in place
                                severity-1 job, retried against the SAME id
                                outbox: booking.paid_unfinalized
```

The read-back is what makes `BEDS24_CONFIRMED_STATUS` safe to have as a
configurable value we have not proven live: a wrong value fails loudly with the
hold intact, rather than quietly leaving a paid guest with a reservation that
does not block the night.

---

## 7. Release and the lease

A checkout expiry is a **lease**, not proof of payment failure. Before
releasing, `evaluateLease` checks four things, any of which blocks it:

1. the booking is on the paid side;
2. the payment state is not a definitive no (`capture_pending`, `approved`,
   `unknown` all block);
3. an external operation has no known outcome;
4. **a verified webhook for this booking is sitting unprocessed in the inbox.**

(4) is the subtle one: the webhook arrived, verified and was stored, and the
processor has not run. Releasing on a timer there cancels a stay we have
already been told was paid for.

A release is only `released` when Beds24 cancelled **and** the nights reopened.
Otherwise `release_failed`, which **still reserves** — the old code logged the
failure and freed the range anyway.

---

## 8. Recovery

`bolagio_external_operations` makes "we do not know" a queryable state rather
than a caught exception. Every handler in `lib/booking/reconciliation.ts`
**reads the authoritative system before it writes**:

* an uncertain Beds24 create → search Beds24 for our reference, never re-POST;
* an uncertain PayPal call → read the order, never re-capture;
* paid-but-unfinalized → retry against the same booking id, forever;
* an unverified release → re-check whether the nights reopened.

Nothing refunds, cancels a paid booking, or releases with payment evidence.
Ambiguous financial inconsistencies are **escalated**.

---

## 9. Deliberate non-goals

* **No proprietary booking calendar as the source of truth.** Beds24 is the
  channel authority; Supabase caches for browsing and is explicitly marked as a
  cache.
* **No direct coupling to Booking.com or Airbnb.** Everything goes through the
  `BookingProvider` seam.
* **No platform migration.** Next.js 14.2 and OpenNext are unchanged.
* **No new admin authentication system.** Operations are exposed as SQL views
  (`bolagio_ops_attention`, `bolagio_ops_queues`) for a future authenticated
  surface.
* **No automatic refunds.** Anywhere. Under any failure.
