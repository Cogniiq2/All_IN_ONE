# Direct booking — production readiness

> **Superseded by `docs/production-readiness.md` (2026-09-20)**, which carries
> the go/no-go matrix and the ordered manual steps. The Beds24, PayPal and
> legal checklists below are still valid and are referenced from there.

**Direct booking is OFF.** `DIRECT_BOOKING_ENABLED` is unset (fail-closed) and
`bolagio_units.is_bookable` is `false`. Both must be on; neither was changed by
this work.

Nothing below is ticked. Each line is a real way a guest could be charged for a
room they do not get, or a room could be sold twice.

---

## 1. The gates

| Gate | Where | Scope |
|---|---|---|
| `DIRECT_BOOKING_ENABLED=true` | environment | the whole deployment |
| no `validateEnvironment()` refusal | environment | the whole deployment |
| **no legal gap** — `bookingLegalGaps()` empty | `lib/legal/*` (code, reviewed) | the whole deployment |
| `bolagio_units.is_bookable = true` | database | per unit |

The legal lock (2026-09-25) refuses while the cancellation policy, the
no-withdrawal notice, the booking AGB, the privacy notice, the price-
completeness confirmation or the company identity is unapproved. Its refusal
codes (`LEGAL_*`) appear on the System page beside the environment refusals.
`BOOKING_TEST_TERMS=true` satisfies it with loudly labelled sandbox texts on
`local`/`staging` only — refused on production. See `LEGAL_REVIEW_REQUIRED.md`
and `docs/legal/checkout-wording-for-approval.md`.

The first is checked **server-side, before anything else**, on every endpoint
that can reserve inventory or create a payment order. A hidden frontend button
is not a gate; this is what a curl request runs into.

Turn on the environment gate **after** everything below, and then enable **one
unit** first.

---

## 2. Beds24

- [ ] Mappings verified against the live account.
      Proven: `schulstrasse-i` → property `354659`, room `731147`;
      `schulstrasse-ii` → property `354658`, room `731146`.
- [ ] **Overbooking Protection is on** at the account level.
      The most important line here. True cross-provider atomicity is
      impossible: the window between our last live availability check and the
      Beds24 POST cannot be closed by any protocol. Making it small is our
      mitigation; Beds24's own protection is the backstop, and without it a
      Booking.com reservation landing in that window oversells the room.
- [ ] Booking.com **Auto-Replenishment** reviewed. If it reopens inventory a
      hold closed, our holds do not hold.
- [ ] **`BEDS24_CONFIRMED_STATUS` proven.** `new` blocks and `cancelled`
      releases — both proven live. What `confirmed` does for these properties
      is **not** proven. Create one test booking, promote it, confirm it still
      blocks inventory.
- [ ] Beds24 **Auto Actions** re-checked. They were absent at the time of the
      live test. An Auto Action that emails a guest on a `new` booking would
      email every abandoned checkout.
- [ ] Beds24 outgoing email still not configured, or deliberately configured.
- [ ] `BEDS24_WEBHOOK_SECRET` set and the webhook registered.
- [ ] `GET /inventory/rooms/offers` exercised live. **Never called against the
      real account.** Every quote in production depends on it.
- [ ] `GET /bookings` exercised live, and confirmed to return the `reference`
      field. If it does not, reconciliation of an uncertain create degrades to
      manual review — safe, but it should be a known degradation.

## 3. PayPal

- [ ] Every item in `docs/payment-paypal.md` §8 confirmed in **sandbox**.
- [ ] A separate **live** app created. Sandbox credentials never reused.
- [ ] A separate **live** webhook registered; its own `PAYPAL_WEBHOOK_ID`.
- [ ] `PAYPAL_MODE=live` in **both** secret stores at the same time.
      A mismatch — the website live, the Edge Function sandbox — means real
      payments whose webhooks never verify.
- [ ] Signature verification proven: a genuine delivery verifies, a tampered
      one does not.
- [ ] Sandbox end-to-end passed: quote → hold → order → capture → webhook →
      Beds24 finalized → `confirmed`.
- [ ] One **real, low-value** transaction passed end to end.
- [ ] A refund executed against that transaction and observed arriving as
      `PAYMENT.CAPTURE.REFUNDED`.
- [ ] Exactly **one** webhook ingress registered (Edge Function or Next.js
      route, not both).

## 4. Infrastructure

- [ ] Both migrations applied to the production database.
- [ ] `./scripts/db-test.sh` green against a PostgreSQL of the production
      major version.
- [ ] Reconciliation scheduled (see `docs/booking-reconciliation.md` §1) and
      **observed running**.
- [ ] Inventory sync scheduled.
- [ ] The Edge Function deployed with `--no-verify-jwt`.
- [ ] Cloudflare WAF rate limiting in front of `/api/booking/*`. The in-isolate
      limiter is per-isolate and is explicitly not the security boundary.
- [ ] Alerting on `bolagio_ops_attention` severity 1 and on `exhausted` rows in
      `bolagio_ops_queues`. **Without this, a paid-but-unfinalized booking is
      invisible until a guest complains.**

## 5. Legal and commercial — Germany

Not code. Every one blocks launch.

- [ ] **Booking terms (AGB)** cover a concluded direct booking, not only an
      enquiry. The current text was written for an enquiry flow.
- [ ] **Cancellation policy** approved and entered in
      `CANCELLATION_POLICIES` (`lib/legal/booking-terms.ts`). Technically
      fixed 2026-09-25: the provider's text is no longer shown, the checkout
      always renders BoLaGio's approved policy or the stated gap, and the gate
      stays shut without one. The *wording* is still owed.
- [ ] **Final total price** verified as the actual total. Anything payable on
      site (Kurtaxe, deposit) must be visible before payment.
- [ ] **VAT / Kurtaxe treatment reviewed.** `taxCategory` records what the
      provider said; **nothing computes a tax breakdown**. An invoice that
      states a VAT rate nobody calculated is a tax problem.
- [ ] **Privacy notice** covers PayPal as a processor, the data sent to it, and
      Supabase as the store.
- [ ] Guest registration (**Meldeschein**) obligation handled. Deliberately
      outside this flow — ID details do not belong in a checkout — but it is a
      legal requirement that needs its own answer.
- [ ] Invoicing workflow ready. `booking.confirmed` is the trigger.
- [ ] **Widerrufsrecht**: accommodation for a specified date is normally exempt
      from the distance-selling right of withdrawal (§ 312g Abs. 2 Nr. 9 BGB),
      but the wording of the exemption notice needs legal confirmation.
      **Flagged, not assumed.**

> These are flagged, not answered. This document is not legal advice and the
> implementation does not assume legal certainty on any line above.

## 6. Turning it on

1. Tick everything above.
2. `DIRECT_BOOKING_ENABLED=true`.
3. `update bolagio_units set is_bookable = true where slug = 'schulstrasse-i';`
   — **one unit**.
4. One real booking on a near date, at the real price, on the real account.
5. Watch `bolagio_ops_attention` for a full day.
6. Then the second unit.

## 7. Turning it off

```
DIRECT_BOOKING_ENABLED=false
```

Redeploy. New bookings and new payment orders stop immediately; the reconcile
and sync endpoints keep working, which is what you want — bookings already in
flight still need to reach a resting state.

For one unit: `update bolagio_units set is_bookable = false where slug = '…';`
— no deploy needed.

**Do not** disable the reconciliation schedule when disabling booking. Held and
paid bookings still need finalizing and releasing.
