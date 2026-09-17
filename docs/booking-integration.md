# Booking integration — Beds24 + Supabase

> **Partly superseded, 2026-09-17.**
>
> This document was written when n8n executed payments and a shared-secret
> callback was what confirmed a booking. **That is no longer the
> architecture** — PayPal is implemented server-side in this repository and
> n8n cannot mark a booking paid or confirmed. See
> `docs/booking-core-audit.md` §2.1 for why it changed.
>
> What is still accurate and still worth reading here: the Supabase and Beds24
> setup steps, mock mode, and overbooking protection. The payment sections have
> been corrected in place.
>
> | For | Read |
> |---|---|
> | the current architecture | `docs/booking-architecture.md` |
> | the state machines | `docs/booking-state-machine.md` |
> | payments | `docs/payment-paypal.md` |
> | the n8n contract | `docs/n8n-booking-contract.md` |
> | recovery | `docs/booking-reconciliation.md` |
> | an incident | `docs/booking-runbook.md` |

The operational setup for the booking foundation. Read `lib/booking/service.ts`
for the rules themselves; this file is what a person has to *do*.

---

## The architecture, in one picture

```
Booking.com ─┐                                  ┌─ browse: cached, instant
Airbnb ──────┼─► Beds24 ─► /api/webhooks/beds24 │
Beds24 UI ───┘      ▲            │              │
                    │            ▼              │
      live quote ───┤      Supabase cache ──────┤
      live hold  ───┤   (bolagio_unit_inventory_days)
      finalize   ───┘            ▲              │
                                 │              ▼
                    POST /api/booking/sync   BoLaGio website
                    (cron, every 15–60 min)

guest ─► /api/booking/quote          ─► Beds24 live ─► authoritative price
      ─► /api/booking/intent         ─► local lock, then Beds24 HOLD
      ─► /api/booking/payment/order  ─► PayPal, amount read from the ROW
      ─► /api/booking/payment/capture─► PayPal decides

PayPal ─► Supabase Edge Function ─► payment inbox ─► reconciliation
                                                      │
                                              finalize at Beds24
                                                      │
                                              outbox ─► n8n (messages only)
```

**Beds24 is authoritative for availability. PayPal is authoritative for money.
Postgres is authoritative for state.** Supabase is also a fast read model for
browsing. n8n sends messages and cannot decide anything.

## Responsibilities

| System | Owns |
|---|---|
| **Beds24** | live availability, rates, channel inventory, reservations, Booking.com + Airbnb sync |
| **Supabase** | unit registry, provider mapping, availability cache, booking intents, guest data, payment state, raw provider events |
| **PayPal** | whether money moved. Implemented server-side here, never in n8n |
| **n8n** | guest messages, invoices, alerts. It consumes durable events and cannot change a booking |
| **Website** | all guest-facing UX, and every validation re-run server-side |

---

## Environment variables

See `.env.example`. Not one of them is `NEXT_PUBLIC_`, and none may be given
that prefix — every value is read through `lib/booking/config.ts`, which is
`server-only`, so importing it from a client component is a build error.

Set them as Cloudflare Worker secrets for preview and production:

```bash
npx wrangler secret put BEDS24_REFRESH_TOKEN
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put BOOKING_SYNC_SECRET
npx wrangler secret put BEDS24_WEBHOOK_SECRET
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
npx wrangler secret put N8N_INTERNAL_SECRET
```

The PayPal values must **also** be set as Supabase function secrets, which are
a separate store — the Edge Function does not read Cloudflare's. See
`docs/payment-paypal.md` §2.

Generate each shared secret with real entropy, e.g. `openssl rand -hex 32`.

---

## Manual steps — Supabase

1. **Apply the migrations, in order.** Via `supabase db push` or the SQL editor:

   | File | What it does |
   |---|---|
   | `20260916120000_booking_foundation.sql` | `btree_gist`, six `bolagio_*` tables, the enums, the triggers |
   | `20260917100000_booking_core_states.sql` | **enum values only** |
   | `20260917110000_booking_core_hardening.sql` | the transactional core |

   The middle one is separate for a hard PostgreSQL reason: a value added to an
   enum cannot be *used* until the transaction that added it has committed.
   Merging it into the third works only on a database that already has the
   values, which is the worst available failure mode. Apply them as three
   statements, not one.

   None of them touches the three earlier migrations, which belong to the
   archived admin application.
2. **Seed the registry and the mapping.** Run
   `supabase/seed/bolagio_booking_units.sql`. It inserts the five units with
   `is_bookable = false`, and the two confirmed Beds24 mappings:

   | Unit | Beds24 property | Beds24 room |
   |---|---|---|
   | `schulstrasse-i` | `354659` | `731147` |
   | `schulstrasse-ii` | `354658` | `731146` |

   The three Opernstraße flats deliberately get no mapping row — no ids have
   been confirmed for them, and a unit with no mapping is reported as
   `unsourced` and keeps the enquiry flow, whereas one pointed at the wrong
   room sells the wrong apartment and looks healthy doing it.
3. **Confirm occupancy.** `max_guests` is `NULL` for every unit because the
   owners have not verified it, so the application falls back to four. Set the
   real figure per unit when it is known — no deploy is needed.
4. **Check RLS.** Every table is RLS-enabled with *no* permissive policy, and
   `anon`/`authenticated` are revoked. Verify with the Supabase advisor that no
   policy has been added: the browser must never read these tables.
5. **Open a residence.** `update bolagio_units set is_bookable = true where
   slug = '…';`

   Still commented out in the seed, deliberately. The mapping is confirmed,
   but nothing that WRITES to Beds24 has been exercised — so a guest reaching
   the booking flow would be the first write ever attempted against this
   account. Run the controlled hold/release test first:
   `docs/beds24-write-test-plan.md`.

---

## Manual steps — Beds24

1. **API V2 access.** Settings → Account → API. Generate an invite code,
   exchange it for a **refresh token**, and put that in `BEDS24_REFRESH_TOKEN`.
   The V1 `apiKey`/`propKey` scheme is deprecated and is not implemented here.
   *Verified 2026-09-17: the token exchange works and returns a token valid
   for 86400s.*
2. **Get the ids from the API, not from a spreadsheet.** Run the discovery
   call — `GET /properties?includeAllRooms=true`, wrapped by
   `listPropertiesWithRooms()` in `lib/integrations/beds24/discovery.ts` — and
   read the property and room ids out of the response, with their names.

   Do not type ids in from memory. A slug pointed at the wrong room sells the
   wrong apartment and nothing downstream can detect it: the calendar looks
   perfectly healthy either way. The first attempt at this mapping was wrong —
   property `354659` turned out to be named *"designAparts - II - by
   MorenoPisano"*, not the unit it had been assumed to be.

   **There is no `GET /properties/rooms`.** It returns HTTP 500. Rooms exist
   only nested inside the properties response.
3. **⚠ Confirm which statuses block inventory.** This is the setting that
   matters most.

   Beds24 has five booking statuses, and *which of them block inventory is a
   per-property setting, not a universal rule*. In particular **`request` does
   not block inventory** unless the property is explicitly configured to let it.

   This integration creates holds as **`new`**, which blocks inventory in every
   documented configuration, and promotes them to `confirmed` after payment.
   Unpaid holds are `cancelled`, which releases the night.

   If you would rather holds were `request` — so unpaid attempts never appear as
   real bookings in reports — **turn on "Requests block inventory" for the
   property first**, then change `HOLD_STATUS` in
   `lib/integrations/beds24/live.ts`. Changing the constant without changing the
   setting silently reintroduces overbooking.
4. **Booking webhook.** Point it at `https://<domain>/api/webhooks/beds24` and
   configure the header `x-bolagio-signature` with the value of
   `BEDS24_WEBHOOK_SECRET`. Without a configured secret the endpoint refuses
   everything, by design.
5. **Channel connections.** Booking.com and Airbnb are connected *inside
   Beds24*. The website never talks to either directly.

---

## Manual steps — scheduling

`POST /api/booking/sync` with header `x-bolagio-signature: <BOOKING_SYNC_SECRET>`,
every 15–60 minutes, from a Cloudflare Cron Trigger or an n8n schedule.

It does two things: refreshes the inventory horizon in bulk (one call per unit,
never one per date), and releases holds that ran out without being paid for. The
second is what stops an abandoned checkout costing a sellable night — without it,
an abandoned hold sits at Beds24 closing those nights on Booking.com and Airbnb
too.

The Beds24 webhook already invalidates and resyncs a unit within seconds of a
reservation. The schedule is the floor under it, for the deliveries that never
arrive.

---

## Payments and n8n

**Removed from this document.** The contract it described —
`POST /api/booking/payment-session` to n8n, and n8n calling back with
`{ outcome: "succeeded" }` behind a static secret — no longer exists. Anything
holding that secret could mark any reference paid and confirmed, with no
provider verification behind it.

* Payments: `docs/payment-paypal.md`
* What n8n may now do, and the HMAC it signs with:
  `docs/n8n-booking-contract.md`

## Overbooking protection

Four independent layers, in the order they fire:

1. **Cached calendar** — a fast local pre-check. Not authoritative.
2. **Live Beds24 offer** at quote and again at booking. If Booking.com took the
   dates while the guest was typing, this is where it surfaces — as a
   structured `availability_conflict`, which the UI renders as *"This residence
   has just been reserved for the selected dates"* while keeping everything the
   guest typed.
3. **Beds24 hold, before payment.** Taking money first and reserving afterwards
   is the race that sells one night twice.
4. **A Postgres exclusion constraint** on `(unit_id, stay_range)` for active
   statuses. Two overlapping holds on one unit are impossible at the database
   level, whatever the application or the provider did.

Idempotency sits alongside it: the key is derived from the unit, dates, party
and guest email and enforced by a unique index, so a double-click, a retry and
a refresh all land on the same intent and the same Beds24 hold.

---

## Mock mode

`BEDS24_MODE=mock` (the default) serves deterministic fixtures. Relative to the
property's current month:

| Month | Fixture |
|---|---|
| +0 | partially occupied (8th–12th) |
| +1 | completely free |
| +2 | partially occupied |
| +3 | **back-to-back** — 16→20 and 20→23 |
| +4 | minimum stay of 3 nights |

By arrival day-of-month: **13th** availability conflict · **14th** Beds24
unavailable · **15th** quote succeeds then the hold loses the race.

`BEDS24_MODE=live` **never falls back to these.** If Beds24 is unreachable the
guest is told live availability is temporarily unavailable. A booking engine
that invents a free night under failure will eventually sell a night that is
already someone's holiday.

---

## Failure vocabulary

Every code in `BookingErrorCode` has one written sentence, in both languages, in
`components/booking/booking-notice.tsx`. A guest never sees a Beds24 message, a
database error, a stack trace, an n8n response or any internal id — the server
guarantees that (`lib/booking/http.ts`) and the notice component is the other
half.

---

## Still open

Tracked in `docs/direct-booking-production-readiness.md`, which is the
authoritative list. In short: the Beds24 offers endpoint has never been called
live, `BEDS24_CONFIRMED_STATUS` is unproven, PayPal has not been exercised even
in sandbox, and both launch gates are off.
