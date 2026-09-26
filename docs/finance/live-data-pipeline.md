# Live finance data: how real bookings and payments reach the Finance dashboard

This is the operational reference for the path from a booking, payment or statement to a figure on
`/admin/finance`. It records why the dashboard showed no real figures (as of 2026-09-26), what each
flow looks like now, and the steps an owner must take.

## 1. Why the Finance dashboard showed no real figures

This is what the staging/shared Supabase project (`lqgtmoulqzmrhglabrms`, "ALL IN ONE") showed on
2026-09-26, checked read-only:

| Question | Finding |
|---|---|
| Source the Finance pages read | **Supabase.** The staging worker has the service role, and `adminMode()` resolves to `supabase`. The finance heartbeat (`bolagio_integration_health`, provider `finance`) is written every 3 minutes by the reconcile schedule. |
| Finance schema | **Complete.** Every table, view and RPC from 20260916 through 20260926 exists. Only this change's migration, **20260927**, is not applied. (The project's `supabase_migrations` history does not list the BoLaGio migrations, because they were applied by SQL rather than the CLI, so check objects, not that list: `supabase/ops/preflight.sql` §3.) |
| `bolagio_booking_intents` | **0 rows.** No direct booking has ever been made (`DIRECT_BOOKING_ENABLED=false`). |
| `bolagio_payment_events` | **0 rows.** No PayPal payment has ever happened. |
| `bolagio_reservations` | **16 rows**, all Booking.com (`apiSourceId` 19), check-ins from 2026-09-14 to 2027-08-13, synced hourly. |
| Finance ledger (`bolagio_finance_transactions`, `_payments`, `_reconciliations`, `_ota_settlements`, `_ota_payouts`, tax periods and estimates) | **0 rows.** |
| `bolagio_finance_import_batches` | **3 uploads.** Two are Booking.com finance statements with status **`validated`**: 6 valid lines: €4,072.76 statement gross, €675.08 commission, €57.02 payment-service fee and €3,340.66 net, across 4 payouts. Neither was ever **imported**: `settlement_id` is null on every row, and the audit log has `finance.import.stage` but no `finance.import.commit`. The third upload was rejected (wrong adapter). |

**Root cause.** The Finance ledger derives revenue from exactly two sources:

1. direct bookings (`bolagio_booking_intents`), of which there are none;
2. the Booking.com finance statement, whose second step ("Import valid rows") was never run.

Beds24 reservations are, by design, **not** revenue: the reservation total states neither the
commission nor the VAT treatment, so the ledger never reads it (see `docs/beds24-reservations.md`
§Financials). So ingestion ran every 3 minutes and correctly found nothing. The ledger was empty, and
every figure derived from it (P&L, VAT, taxes, cash flow, the Booking.com page) was a true zero. The
health card still said "healthy", because nothing measured "facts that exist but are not in the
ledger". That blind spot is what this change closes. Upload and import stay two deliberate steps
(the operator reviews the parsed file before it becomes accounting evidence), but a file left
validated is now a **high** Inbox item and a health-card finding.

**A second finding, on the Cloudflare Workers plan.** Every hourly reservation sync ended with
`failed: 1` and wrote no `reservation_sync` heartbeat (the last one is from 2026-09-24). One Worker
invocation may make **50 outbound requests** on the Free plan; past that every `fetch` throws. The
sync needed about 80:

| Per hourly run (2 units, 16 reservations) | Requests |
|---|---|
| Beds24 reads: 12 months back to 18 ahead in 90-day windows = 11 windows × 2 units | 22 (+1 token) |
| One `last_success` heartbeat per Beds24 read | 22 |
| Per reservation: SELECT, then UPDATE/INSERT | 32 |
| Units list, scheduler heartbeat | 2 |
| **Total** | **~79** |

The run of 2026-09-26 09:07 shows the cap in action: 1 units read, 11 GETs + 11 PATCHes (Schulstraße
I complete) and 15 heartbeat writes in the Supabase log, then 14 Beds24 reads counted before the
first Schulstraße II window's fetch was refused. The heartbeat write at the end was refused too.
Schulstraße II's windows have not been refreshed by a scheduled run since 24 Sep. Whether that is
also why four September statement stays are missing locally is **not established**: every local row
was first imported on 22 Sep. The first complete cycle after deploy will answer it (§5, step 3).

This is fixed without the Paid plan (§4a). Each run now spends from a budget of **40** requests, and
the horizon is resumed across runs from a cursor. Measured at the live shape: run 1 makes 35 requests,
and run 2 makes 20 and completes the cycle.

## 2. The flows, as they are now

```
DIRECT BOOKING
  guest → /api/booking/intent → bolagio_booking_intents (quote components, currency, total, terms evidence)
        → /api/booking/payment/order → payment_order_id, payment_status
        → /api/booking/payment/capture → applyCapture: payment_capture_id, paid_amount_cents,
                                         paid_currency, paid_at, then Beds24 finalization → confirmed_at
          └─ TRIGGER bolagio_booking_intents_finance_enqueue (same transaction)
               → bolagio_finance_ingestion_queue (intent_id, pending)

PAYPAL WEBHOOK
  PayPal → /api/webhooks/paypal (or the Edge Function) → signature verified with PayPal
        → bolagio_record_payment_event → bolagio_payment_events (unique per event id) → HTTP 200
          (nothing else runs before the 2xx: no Beds24, finance, n8n, email or invoice)
  reconcile schedule, every 3 min → drainPaymentInbox → processPaymentEvent → applyCapture / refund /
        denial on the intent (the trigger queues it) → operations pass → runFinanceIngestionPass

REFUND
  saga: cancellation authorised → executeRefund → refund_state completed, refund_id,
        refunded_amount_cents (the trigger queues the intent)
  webhook PAYMENT.CAPTURE.REFUNDED (saga or dashboard) → bolagio_payment_events
        → TRIGGER bolagio_payment_events_finance_enqueue → queue
  finance: outgoing payment keyed by the refund id, so a saga refund and its webhook are ONE row.
           Saga refund: plus a pro-rata negative revenue posting.
           Dashboard refund: cash only; whether the stay's revenue changes is a person's decision.

FINANCE INGESTION (runFinanceIngestionPass, in every reconcile pass and on "Run ingestion")
  1. bolagio_finance_enqueue_missing()  catch-up: an intent with a missing fact and no queue row
  2. bolagio_finance_claim_ingestion()  a bounded batch (FINANCE_INGESTION_BATCH, default 2), leased
  3. derive per intent: revenue (booking:<id>), capture (capture id), refund (refund id),
     refund events; each fact idempotent on its key, each independent of the others
  4. bolagio_finance_settle_ingestion() done, or failed with backoff and the error kept
  5. reconciliation, heartbeat

BEDS24 RESERVATION (Booking.com, Airbnb)
  Beds24 webhook → reservation upsert (real time); hourly /api/booking/reservations/sync (fallback)
        → bolagio_reservations: external id, unit, source + raw channel evidence, apiSourceId,
          channel reference, dates, status, guest contact, gross as supplied, provider timestamps
        Never a booking intent, never a ledger fact.

BOOKING.COM SETTLEMENT
  Extranet → Finance → statement CSV → /admin/finance/imports: upload (validated), then
        "Import valid rows" → bolagio_finance_ota_settlements (gross, commission, PSP fee, net, payout)
        + bolagio_finance_ota_payouts, matched to bolagio_reservations by channel_reference ONLY
        → revenue / commission / fee transactions (VAT on DE_REVIEW_REQUIRED until the adviser decides)
        → /admin/finance/booking-com
```

## 3. Existing data: the backfill

Applying migration 20260927 ends with `select bolagio_finance_enqueue_missing(true)`. That queues
every historical intent that has a revenue, capture, refund or refund-event fact missing from the
ledger. Intents already fully in the ledger are not queued. The reconcile schedule then drains the
queue, 2 intents per pass (every 3 minutes, about 40 per hour). The Free plan's per-invocation limit
is why (§4a); set `FINANCE_INGESTION_BATCH` on the Paid plan to go faster. To re-run the backfill, or to drain one batch immediately:

```bash
curl -X POST "$SITE/api/booking/finance/backfill" \
  -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" -H 'content-type: application/json' -d '{}'
```

The endpoint reports the pass and the remaining `queue_pending` / `ledger_gaps`. Every write is
idempotent on its key, so any number of re-runs posts nothing twice. It never writes a booking or
payment row. Booking.com statements are backfilled by importing them (§5, step 3).

## 4a. Staying inside a Worker invocation (Workers Free plan: 50 outbound requests)

Every scheduled or operator-triggered invocation this branch touches is bounded:

| Invocation | Bound | Measured / worst case |
|---|---|---|
| Hourly reservation sync | budget `RESERVATION_SYNC_SUBREQUEST_BUDGET`, default 40. Writes are batched (1 read + 1 upsert per window), there is one heartbeat per run, and the horizon is a rotation over (unit, 90-day window) tasks resumed from a cursor kept in the run's own heartbeat. Near-term windows are refreshed on every run. | 35 then 20 (16 reservations, 2 units); a full cycle completes in 2 runs |
| Reconcile pass (payments + operations + finance) | `FINANCE_INGESTION_BATCH`, default 2 bookings per pass | idle 14, 1 booking 23, 2 bookings 30 (5 would be 51) |
| "Import valid rows" | `FINANCE_IMPORT_SUBREQUEST_BUDGET`, default 40. Rows that do not fit stay `valid`, the batch stays `validated`, and the same button continues. | 3 settlement lines per click: 34 requests + session check and audit |
| Backfill endpoint / "Run ingestion" | the same finance batch | about 30 |

What the sync guarantees under the budget:

- **No silent gaps.** A window the budget interrupts is not marked done: it is the next run's first
  task. A failed window is counted (`tasksFailed`) and its unit named (`failedUnits`), and the run's
  heartbeat is `ok: false`. It is retried in the next cycle.
- **No blocked units.** Each window is its own task. A refused read or a refused write fails that
  task only.
- **One bad row never blocks its window.** The batch upsert falls back to row-by-row writes, and the
  bad row is reported as `failed`.
- **Idempotent, no duplicates.** The upsert is keyed on `(provider, external_booking_id)`, and rows
  are grouped by column shape so an absent provider value never erases a stored one.
- **Every configured unit, every window, every cycle.** `tasksRemaining` and `cycleComplete` are in the
  heartbeat.
- **The webhook path is unchanged.** Refreshing a single booking costs about 6 requests.
- **Less API pressure.** About 10 to 17 Beds24 reads per hour, instead of 22 or more attempted.
- **Operator re-imports.** An explicit `{from, to}` range the budget cuts short returns `resumeFrom`;
  call again with it as `from`. An explicit run never moves the scheduled cursor.

What still needs the Paid plan: nothing today. The only open risk is in the booking core, not in this
branch. Once direct booking is live, a reconcile pass that applies several PayPal captures in one
invocation (each with its Beds24 finalization) plus a finance batch could approach 50. Measure it
during the sandbox end-to-end run. If it does, either lower the reconcile route's `limit` or move to
Paid.

## 4. Seeing that it works (or does not)

The **Finance health** card (`/admin/finance` and `/admin/system`) and `GET /api/internal/health`
(`finance`) read one row from `bolagio_finance_pipeline_status`:

| Fact | Degraded when |
|---|---|
| ledger lag (bookings with a fact not yet in the ledger) | oldest waiting > 30 min |
| ingestion failures (with the latest error) | any |
| unprocessed payment events | oldest > 15 min |
| payment processor (last successful reconcile run) | > 15 min ago (never run: attention) |
| last verified PayPal webhook | informational |
| Beds24 reservation sync | last run failed, or > 3 h (attention) |
| refunds without a booking | any |
| imports not posted / settlements not posted | attention |
| ingestion pipeline | migration 20260927 missing |

When the card is degraded, the overview opens with a notice that the figures may be incomplete. A
file that was validated but never imported is a **high** item in the Finance Inbox.

## 5. What the owner still has to do

1. **Apply migration 20260927** to the Supabase project. It is shared with Cogniiq, and the migration
   touches only `bolagio_*` objects. Run in the SQL editor or with `psql`, in this order:
   `supabase/ops/preflight.sql` (read-only), then
   `supabase/migrations/20260927120000_finance_ingestion_pipeline.sql`, then
   `supabase/ops/verify.sql`. Rollback: `supabase/ops/rollback_20260927.sql`.
2. **Deploy this branch** to the staging worker. The code also works before the migration: it falls
   back to the bounded scan, and the health card says the pipeline is missing.
3. Wait for **two hourly reservation syncs**, or trigger the route twice. Check `/admin/system` →
   `reservation_sync`: `ok`, `cycleComplete: true` on the second run, `failedUnits` empty. Schulstraße
   II's reservations are then current again. If `failedUnits` names a unit, its Beds24 read itself is
   refused (the 403 of 2026-09-24): check that room's API permissions in Beds24.
4. **Import the two validated Booking.com statements**: `/admin/finance/imports` → each `validated`
   batch → **Import valid rows**. The 1-line file imports in one click. The 5-line file takes **two
   clicks** (3 lines, then 2); after the first click it is still `validated` and the Inbox still lists
   it. That creates 6 settlement lines and their revenue, commission and fee transactions. Nothing is
   written twice.
5. **Re-match reservations** on `/admin/finance/booking-com`. It matches by Booking.com number only.
   Two lines (6923362372, 6304329676) already have local reservations with identical gross. The other
   four (6190309761, 5437051687, 5914593565, 6374761800; stays Sep 7–21) have no local reservation
   today. They match only if the complete sync of step 3 imports them. If it does not, Beds24 is not
   returning them for the mapped rooms (another room or property, or a status it does not list):
   check those four bookings in Beds24. Unmatched lines still post; they only lack the unit allocation.
6. Check the figures (§4 and the pages listed in the implementation report).
