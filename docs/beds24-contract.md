# Beds24 API V2 — the contract as the code uses it

**Official documentation could not be reached from the environment this
document was written in** (beds24.com and wiki.beds24.com are blocked by the
egress proxy). Nothing below was re-verified against the current reference
today. The classification is built from what was proven **live against this
account** (GitHub Actions read-only check, 2026-09-17; write test) and from
the earlier documentation pass recorded in `docs/booking-core-audit.md`. Treat
DOCS-CONFIRMED as "an earlier pass read the documentation", not as "verified
today".

## 1. What the code calls

| Call | Used by | Status |
|---|---|---|
| `GET /authentication/token` header `refreshToken` → `{ token, expiresIn }` | every call | **PROVEN** |
| `GET /properties?includeAllRooms=true` | discovery only | **PROVEN** (rooms under `roomTypes`) |
| `GET /inventory/rooms/calendar?roomId&propertyId&startDate&endDate&includeNumAvail&includeMinStay&includeMaxStay&includePrices` | sync, verify hold, verify release | **PROVEN** (runs, `numAvail`, `price1`; `closedArrival/Departure` absent) |
| `POST /bookings [{ roomId, propertyId, status:'new', arrival, departure, numAdult, numChild, guest…, price, offerId, infoItems[{code,text}], referer, reference, notes }]` → `[{ success, new: { id, … } }]` | hold | **PROVEN** for status `new` blocking inventory; `offerId` and `infoItems` are **SPEC-CONFIRMED** fields of the booking write schema (apiV2.yaml, 2026-10-12), not yet written on the live account |
| `POST /bookings [{ id, status:'cancelled', notes }]` | release | **PROVEN** — cancel restored inventory |
| `GET /inventory/rooms/offers?propertyId&roomId&arrival&departure&numAdults&numChildren` → `data[]{ roomId, propertyId, offers[]{ offerId, offerName, price, unitsAvailable } }` | quote, revalidation | **PROVEN 2026-10-12** — see §5. `numAdult` (singular) is refused: HTTP 400 code 2002 |
| `GET /bookings?id=` | read-back after hold/finalize/release | **UNKNOWN** — shape modelled, never called |
| `GET /bookings?propertyId&roomId&arrivalFrom&arrivalTo` + match on `reference` | reconciliation of an unknown create | **UNKNOWN** — whether `reference` is returned is not established; the safe failure (escalate) is what the code does |
| `POST /bookings [{ id, status: BEDS24_CONFIRMED_STATUS }]` | finalize | **UNKNOWN** — `confirmed` never written; read-back verifies, so a wrong value fails loudly |
| `idempotency-key` request header | writes | **UNKNOWN** whether honoured; the database's operation ledger is the real guard |
| Booking webhook `{ action, booking{ id, propertyId, roomId, arrival, departure }, bookingId, propertyId, roomId }` | cache invalidation, reconcile trigger | **UNKNOWN** — never received; the handler treats the payload as a signal only |
| Rate limits (credit window) | client maps 429 → `unavailable` | **DOCS-CONFIRMED** behaviour, limits not measured |

Per-property facts that no API call can prove: which statuses block inventory
for **this** property (`new` proven; `confirmed` unproven), Overbooking
Protection, Booking.com auto-replenishment, Auto Actions (absent on
2026-09-17), outgoing email (not configured then).

## 2. What the adapter guarantees regardless

* A 4xx from Beds24 is a `ProviderError` (answered); a timeout, socket error
  or 5xx is `unavailable` and, on a write, **uncertain** — recorded as
  `outcome_unknown` and never re-sent (`BLG01`).
* Every write is followed by a read-back; every hold is checked against the
  calendar; every release is verified against the calendar.
* An offers response with no offer is `availability_conflict`, never "free".
* A calendar gap is unavailable, never available.
* No Beds24 message reaches a guest; no response body is logged.

## 3. Reconciliation helpers

`findBookings` (by room + arrival window, matched on our `reference`) and
`getBooking` (by id) are the two reads reconciliation depends on. If §1's
UNKNOWN rows turn out wrong, the failure is an escalation to a person, not a
second booking.

## 4. The one controlled live validation still required — needs your approval

Runs against Schulstraße I (property 354659, room 731147), one night ≥ 60 days
out, exactly like `scripts/beds24-write-test/hold-release.test.ts` but with
three added steps. **It creates one real booking and cancels it.** Do not run
during a Booking.com sync window.

```
1. GET calendar → pick a free night N (abort if none)
2. POST /bookings status=new, reference=BLG-VAL001, referer='BoLaGio Direct'
   → record id
3. GET /bookings?id=<id>                         ← NEW: read-back shape;
   assert id, roomId, propertyId, arrival, departure, status; record whether
   `reference` is present
4. GET /bookings?propertyId&roomId&arrivalFrom=N&arrivalTo=N   ← NEW: search
   shape; assert the booking is listed; record whether `reference` is present
5. GET calendar N → assert closed
6. POST /bookings id=<id> status=<BEDS24_CONFIRMED_STATUS>     ← NEW
   → GET /bookings?id → assert status; GET calendar N → assert STILL closed
7. POST /bookings id=<id> status=cancelled  (finally)
8. GET calendar N → assert open again
9. GET /inventory/rooms/offers for N→N+1 → record the exact response shape
   (no write; proves the quote endpoint)
```

Outputs to record in this file afterwards: whether `reference` is echoed
(rows 7–8 above become PROVEN or "degrades to manual review"), whether
`confirmed` blocks inventory (row 9), the offers shape (row 6), and whether
the `idempotency-key` header dedups a repeated POST (send step 2 twice with
the same key — **only if** the first response was read; abort otherwise).

Until it runs: `BEDS24_CONFIRMED_STATUS` stays configurable, finalization
verifies by read-back, and unknown creates escalate.

## 5. Offers and bedroom packages — verified live, 2026-10-12

Captured read-only by `.github/workflows/beds24-readonly-check.yml` (Part A2,
runs 38272535939 and 38272891875) for both Schulstraße rooms, arrival
2026-11-08, 1/2/3/7 nights, 1–4 guests. The raw responses are recorded in
`tests/fixtures/beds24-offers-live-2026-10-12.json` and every quote test
replays them.

```json
{ "success": true, "type": "offer", "count": 1,
  "pages": { "nextPageExists": false, "nextPageLink": null },
  "data": [ { "roomId": 731147, "propertyId": 354659,
              "offers": [ { "offerId": 1, "offerName": "1 Schlafzimmer", "price": 434, "unitsAvailable": 1 },
                          { "offerId": 2, "offerName": "2 Schlafzimmer", "price": 473, "unitsAvailable": 1 } ] } ] }
```

| Finding | Consequence in code |
|---|---|
| Rooms sit directly in `data`; there is **no** `roomTypes` level on this endpoint | `mapOffer` / `resolveBeds24BedroomPricing` read `data[].offers` |
| `offerId` (integer) identifies the offer; `offerName` is "1 Schlafzimmer" / "2 Schlafzimmer" | `one_bedroom → 1`, `two_bedroom → 2`; the name is checked too, so a renumbered account fails loudly (`BEDS24_OFFER_MAPPING_MISMATCH`) |
| `price` is the total for the stay; **no fee lines** in any case | one accommodation line; the 1-/2-night surcharges, 3+ night pricing, the bedroom difference and Apartment II's −€50 are all inside `price` and never recomputed |
| An offer with no valid price for the party is **absent** (Offer 1 for 3–4 guests) | `bedroom_setup_unavailable`; the other offer is never substituted |
| `numAdults`/`numChildren` (plural) required; `numAdult` → HTTP 400, code 2002 "Occupancy not defined" | the adapter sends the plural form (the booking WRITE keeps the singular `numAdult`/`numChild`) |
| `offerId` query filter works (returns only that offer) | deliberately NOT used: every offer is fetched and the seam selects, so a missing offer is seen as missing |
| Existing bookings carry `offerId` = 0 (channel reservations) and support `infoItems` | imported reservations derive `bedroom_package` from `offerId` 1/2; 0 stays unknown |

Totals observed (EUR, 2 guests unless stated; 2 Schlafzimmer identical for 3–4 guests):

| | 1 night | 2 nights | 3 nights | 7 nights |
|---|---|---|---|---|
| Schulstraße I — 1 Schlafzimmer | 434 | 788 | 1122 | 2618 |
| Schulstraße I — 2 Schlafzimmer | 473 | 866 | 1239 | 2891 |
| Schulstraße II — 1 Schlafzimmer | 384 | 688 | 972 | 2268 |
| Schulstraße II — 2 Schlafzimmer | 423 | 766 | 1089 | 2541 |

**Before this verification the live quote path could not have worked**: the
adapter sent `numAdult` (HTTP 400 on every call) and read offers under
`roomTypes` (absent). Both were fixed together with the bedroom mapping.

**Still to prove on the account (write test):** that a hold created with
`offerId` and `infoItems` is stored with them, and that `confirmed` blocks
inventory. Both are read back and verified by the hold/finalize sagas, so a
wrong assumption fails into `manual_review`, never into a silent oversell.

