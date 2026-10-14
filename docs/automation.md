# What keeps `/admin` current — and what cannot yet

Verified live on 2026-10-14 (read-only Beds24 check, workflow Part A11; Supabase
queries). Nobody needs to import bookings by hand.

## The automatic chain

```
Booking.com ──(channel connection)──► Beds24
Beds24 ──(webhook, seconds)──────────► /api/webhooks/beds24 ─► bolagio_reservations
Beds24 ──(hourly import, :07)────────► /api/booking/reservations/sync ─► bolagio_reservations
bolagio_reservations ──(every page load)──► Overview, Reservations, Calendar, Properties,
                                            Performance, Finance "Booked revenue"
bolagio_reservations ──(operations pass, every 3 min)──► bolagio_turnovers ─► Cleaning
```

| Change at Booking.com | Reaches the dashboard | Safety net |
|---|---|---|
| New booking | seconds (webhook refresh by booking id) | hourly import |
| New dates, party, price | seconds | hourly import (every window within 2–3 runs; the next 60 days every run) |
| Cancellation | seconds; kept as history, excluded from every figure | hourly import |
| Cleaning | within 3 minutes of the stay changing | — |

The webhook is never relied on alone: the hourly import re-reads the whole horizon
(12 months back, 18 ahead) and repairs anything a missed webhook left behind.
Reservations are never deleted; a stay that leaves the import horizon stays in the
dashboard as history.

## History

Beds24 holds **29** BoLaGio bookings in total (every status, both properties, arrivals
from 2015 onward), the earliest arriving **14 Sep 2026** and booked **16 Sep 2026**, when
Booking.com was connected. All 29 are in Supabase (22 active, 7 cancelled; 0 duplicates).
Booking.com stays from before that date were never sent to Beds24 and cannot be read
from it.

A longer re-import, should one ever be needed, is the same signed endpoint with an
explicit range: `POST /api/booking/reservations/sync {"from":"2015-01-01","to":"2028-04-30"}`.
When its request budget ends a run early, the response carries `resumeKey`; pass it back
with the same range and the import continues exactly where it stopped.

## What is NOT automatic, and why

| Data | Why it cannot be automatic today | Best supported route |
|---|---|---|
| Booking.com commission, fees, net payout, payout date | Beds24 does not carry them: on Booking.com bookings `commission`, `deposit` and `tax` are `0` and the invoice holds only the gross charge; `/bookings/payments` and payout paths are not offered (HTTP 500/404). Booking.com's own payout data is available only to connectivity partners, not to a property. | Booking.com extranet → Finance → statement CSV, imported on `/admin/finance/imports` (validated adapter, idempotent). |
| Bank transactions | No bank connector exists in this repository; a bank feed needs a licensed PSD2 account-information provider and the owner's bank consent. | Bank CSV in the BoLaGio template on `/admin/finance/imports`, until a PSD2 provider is chosen. |
| Booking.com stays before Sep 2026 | Not in Beds24 (see History). | Booking.com extranet reservation export, if the owners want them. |

The dashboard keeps the layers apart: **Booked** (from reservations, automatic),
**Settled** (Booking.com statements), **Paid into bank** (bank statements).
