# Reconciliation

Everything that can end in "we do not know" ends here.

**The rule every handler obeys: READ the authoritative system before you
WRITE.** An uncertain create is not retried — Beds24 is searched. An uncertain
capture is not re-attempted — PayPal is read. This is the difference between a
system that recovers and one that turns one failure into two bookings.

**The rule about money: nothing here refunds, cancels a paid booking, or
releases inventory for a booking with any payment evidence.** Ambiguous
financial inconsistencies are escalated, never resolved. A worker that decides
on its own to refund a guest is a worse problem than the one it was fixing.

---

## 1. Running it

```
POST /api/booking/reconcile
x-bolagio-signature: <BOOKING_SYNC_SECRET>
{ "limit": 25 }
```

Every 2–5 minutes. Bounded by `limit` so one invocation cannot exceed a
platform request deadline; a backlog drains over several passes.

Three schedulers work, and **none is required** — the system must recover
without n8n being healthy. Pick one.

### Supabase Cron (recommended: closest to the data)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'bolagio-reconcile', '*/3 * * * *',
  $$
  select net.http_post(
    url     := 'https://<site>/api/booking/reconcile',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-bolagio-signature', current_setting('app.booking_sync_secret')),
    body    := '{"limit":25}'::jsonb
  );
  $$);
```

Store the secret with
`alter database postgres set app.booking_sync_secret = '...'` rather than
inlining it in the job definition, where it appears in `cron.job` to anyone who
can read that table.

### Cloudflare Cron Trigger

Add to `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["*/3 * * * *"] }
```

### n8n Schedule node

See `docs/n8n-booking-contract.md` §6. A plain shared secret, not the HMAC — it
is a trigger that takes no data and carries no authority.

**Nothing is deployed automatically.** No cron job is created by a migration,
because a schedule that fires against an unconfigured environment is worse than
no schedule.

---

## 2. The three phases

### Phase 1 — drain the payment inbox

Verified events the webhook stored and nothing has acted on.

This is what makes the webhook fast: ingress stores and returns a 2xx in
milliseconds, and the Beds24 finalization a completed capture triggers happens
here instead of inside PayPal's request. A capture sitting unprocessed for two
minutes is fine; PayPal retrying for three days because we held its connection
open is not.

First, because a verified capture is the most valuable unprocessed fact in the
system and processing one often makes a queued job unnecessary.

### Phase 2 — sweep

Finds problems nobody queued: a process that died before it could queue
anything, a row left reserving by a worker that was killed mid-transition.

Any booking in a reserving state and untouched for `BOOKING_STALE_HOLD_MINUTES`
(default 180) gets a job.

### Phase 3 — the queue

`FOR UPDATE SKIP LOCKED`, **ordered by severity**, so a paid-but-unfinalized
booking is worked before a stale hold whatever order they arrived in.

---

## 3. The handlers

| Reason | Sev | What it does |
|---|---|---|
| `BEDS24_HOLD_OUTCOME_UNKNOWN` | 1 | read the operation's resource id; else **search Beds24** for our reference. Found → adopt. Not found → escalate. **Never creates** |
| `PAID_BOOKING_UNFINALIZED` | 1 | retry `finalizeBooking` against the **same** booking id. Never a second booking, never a refund |
| `BEDS24_FINALIZATION_FAILED` / `_UNVERIFIED` | 1 | as above |
| `BEDS24_RELEASE_FAILED` / `_UNVERIFIED` | 2 | re-run the release saga. `released` only when the nights are provably open |
| `PAYMENT_PROVIDER_UNCERTAIN` | 1 | **read** the PayPal order. Captured → apply through the same validation as a webhook. Not captured → record the real state |
| `BOOKING_LOCK_LEASE_EXPIRED` | 4 | free a `locking` row. Safe only because `locking` is before any successful external call |
| `BOOKING_HOLD_STALE` | 3 | through `evaluateLease`, which refuses while any payment evidence exists |
| `PAYMENT_AMOUNT_MISMATCH` and every other financial ambiguity | 1 | **escalate.** Deliberately not automated |

### The important one

`BEDS24_HOLD_OUTCOME_UNKNOWN` matches on **our reference**, never on dates
alone — a date match could be somebody else's Booking.com reservation for the
same night. If Beds24 does not return the `reference` field for this account,
nothing is found, the operation stays unresolved and it escalates to a human.

That is not a design failure. A handler that created a booking when it could
not find one would turn "probably nothing happened" into "definitely two
bookings".

---

## 4. Job lifecycle

```
pending ──claim──► claimed ──► resolved
                      │
                      └──fail──► failed ──(12 attempts)──► exhausted
                                    │                          │
                                    └── backoff, retry          └─► outbox:
                                                                booking.manual_review_required
```

One **open** job per `(intent, reason)`, enforced by a partial unique index — a
sweep running every three minutes must not create a thousand jobs for one stuck
booking. Re-queuing an open job bumps its urgency instead.

`exhausted` is a trigger for a human alert, not for giving up quietly.

---

## 5. Deep consistency sweep

Short reconciliation catches what the system noticed or left reserving. A
periodic deeper comparison — Supabase against Beds24 against PayPal — catches
what it never knew about.

**Not implemented.** Specified here so it is not mistaken for existing.

| Check | Query |
|---|---|
| paid but not confirmed | `status in ('paid','paid_unfinalized','finalization_failed')` |
| confirmed without a completed payment | `status='confirmed' and source='direct' and payment_status<>'paid'` |
| local active booking without a Beds24 id | `bolagio_status_reserves(status) and beds24_booking_id is null` |
| duplicate provider ids | group by `beds24_booking_id` / `payment_capture_id` having count > 1 |
| stale holds | `bolagio_ops_attention where severity <= 2` |
| outbox backlog | `bolagio_ops_queues where queue='outbox'` |
| unresolved operations | `bolagio_external_operations where outcome='outcome_unknown'` |

Requiring a full provider listing, and therefore not in the short pass:

* a Beds24 booking with `referer = 'BoLaGio Direct'` that no intent claims →
  **orphan hold**, blocking nights nobody can sell;
* a PayPal capture carrying a `custom_id` we do not have → **orphan payment**,
  money taken for a booking that does not exist.

Both need a person. Neither may be auto-resolved.

---

## 6. What to watch

```sql
select * from bolagio_ops_attention order by severity, updated_at;
select * from bolagio_ops_queues where state in ('exhausted','failed');
```

Alert on: any severity-1 row; an `exhausted` row in any queue; an outbox row
older than an hour (the n8n pump has stopped); an
`outcome = 'outcome_unknown'` row older than fifteen minutes.

---

## 7. Running the database tests

Real PostgreSQL, real concurrent transactions. **Not mocked.**

```bash
./scripts/db-test.sh
```

It starts a throwaway PostgreSQL 14+ cluster (needs `btree_gist`), applies the
three booking migrations and runs `tests/sql/concurrency.sql` plus
`tests/sql/race.sh`. Against your own database:

```bash
DATABASE_URL='postgres://user@host:5432/postgres' ./scripts/db-test.sh
```

> It creates and **drops** a database called `bolagio_test`. Do not point it at
> anything you care about.

It is a separate job from `npm test` because it needs a database. The default
CI runner has no PostgreSQL, so **`npm test` does not prove concurrency** — it
proves the state tables. The concurrency guarantees are proven by this script
and nothing else.

What it establishes, as itself rather than in a mock: the exclusion constraint
(overlap refused, adjacency allowed, different units independent), stale-lock
reclamation, the transition trigger rejecting a direct `UPDATE`, compare-and-set
refusing a stale expected state, capture validation including amount and
currency mismatches, `SKIP LOCKED` claiming being exclusive across workers,
crash recovery via lease expiry, dead-lettering, inbox deduplication, and — in
`race.sh` — two genuinely concurrent backend processes where exactly one
reserves the range.
