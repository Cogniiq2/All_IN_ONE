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

**A second finding, on the Cloudflare Workers plan.** Every hourly reservation sync ends with
`failed: 1` and writes no `reservation_sync` heartbeat (the last one is from 2026-09-24). The Supabase
API log for one run shows 38 PostgREST calls: 11 GET and 11 PATCH for reservations, 15 heartbeat
writes and 1 units read. Add 14 Beds24 requests plus the token request, and one Worker request makes
about 53 outbound fetches, over the **50-subrequest limit of the Workers Free plan**. The last Beds24
window fails and the heartbeat RPC is refused. This change removes the repeated heartbeat writes (one
`last_success` per minute per provider, which brings the sync to about 40), but each new reservation
adds 2 more. The **Workers Paid plan (1,000 subrequests)** is the real fix and a production
prerequisite. The 5-row Booking.com import (about 8 calls per row) is at the same limit on the Free
plan.

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
  2. bolagio_finance_claim_ingestion()  a bounded batch (FINANCE_INGESTION_BATCH, default 5), leased
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
queue, 5 intents per pass (every 3 minutes, about 100 per hour). Set `FINANCE_INGESTION_BATCH` on the
paid plan to go faster. To re-run the backfill, or to drain one batch immediately:

```bash
curl -X POST "$SITE/api/booking/finance/backfill" \
  -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" -H 'content-type: application/json' -d '{"limit":25}'
```

The endpoint reports the pass and the remaining `queue_pending` / `ledger_gaps`. Every write is
idempotent on its key, so any number of re-runs posts nothing twice. It never writes a booking or
payment row. Booking.com statements are backfilled by importing them (§5, step 3).

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

1. **Apply migration 20260927** to the Supabase project (it is shared with Cogniiq; the migration
   touches only `bolagio_*` objects). Run the SQL editor or `psql` in this order:
   `supabase/ops/preflight.sql` (read-only), then
   `supabase/migrations/20260927120000_finance_ingestion_pipeline.sql`, then
   `supabase/ops/verify.sql`. Rollback: `supabase/ops/rollback_20260927.sql`.
2. **Deploy this branch** to the staging worker (`npm run cf:deploy -- --env staging`, or the usual
   pipeline). The code works before the migration too: it falls back to the bounded scan and the
   health card says the pipeline is missing.
3. **Import the two validated Booking.com statements**: `/admin/finance/imports` → each
   `validated` batch → **Import valid rows**. That creates 6 settlement lines and their
   revenue, commission and fee transactions. On the Workers Free plan the 5-row file may exceed the
   subrequest limit; if it errors, upgrade first (step 4) and repeat. The import is idempotent.
4. **Upgrade Cloudflare Workers to the Paid plan** (see §1): the reservation sync is failing its
   last window every hour now.
5. After the upgrade, check the matches: 2 of the 6 statement lines (6923362372, 6304329676) have a
   local reservation with an identical gross. The other 4 (6190309761, 5437051687, 5914593565,
   6374761800; stays from Sep 7 to 21) have none in `bolagio_reservations` today, although they fall
   inside the sync window. The failing unit in the hourly sync (§1) is the likely reason, but this
   is not confirmed. Once a sync run completes without `failed`, choose **Re-match reservations** on
   `/admin/finance/booking-com`. Unmatched lines still post; they only lack the unit allocation.
