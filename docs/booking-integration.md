# Booking integration — Beds24 + Supabase + n8n

The runbook for the booking foundation. Read `lib/booking/service.ts` for the
rules themselves; this file is what a person has to *do*.

---

## The architecture, in one picture

```
Booking.com ─┐                                  ┌─ browse: cached, instant
Airbnb ──────┼─► Beds24 ─► /api/webhooks/beds24 │
Beds24 UI ───┘      ▲            │              │
                    │            ▼              │
      live quote ───┤      Supabase cache ──────┤
      live hold  ───┤   (bolagio_unit_inventory_days)
      confirm    ───┘            ▲              │
                                 │              ▼
                    POST /api/booking/sync   BoLaGio website
                    (cron, every 15–60 min)

guest ─► /api/booking/quote  ─► Beds24 live  ─► authoritative price
      ─► /api/booking/intent ─► Beds24 live  ─► HOLD, before any money moves
      ─► /api/booking/payment-session ─► n8n ─► Stripe / PayPal
                                          │
      n8n ─► POST /api/booking/callback ◄─┘   the ONLY thing that confirms
```

**Beds24 is authoritative.** Supabase is a fast read model plus BoLaGio's own
data. n8n executes payments. The website renders server answers and computes
nothing chargeable.

---

## Responsibilities

| System | Owns |
|---|---|
| **Beds24** | live availability, rates, channel inventory, reservations, Booking.com + Airbnb sync |
| **Supabase** | unit registry, provider mapping, availability cache, booking intents, guest data, payment state, raw provider events |
| **n8n** | Stripe and PayPal execution, and the trusted callback that reports the outcome |
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
npx wrangler secret put N8N_BOOKING_PAYMENT_WEBHOOK_SECRET
npx wrangler secret put BOOKING_CALLBACK_SECRET
npx wrangler secret put BOOKING_SYNC_SECRET
npx wrangler secret put BEDS24_WEBHOOK_SECRET
```

Generate each shared secret with real entropy, e.g. `openssl rand -hex 32`.

---

## Manual steps — Supabase

1. **Apply the migration.** `supabase/migrations/20260916120000_booking_foundation.sql`,
   via `supabase db push` or the SQL editor. It creates `btree_gist`, six
   `bolagio_*` tables, the enums, the triggers, and the overlap exclusion
   constraint that makes two active holds on the same dates impossible.
   It does not touch the three earlier migrations, which belong to the
   archived admin application.
2. **Seed the registry.** Run `supabase/seed/bolagio_booking_units.sql`. It
   inserts the five units with `is_bookable = false`.
3. **Fill in the Beds24 mapping.** Uncomment the blocks at the bottom of the
   seed file with the real property and room ids.
4. **Confirm occupancy.** `max_guests` is `NULL` for every unit because the
   owners have not verified it, so the application falls back to four. Set the
   real figure per unit when it is known — no deploy is needed.
5. **Check RLS.** Every table is RLS-enabled with *no* permissive policy, and
   `anon`/`authenticated` are revoked. Verify with the Supabase advisor that no
   policy has been added: the browser must never read these tables.
6. **Open a residence.** `update bolagio_units set is_bookable = true where
   slug = '…';` — but only after step 3 and a successful sync.

---

## Manual steps — Beds24

1. **API V2 access.** Settings → Account → API. Generate an invite code,
   exchange it for a **refresh token**, and put that in `BEDS24_REFRESH_TOKEN`.
   The V1 `apiKey`/`propKey` scheme is deprecated and is not implemented here.
2. **Note the ids.** Property id (Settings → Properties) and room id
   (Settings → Rooms) for each unit, into the seed file.
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

## The n8n contract

**BoLaGio → n8n** (`N8N_BOOKING_PAYMENT_WEBHOOK_URL`), header
`x-bolagio-signature: <N8N_BOOKING_PAYMENT_WEBHOOK_SECRET>`:

```json
{
  "reference": "BLG-7K2M9Q",
  "paymentProvider": "stripe",
  "amountCents": 46500,
  "currency": "EUR",
  "unitSlug": "schulstrasse-i",
  "checkIn": "2026-09-20",
  "checkOut": "2026-09-23",
  "adults": 2,
  "children": 0,
  "guest": { "firstName": "…", "lastName": "…", "email": "…", "locale": "de" },
  "returnUrl": "https://bolagio.de/booking/return?ref=BLG-7K2M9Q",
  "cancelUrl": "https://bolagio.de/booking/return?ref=BLG-7K2M9Q&cancelled=1"
}
```

Every chargeable value there was written by the server from a live Beds24
offer. The browser sends a reference and a provider choice; nothing else.

**n8n → BoLaGio**, expected response:

```json
{ "paymentSessionId": "cs_test_…", "redirectUrl": "https://…", "expiresAt": "…" }
```

`redirectUrl` must be absolute `https:` with no embedded credentials — it is
validated before a guest is sent to it, because an unchecked URL from an
upstream system is an open redirect with a payment page in front of it.

**n8n → BoLaGio**, the outcome (`POST /api/booking/callback`), header
`x-bolagio-signature: <BOOKING_CALLBACK_SECRET>`:

```json
{ "reference": "BLG-7K2M9Q", "outcome": "succeeded", "paymentSessionId": "cs_test_…" }
```

`outcome` is one of `succeeded` | `failed` | `cancelled` | `expired`.

**This is the only thing in the system that can confirm a booking.** A guest
arriving at `/booking/return` proves a browser navigated and nothing more, so
that page only ever *reads* status. Retry the callback freely: repeated
outcomes are quiet successes, and a late `failed` after a `confirmed` is
refused rather than un-confirming a stay someone has paid for.

---

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

- Beds24 field casing per endpoint is written against the published V2 surface
  and **has not been verified against a live account** — no credentials exist
  yet. `mapper.ts` reads defensively for that reason. Smoke-test `live` mode
  against a real property before the first guest sees it.
- `PAYMENT_ENABLED` in `lib/content/brand.ts` is still `false`. The booking
  path is reachable as soon as a unit is `is_bookable` with a provider mapping;
  that flag governs the portfolio-wide payment claim and should be reviewed
  with the n8n workflows when they exist.
- German legal review of the checkout: the terms, privacy policy and
  cancellation conditions are linked from the payment step and are the site's
  own existing pages. No tax breakdown is displayed, because none has been
  established — `QuoteComponent.taxCategory` carries the structure for one
  without asserting a rate.
