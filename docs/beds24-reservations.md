# Canonical reservations — the read-only Beds24 import

BoLaGio's apartments sell on Booking.com, on Airbnb and (later) on this
website, and every one of those reservations lands in Beds24. Until this
change, the only thing the system learned from Beds24 was **whether a night
was free**. A Booking.com stay appeared on the admin calendar as an anonymous
hatched band: no guest, no dates beyond the closure, no channel, no amount,
nothing to plan a cleaning or a check-in around.

This is the layer that fixes that. It reads reservations out of Beds24 and
stores them in `public.bolagio_reservations`.

---

## 1. What it is, and what it is not

| | authority | what it answers |
|---|---|---|
| Beds24 | **authoritative** | what is booked, and what is free |
| `bolagio_unit_inventory_days` | cache | is this night free (unchanged) |
| `bolagio_reservations` | cache / read model | **who is staying, when, from which channel** |
| `bolagio_booking_intents` | authoritative | what THIS WEBSITE tried to do (direct booking) |

`bolagio_reservations` does **not** replace `bolagio_booking_intents`. A
booking intent is a checkout attempt with a lease, a payment saga, an
idempotency key and a `BLG-XXXXXX` reference BoLaGio mints. A Booking.com
reservation has none of those and never will — forcing one into that table
would mean inventing a payment state for a stay BoLaGio was never part of.

The import is **read-only in the strongest sense**: every call it makes is a
`GET`. It never creates, modifies, cancels, confirms or acknowledges anything
at Beds24. `tests/reservations-import.test.ts` asserts that no `POST`, `PUT`,
`PATCH` or `DELETE` is issued from this path, across a whole sync pass. The
existing write logic (holds, confirmation, release) is untouched and is not
reachable from here.

Direct booking remains disabled. The import is orthogonal to it.

---

## 2. The Beds24 contract used

| Call | Purpose | Status |
|---|---|---|
| `GET /authentication/token` (header `refreshToken`) | auth, reused verbatim | **PROVEN** (docs/beds24-contract.md) |
| `GET /bookings?propertyId&roomId&arrivalFrom&arrivalTo&includeInvoiceItems=false&page` | the window read | endpoint + `arrivalFrom`/`arrivalTo` are what `findBookings` already uses; **not verified live** |
| `GET /bookings?id=&includeInvoiceItems=false` | the webhook's fresh read | same shape as `getBooking`; **not verified live** |

**The Beds24 documentation could not be reached from the environment this was
built in** — `beds24.com` and `api.beds24.com` are blocked by the egress proxy,
the same limitation recorded in `docs/beds24-contract.md`. Nothing here was
re-read against the current reference. What that means in practice:

* No parameter name was invented. `propertyId`, `roomId`, `arrivalFrom`,
  `arrivalTo`, `id` and `includeInvoiceItems` are the ones this repository
  already sends to this endpoint.
* `page` is sent for pagination. If the account ignores it, the reader still
  terminates — it stops on the first empty or repeated page, and de-duplicates
  by booking id, so an ignored `page` costs one extra request, never a
  duplicate row or a missed one.
* A **status filter is not sent by default**. Whether `GET /bookings` accepts
  one on this account is not established, and a rejected parameter would fail
  the whole import. Set `BEDS24_RESERVATION_STATUSES` once verified (see §7).
* A **departure-side filter is not used**, because its parameter names are not
  established. Instead the backfill reaches twelve months back, which covers
  any stay long enough to straddle a window edge.
* Every field on the booking object is read **defensively**. A booking missing
  a guest name, an amount, a currency or a timestamp still imports, with those
  facts left null. A booking missing an **id** or **dates** is counted as
  malformed and skipped — it is not a stay this system can hold, and nothing is
  invented to make it fit.

### The one live validation still owed

`docs/beds24-contract.md` §4 already describes it. Two additions for this
feature, both read-only and safe to run at any time:

```
GET /bookings?propertyId=354659&roomId=731147&arrivalFrom=<past>&arrivalTo=<future>
  → record: the apiSourceId on a real Booking.com booking (expected 19) and on
    an Airbnb one (expected 46); the exact apiSource string each carries
    (expected "booking" and "airbnb"); what a booking typed into Beds24 by
    hand carries in BOTH fields; whether `pages` is present and whether `page`
    is honoured; and whether cancelled bookings are returned by default.
GET /bookings?propertyId=354659&roomId=731147&arrivalFrom=…&status=cancelled
  → record whether `status` is accepted, ignored, or rejected.
```

The answers turn three things from defensive into exact: the source
normalisation (§4), the status filter (§7), and whether cancellations are
learned from the sweep as well as from the webhook.

A separate, temporary, staging-only diagnostic answers the *financial* half of
the same ignorance — whether `price` is gross or net, whether a commission
field exists, what `invoiceItems` holds. See `docs/beds24-financial-debug.md`.
It is read-only, returns no personal data, and is expected to be deleted once
its answers are recorded.

---

## 3. The table

`public.bolagio_reservations` (migration
`supabase/migrations/20260923120000_reservation_import.sql`).

Identity is `(provider, external_booking_id)`, unique. **That is what makes
the import idempotent**: the tenth sync of the same Booking.com reservation
updates one row rather than inserting a tenth.

Date semantics are the booking core's: the stay is `[check_in, check_out)`,
generated as `stay_range daterange`, and the departure day is not an occupied
night. A same-day or reversed range is refused by a check constraint and by
the mapper before it.

Money is **integer cents**, never a float. `toCents` is the same exact decimal
conversion the offer mapper uses.

There is deliberately **no exclusion constraint** on `(unit_id, stay_range)`.
Two overlapping Beds24 bookings on one room is a real state of the world — an
overbooking, or a cancelled stay sitting under its replacement — and refusing
to record it would make the import fail exactly when an operator most needs to
see it. Overbooking protection stays on `bolagio_booking_intents`, where it is.

### Writes that never erase

The upsert is not a blind replace. A provider value that is **absent** leaves
the stored value alone, because a shorter payload on a list read is not the
same as the provider saying "this guest has no email". The facts the provider
is definitionally authoritative about — status, dates, source, the snapshot —
are rewritten on every sync.

### Nothing is ever deleted

A cancelled reservation keeps its row, with `provider_status = 'cancelled'` and
`status_class = 'cancelled'`. A reservation that stops appearing in a bounded
date query has left the window, which is evidence of nothing; `last_seen_at`
records when the provider last listed it and claims nothing more.

---

## 4. Source normalisation

Normalised into `booking_com`, `airbnb`, `direct`, `manual`, `unknown` — **on
evidence only, strongest evidence first**:

| # | Evidence | Source |
|---|---|---|
| 1 | `apiSourceId = 19` | `booking_com` |
| 1 | `apiSourceId = 46` | `airbnb` |
| 2 | a valid `BLG-XXXXXX` reference on the booking | `direct` |
| 3 | `apiSource` / `channel` / `bookingSource` / `source` / `referer` equal to `booking`, `booking.com`, `bookingcom` | `booking_com` |
| 3 | …equal to `airbnb`, `airbnb.com`, or containing `airbnb` | `airbnb` |
| 3 | …containing `booking.com` / `bookingcom` | `booking_com` |
| 3 | …exactly `BoLaGio Direct` | `direct` |
| 3 | …exactly `manual` | `manual` |
| 4 | anything else, or nothing | `unknown` |

### `apiSourceId` first, because Beds24 defines it

The numeric `apiSourceId` is the provider's own identifier for the channel.
It is not a label someone typed, it cannot be localised, and it does not
change when a property renames a channel in its own interface. It therefore
outranks every string — including a `BLG-` reference, which is a text field.
Only documented ids are mapped (19, 46); an id this table has not met falls
through to the label evidence and ultimately to `unknown`.

### `apiSource` is `booking`, not `booking.com`

This is the correction that matters most. Beds24 V2's channel *name* for
Booking.com is **`booking`** — its own vocabulary, not the channel's marketing
one. An implementation that recognises only strings resembling `booking.com`
sends **every real Booking.com reservation to `unknown`**. Both spellings are
accepted; `booking` is the one a live booking actually carries.

### A generic `direct` is never BoLaGio direct

Beds24 uses `direct` for anything that did not arrive through a channel: a
booking typed into its own interface, one made on a Beds24-hosted booking
page, one pushed in by any API client on the account. **None of those is
necessarily a BoLaGio direct booking**, and mapping a generic `direct` to our
`direct` source would attribute someone else's reservation to this website
and, downstream, to this website's revenue.

BoLaGio direct is recognised only by BoLaGio-specific evidence: the
`BLG-XXXXXX` reference this site writes, or the exact `BoLaGio Direct` marker
it sets as the referer. Both are strings only this codebase emits.

### What is never used

A guest name, an email domain, a comment, a price, a date, a length of stay.
Every one of them correlates with a channel and none proves one, and
attributing revenue on a guess is worse than admitting ignorance.

### Diagnosis

Two columns keep the evidence so the mapping can be tightened from observed
values rather than guesses, and neither is personal data:

* `source_raw` — the channel label that decided it, or, for an `unknown`, the
  first label that *failed* to resolve (read in the same priority order, so it
  is never an unrelated string from another key).
* `external_source_id` — Beds24's `apiSourceId`, kept whether or not it is
  mapped. A run of `unknown` reservations sharing one id here is a mapping to
  add, not a mystery.

The admin board shows both on an unidentified channel
(`Channel not identified · “expedia”, id 71`), so an operator can report one
line back and the table above gains a row.

Beds24's exact wording for a booking typed into its own interface is still
**not established for this account**, so those land in `unknown` rather than
being attributed to a channel that may not be the truth.

After the first live import, this is the query that closes the gap:

```sql
-- What the provider actually calls the channels we could not identify.
-- One row here with a repeated id is one row to add to the table above.
select external_source_id, source_raw, count(*)
from public.bolagio_reservations
where source = 'unknown'
group by 1, 2
order by 3 desc;
```

## 5. Status

The provider's own word is stored verbatim in `provider_status`. Beside it,
`status_class` exists for exactly one purpose: so a cancelled stay can be kept
and left out of occupancy without every screen having to learn Beds24's
vocabulary.

| Beds24 | class | occupies? |
|---|---|---|
| `new`, `confirmed` | `active` | yes |
| `request` | `provisional` | no |
| `cancelled` | `cancelled` | no |
| `black` | `blocked` | no (an owner block, not a guest) |
| anything else | `unknown` | no |

An unrecognised status is never treated as a stay.

---

## 6. The import window

Default: **today − 12 months** through **today + `BOOKING_INVENTORY_MONTHS`**
(18 months today), split into 90-day windows. Adjacent windows stop one day
short of the next one's start, because the provider's arrival filter is
inclusive at both ends: no gap, no duplicate query.

Subsequent runs re-read the same horizon and upsert. That is deliberate:
correctness over micro-optimisation, and the whole horizon for two units is a
few dozen `GET`s. If a reliable provider-side modification filter is
established later, `provider_modified_at` is already indexed for it.

---

## 7. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `BOOKING_SYNC_SECRET` | — | protects the sync endpoint (already configured) |
| `BOOKING_INVENTORY_MONTHS` | `18` | forward edge, shared with the inventory sync |
| `BOOKING_RESERVATION_BACKFILL_MONTHS` | `12` | how far back a backfill reaches (1–60) |
| `BOOKING_RESERVATION_WINDOW_DAYS` | `90` | width of one provider query (7–365) |
| `BEDS24_RESERVATION_STATUSES` | *unset* | comma-separated statuses to request. **Leave unset** until the live validation in §2 proves the account accepts a `status` filter. Then `new,request,confirmed,cancelled,black`. |

Nothing new is required to run the import. The existing `BEDS24_REFRESH_TOKEN`
and `BOOKING_SYNC_SECRET` are enough.

---

## 8. Scheduling

Same pattern as the other jobs — Supabase `pg_cron` + `pg_net`, per
`docs/schedulers.md`. Nothing schedules itself.

```sql
select cron.schedule('bolagio-reservation-sync', '*/20 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/reservations/sync',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);
```

Verify with `select * from cron.job;`, then
`select * from bolagio_scheduler_status where job = 'reservation_sync';`.

The job is also reachable from n8n or any scheduler that can send a POST with
the shared secret header; it needs no browser and no session. It records a
heartbeat under `reservation_sync` (counts only) and the System page flags it
overdue after two hours.

The **first** run is the backfill and is the slow one. Run it by hand once
(§10) before putting it on a schedule.

---

## 9. The webhook

`POST /api/webhooks/beds24` now also refreshes the affected canonical
reservation. Its security model is unchanged, and so is its principle: the
payload is a **signal**, never state. The handler issues a fresh
`GET /bookings?id=` and writes what Beds24 actually says.

A forged delivery therefore costs one wasted read and can change nothing. A
booking on a room no enabled mapping covers is skipped and logged. A provider
that cannot be reached is logged; the scheduled import is the floor under it.

This is what makes a Booking.com reservation visible within seconds rather
than at the next sweep — and, while `BEDS24_RESERVATION_STATUSES` is unset, it
is the reliable path by which a **cancellation** is learned.

---

## 10. Running it

Authenticated with the same shared secret as `/api/booking/sync`:

```
POST /api/booking/reservations/sync
x-bolagio-signature: <BOOKING_SYNC_SECRET>
{}                                              // the default horizon, every mapped unit
{ "unitSlug": "schulstrasse-i" }                // one unit
{ "from": "2024-01-01", "to": "2026-01-01" }    // an explicit window, e.g. a deeper backfill
```

The response is **counts and a window, and nothing else**:

```json
{ "fetched": 42, "inserted": 5, "updated": 37, "skipped": 0, "malformed": 0,
  "failed": 0, "units": 2, "requests": 18,
  "windowFrom": "2025-09-21", "windowTo": "2028-03-21", "truncated": false }
```

* `skipped` — returned by the provider on a room no enabled mapping covers.
* `malformed` — provider rows without an id or dates.
* `truncated` — a window hit the reader's page cap. Do not widen anything;
  investigate, because it means a window returned far more than expected.

No guest name, email, phone, reservation content or provider body appears in
the response, ever. `tests/reservation-sync-route.test.ts` asserts that
against a fixture full of personal data, on the whole serialised body.

---

## 11. Security and personal data

* **RLS on, no policy, `anon` and `authenticated` revoked.** The only door is
  the service role held by the server, exactly as for every other `bolagio_*`
  table. If a publishable key leaks, this table reads nothing.
* **No public API** exposes reservations. The only route that touches them is
  the secret-protected sync endpoint, and it returns counts.
* **`raw_provider_snapshot` never leaves the server.** The admin row source
  does not select it, so it has no route into a DTO, a page or a response.
* **Guest email and phone are not selected by the admin row source either.**
  The boards show who is arriving, not how to contact them.
* **No identity-document field exists.** Guest registration (Meldeschein) is a
  separate matter and is not this table's business.
* **Logs carry counts, unit slugs, provider booking ids and statuses.** The
  logger's allow-list makes a guest name structurally unable to get through;
  the raw payload is never logged.
* **Retention** is classified in `lib/retention/policy.ts`
  (`bolagio_reservations`, `guest_personal_data`). The proposed period is ten
  years for the commercial record with the raw snapshot reduced far sooner,
  and — as with every other class — it is a **proposal flagged
  `NEEDS CONFIRMATION`** until the company records a decision. Nothing deletes
  on a schedule.

### Open legal point — flag, not advice

BoLaGio is a controller for its own processing of these guests' data even
where Booking.com or Airbnb introduced them. Two things should be settled with
the company's adviser before this is treated as complete:

1. **The records of processing (Art. 30)** should name this import and this
   table, with the OTA as the source.
2. **The privacy notice** should cover guests who arrive via an OTA — they do
   not pass through this website's forms and so never see it.

Neither blocks the technical work, and neither is assumed to be already done.

---

## 12. What the operations interface now shows

* **Calendar** — channel reservations are drawn as real bars with the guest,
  the channel and the stay, instead of an anonymous hatched band. Cancelled
  ones stay visible, struck through, and are excluded from occupancy. Hatched
  bands now mean only what they always should have: *closed at the channel
  with no reservation to explain it*. Availability still comes from
  `bolagio_unit_inventory_days`; this changes what the stays are, not where
  availability comes from.
* **Today** — arrivals, departures and in-house count both records. Channel
  stays are listed separately, because they have no payment state and no
  detail page, and a board that pretends otherwise invents one.
* **Bookings** — a *Channel reservations* section beside the direct-booking
  table. Never merged into it.
* **Cleaning** — a *Channel departures* section (see below).
* **System** — the `reservation_sync` heartbeat, overdue after two hours.

### Double counting

A confirmed BoLaGio direct booking exists in **both** records: as the intent
that created it, and as the reservation imported back. The intent wins — it is
the richer record — and the canonical row for the same provider booking id is
dropped rather than drawn twice. Matching is on `beds24_booking_id`, and on
`direct_intent_id` where the import established it.

---

## 13. Cleaning — deliberately unfinished

`bolagio_turnovers` rows are derived by the database from **confirmed direct
departures**, and creating one emits a `cleaning.required` event into the
outbox that the automation platform acts on. Deriving turnovers from imported
Booking.com history would fire that event for every stay already in the
account — real messages, for cleanings long since done.

So this release **shows** channel departures on the cleaning board and creates
no work orders and no automations for them. Nothing new is sent, to anyone.

The follow-up, to be done deliberately and with the automation side considered:

1. `alter table bolagio_turnovers alter column intent_id drop not null`, add
   `reservation_id uuid references bolagio_reservations(id)`, unique.
2. Extend `bolagio_sync_turnovers` to derive from active canonical
   reservations as well as confirmed intents.
3. Decide the cut-off — almost certainly "departures from the day the
   derivation goes live onward" — so the backfill does not emit history.

---

## 14. Finance — deliberately untouched

`total_amount_cents` is **gross as the provider states it**, and that is all it
claims. It is not payout, not net of commission, and it says nothing about
whether VAT or city tax is included. The finance subledger does **not** read
this table, no invoice is generated from an OTA import, and no tax logic
changed. Where the amount is shown in the interface it is labelled
`gross (provider)`.

Joining reservations to real revenue is a finance-domain decision that needs
the Booking.com commission invoice and the payout statement. It is not guessed here.

**Since 20260926** the Booking.com finance-statement import *reads* this table,
read-only, to match each statement line to a reservation by the exact
Booking.com number in `channel_reference`, and snapshots `total_amount_cents`
beside the statement gross to show a discrepancy. It never writes a
reservation, and it never treats a Beds24 `commission = 0` as a commission. See
`docs/finance/booking-com-statement.md`.

---

## 15. Where the code is

```
supabase/migrations/20260923120000_reservation_import.sql   the table, types, RLS
supabase/ops/rollback_20260923.sql                          the rollback (refuses to drop rows silently)
lib/integrations/beds24/reservations.ts                     GET-only reader + mapping + normalisation
lib/booking/reservation-repository.ts                       the idempotent upsert
lib/booking/reservation-sync.ts                             windows, unit mapping, the pass
app/api/booking/reservations/sync/route.ts                  the scheduled endpoint
app/api/webhooks/beds24/route.ts                            + fresh read on a booking event
lib/admin/{rows,source-supabase,dev/fixtures,dto,queries,presentation,cleaning}.ts
components/admin/reservations/reservation-rows.tsx          the board
tests/reservations-import.test.ts                           mapping, idempotency, GET-only
tests/reservation-sync-route.test.ts                        auth, PII-free response
tests/reservation-admin.test.ts                             occupancy, presentation, migration posture
```
