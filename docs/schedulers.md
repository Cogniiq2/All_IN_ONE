# Schedulers

Three secured routes do all scheduled work. Neither depends on n8n, a browser or
the other.

| Job | Route | Interval | Heartbeat name | What it does |
|---|---|---|---|---|
| reconcile | `POST /api/booking/reconcile` `{ "limit": 25 }` | every 3 min | `reconcile` | drain the verified payment inbox → sweep for stuck bookings → work the queue most-severe first |
| operations | same request, after the reconcile | (same) | `operations` | derive turnovers from confirmed stays; emit time-driven guest events once |
| inventory sync | `POST /api/booking/sync` | every 30 min | `inventory_sync` | release holds whose lease (plus grace) ran out and have no payment evidence; refresh the availability cache from Beds24 |
| reservation import | `POST /api/booking/reservations/sync` | every 20 min | `reservation_sync` | read Beds24's reservations (GET only) into `bolagio_reservations`: Booking.com, Airbnb, manual. Never writes to Beds24. See docs/beds24-reservations.md |

All three take `x-bolagio-signature: <BOOKING_SYNC_SECRET>` — a plain shared
secret, because they carry no data and no authority: a forged call can only
make the system do its ordinary maintenance.

Every run writes `bolagio_scheduler_runs` (counts only). `bolagio_scheduler_status`
is the last run per job; the System page and `/api/internal/health` flag a job
overdue at 15 min (reconcile, operations) and 2 h (inventory sync). A job that
never ran is "not instrumented", never healthy.

## Ownership decision

**Supabase `pg_cron` + `pg_net`**, in the same project as the data. Reasons:
closest to the data, survives a Cloudflare outage (recovery must not depend on
the website), no third scheduler product, and n8n must never be transactional
authority. Cloudflare Cron Triggers are not available through OpenNext without
a custom `scheduled` handler.

Nothing creates a schedule automatically. Create it by hand, per environment,
after the migrations and the worker are live:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The secret lives in a database setting, not in cron.job.
alter database postgres set app.booking_sync_secret = '<BOOKING_SYNC_SECRET>';
alter database postgres set app.site_url = 'https://<worker or domain>';

select cron.schedule('bolagio-reconcile', '*/3 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/reconcile',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{"limit":25}'::jsonb,
    timeout_milliseconds := 60000);
$$);

select cron.schedule('bolagio-inventory-sync', '*/30 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/sync',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Run the FIRST reservation import by hand before scheduling it: that run is
-- the backfill (twelve months back through the booking horizon) and is the
-- slow one. Every run after it is an idempotent refresh of the same horizon.
select cron.schedule('bolagio-reservation-sync', '*/20 * * * *', $$
  select net.http_post(
    url     := current_setting('app.site_url') || '/api/booking/reservations/sync',
    headers := jsonb_build_object('content-type','application/json',
                                  'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);
```

Verify: `select * from cron.job;` then, after ten minutes,
`select * from bolagio_scheduler_status;` shows all four jobs.

Concurrency: two overlapping passes are safe. Jobs, inbox rows and outbox rows
are claimed with `for update skip locked`; turnovers and guest events are
idempotent upserts with a unique ledger.

Disable booking, keep the schedule. `DIRECT_BOOKING_ENABLED=false` stops new
bookings; held and paid bookings still need finalizing and releasing.
