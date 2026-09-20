# Guest operations and turnovers — the foundation

What a **confirmed** stay implies, derived on a schedule, emitted once,
consumed by n8n. Nothing here sends a message, knows an access code, or
assigns a cleaner.

## 1. House rules and the clock

Per unit, in `bolagio_units`: `timezone` (default `Europe/Berlin`),
`check_in_time` (`14:00`), `check_out_time` (`11:00`). Every "today", every
night and every timing below is computed in the unit's timezone in the
database, not in the worker's clock.

## 2. Events (emitted today)

| Event | Trigger (property calendar) | Once per | Payload |
|---|---|---|---|
| `booking.confirmed` | Beds24 read back verified | booking | reference, unitSlug, dates, amount |
| `cleaning.required` | a turnover row is **created** for a confirmed departure | stay | reference, unitSlug, departure, nextArrival, sameDay |
| `guest.prearrival_ready` | check-in is ≤ 3 days away (and not past) | booking | reference, unitSlug, dates, daysUntilArrival |
| `guest.checkin_ready` | check-in day | booking | reference, unitSlug, dates |
| `review.requested` | 1 day after check-out, within a 14-day window | booking | reference, unitSlug, dates |

Timing constants: `guestOperationsTiming()` in `lib/booking/property-config.ts`.
Emission: `bolagio_emit_guest_events()` from the operations pass
(`lib/booking/operations.ts`), after every reconcile. The dedup ledger
`bolagio_guest_events (intent_id, kind)` is written in the same transaction as
the outbox row, so a pass that dies half way emits nothing twice.

A booking that leaves `confirmed` before an event is due never gets it. One
that was confirmed months ago and never asked for a review is not asked today
(the window).

## 3. Message context

n8n fetches `GET /api/internal/booking?ref=…` for the guest's name, email,
phone and locale — never from the event. The context carries `houseRules`
(`timezone`, `checkInTime`, `checkOutTime`) read from the unit's row, so a
pre-arrival message states check-in time from one source of truth.

## 4. Turnovers

`bolagio_turnovers`: one row per confirmed stay, keyed on the stay. Created
by `bolagio_sync_turnovers()` for departures from yesterday to +60 days;
updated in place if the stay's dates change; **voided**, never deleted, when
the stay leaves `confirmed`. `window_start` is check-out time on the departure
day, `window_end` is check-in time the same day; `next_arrival` is the next
confirmed check-in on the unit and `same_day` says whether the room is needed
that afternoon.

Status: `required` → `done` (with `done_at`, `done_by`) or `void`. **No UI or
action sets `done` yet.** That needs a product decision: who marks it (a
cleaner on a phone? an operator?), whether a photo or a checklist is required,
and whether a missed same-day turnover blocks the arrival. Until then the
table is the deterministic fact "this needs cleaning by 14:00", and
`cleaning.required` is the durable trigger n8n can route to whoever cleans.

Scale: 20–50 units is one indexed scan per pass; the unique `intent_id`
prevents double work; date changes update rather than duplicate.

## 5. Deliberately not built

Access codes, a messaging inbox, a cleaner app, checklists, maintenance
tickets, review-platform integration. Each is a product decision with legal
or vendor dependencies; the events above are the contract they plug into.
