# Incident runbooks

For the person on call. Every one starts with **read the state**; nothing in
this system is inferred, so the state is the answer.

```sql
select * from bolagio_ops_attention order by severity, updated_at;
select * from bolagio_ops_queues where state in ('failed','exhausted');
select * from bolagio_scheduler_status;
```

For one booking:

```sql
select reference, status, payment_status, beds24_booking_id, payment_order_id,
       payment_capture_id, quoted_total_cents, paid_amount_cents, hold_expires_at,
       last_failure_code, last_failure_reason, reconciliation_state
from bolagio_booking_intents where reference = 'BLG-XXXXXX';
select from_status, to_status, reason, created_at from bolagio_booking_intent_events
where intent_id = (select id from bolagio_booking_intents where reference='BLG-XXXXXX') order by created_at;
select operation_type, outcome, resource_id, attempts, last_error, started_at from bolagio_external_operations
where intent_id = (select id from bolagio_booking_intents where reference='BLG-XXXXXX');
```

Authoritative sources: **PayPal** for money (dashboard → Activity, search the
reference in "custom id"), **Beds24** for the reservation (booking id on the
row), **Postgres** for our state. The admin's booking page shows all three
columns side by side and is the fastest read.

Three rules that hold in every runbook: never release a hold with any payment
evidence; never create a second Beds24 booking; never refund automatically.

---

## A. PayPal says paid, booking not confirmed

**Do not** tell the guest it is confirmed. **Do not** create a booking by hand.

1. `payment_status` on the row:
   * `paid` + `status in (paid, finalizing, paid_unfinalized, finalization_failed)` → runbook D.
   * `paid` + `confirmed` → it is confirmed; the message did not go. Check the outbox (runbook I).
   * `not_created` / `order_created` / `approved` → our system never saw the capture. Continue.
2. Was the event received? `select * from bolagio_payment_events where reference='BLG-XXXXXX' or order_id='<order>'`.
   * no row → runbook E.
   * `verification='failed'` → webhook id mismatch between the two secret stores (or a forgery). Fix the id; PayPal redelivers, or replay from the dashboard.
   * `status in ('failed','exhausted')` → read `last_error`, then run one pass.
3. Run one pass (admin → System → Run pass, or `POST /api/booking/reconcile`). Reconciliation reads the order from PayPal and applies the capture through the same validation as a webhook.
4. Amount or currency mismatch → the row is `manual_review` with `PAYMENT_*_MISMATCH`. Establish what the guest actually paid and why before anything else. Refund or confirm are both human decisions.

## B. Beds24 write outcome unknown

`bolagio_external_operations.outcome = 'outcome_unknown'` on a `create_hold`,
and the booking is `manual_review` with `BEDS24_HOLD_OUTCOME_UNKNOWN`.

**Do not** retry the create — the database refuses it anyway (SQLSTATE
`BLG01`). **Do not** release the local range.

1. Reconciliation searches Beds24 for our reference on that room and arrival date. If found it adopts the booking (`hold_created`) and resolves the operation.
2. Not found after a pass → open Beds24, filter the room by arrival date, look for `referer = BoLaGio Direct` and the reference in the booking's reference field.
   * exists → cancel it in Beds24 **or** adopt it: `select bolagio_complete_external_operation('beds24:create_hold:<intent uuid>','reconciled','<beds24 id>')` then reconcile again.
   * does not exist → `select bolagio_complete_external_operation('beds24:create_hold:<intent uuid>','failed',null,'verified absent in Beds24 by <name>')`, then move the booking: `bolagio_booking_transition(<id>,'manual_review','cancelled','manual: no Beds24 booking, verified by <name>')` — `manual_review → cancelled` is legal; it frees the local range.
3. The guest was told to wait, not retry. Tell them the outcome.

## C. release_failed

The local range is still reserved — correct. Nothing is oversold; at worst a
night is unsellable.

1. Beds24: is booking `beds24_booking_id` cancelled?
   * no → cancel it by hand, then reconcile. The saga re-checks the calendar and writes `released` only when the nights are open.
   * yes, nights still closed → something else holds them (often a Booking.com reservation). That is not a fault. Reconcile; it resolves when the calendar agrees.
   * yes, nights open, still stuck → `bolagio_booking_transition(<id>,'release_failed','released','manual: verified in Beds24 by <name>')`.

## D. paid_unfinalized / finalization_failed

The highest-priority state. **The hold is in place; the nights are safe.**
The guest has paid and has no confirmation.

1. Reconciliation retries `finalize` against the **same** Beds24 booking id every pass. Run one now.
2. Still failing → `last_failure_reason` names the expected and actual Beds24 status. The usual cause is `BEDS24_CONFIRMED_STATUS` not being a status this property accepts, or Beds24 being down (runbook F).
3. Fix the configuration and reconcile again.
4. Last resort: promote the booking by hand in Beds24, confirm it with your own eyes, then `bolagio_booking_transition(<id>,'finalization_failed','confirmed','manual: promoted in Beds24 by <name> <date>')`. This emits `booking.confirmed` and the guest gets their message.

Never refund because Beds24 failed. Never create a second booking.

## E. PayPal webhook outage

Symptoms: `bolagio_payment_events` receives nothing while PayPal shows
deliveries failing; or `WEBHOOK_BACKLOG` / `PAYMENT_EVENT_UNPROCESSABLE`.

* Deliveries failing at PayPal → check the Edge Function logs (`supabase functions logs paypal-webhook`) and its secrets (`PAYPAL_MODE`, `PAYPAL_WEBHOOK_ID`, `SUPABASE_SERVICE_ROLE_KEY`). PayPal retries for up to three days; once fixed, nothing is lost.
* Deliveries arriving, rows `pending` → reconciliation is not running (runbook H).
* Browser captures still work meanwhile; the lease check refuses to release while an order is `approved`, `capture_pending` or `unknown`, so no paid room is given away. Run a pass by hand: it reads uncertain orders from PayPal.

## F. Beds24 API outage

Deliberate degradation: quotes fail `provider_unavailable`; the calendar serves
from cache; no hold is half-created; finalizations and releases queue with
holds intact.

1. Confirm it is Beds24 (a `GET /inventory/rooms/calendar` from anywhere) and not the token (`ALERT INVENTORY_SYNC_FAILING` with a 401 in the run's error).
2. Watch `bolagio_ops_attention` grow; do nothing to the bookings.
3. Long outage → `DIRECT_BOOKING_ENABLED=false` so guests get the enquiry flow instead of a failing checkout. Keep the schedule running.
4. When it returns, one pass drains everything.

## G. Supabase outage

Everything fails closed: bookings cannot be created, captured, finalized or released; the admin refuses sign-in; webhooks get a 500 from the Edge Function and PayPal retries. `DATABASE_UNAVAILABLE` alert.

1. Supabase status page. Nothing to do in our system.
2. After recovery: one reconcile pass; check `bolagio_payment_events` for what PayPal redelivered; check `bolagio_external_operations` for `in_flight` rows older than a few minutes (a request that died mid-call) — treat as runbook B.

## H. Reconciliation backlog

`SCHEDULER_OVERDUE`, or `bolagio_ops_queues` shows many `pending`/`failed`
jobs with old `oldest`.

1. `select * from bolagio_scheduler_status;` — no recent `reconcile` row → the cron job is not firing. `select * from cron.job; select * from cron.job_run_details order by start_time desc limit 10;` (Supabase → Database → Cron).
2. Rows present but `ok=false` → `error` names the cause. Usually the secret (`401` in the run) or a timeout (`limit` too high).
3. Run passes by hand until the backlog drains: `limit` up to 100 per call.
4. Jobs `exhausted` → each needs a person: the reason code maps to a runbook above.

## I. Outbox dead letter

`OUTBOX_DEAD_LETTER`: an event failed eight deliveries. The booking is fine;
what the event triggers (a guest message, an invoice) did not happen.

1. `select event_type, reference, last_error from bolagio_outbox_events where status='exhausted';`
2. Fix the workflow (the error text is n8n's). Re-queue: `update bolagio_outbox_events set status='pending', attempts=0, available_at=now() where id='<id>';` — allowed, this table is not the booking's state.
3. If it was `booking.confirmed`, send the guest their confirmation by hand from `GET /api/internal/booking?ref=…` meanwhile.

## J. Inventory cache stale

`CACHE_STALE`: quotes still ask Beds24 live, so nothing is sold twice; the browse calendar may be wrong.

1. `bolagio_scheduler_status` for `inventory_sync`. Not running → runbook H's cron checks. Failing → its `error`.
2. Force one unit: `POST /api/booking/sync {"unitSlug":"schulstrasse-i"}` with the secret.
3. Never edit `bolagio_unit_inventory_days` by hand; the next sync overwrites it.

## K. Guest says paid, system shows unpaid

1. PayPal dashboard: search the reference (custom id). No transaction → the guest was not charged; the hold may have expired; tell them to book again.
2. Transaction exists → runbook A from step 2. Do **not** create an order or capture by hand.
3. Charged but the booking is `released`/`cancelled` (a capture landed after a release — the grace period makes this very unlikely) → `manual_review` with `PAYMENT_AFTER_TERMINAL_STATE`. A person decides: re-book the guest by hand in Beds24, or refund in the PayPal dashboard. Never both automatically.

## L. Duplicated booking attempt

Expected and handled: the idempotency key returns the first attempt; the exclusion constraint refuses an overlapping lock; the deterministic `PayPal-Request-Id` returns the first order; a repeated capture is `duplicate`.

What needs a person: a **different** capture id on a booking that has one (`PAYMENT_DUPLICATE_CAPTURE`, `manual_review`) — two real payments. Refund the second in the PayPal dashboard after checking both, then `bolagio_booking_transition(<id>,'manual_review','confirmed',…)` only if the Beds24 booking is verified confirmed.

---

## Escalate rather than act

An amount or currency mismatch; two captures on one booking; a PayPal capture whose `custom_id` matches no booking; a Beds24 booking marked `BoLaGio Direct` that no intent claims; anything in `manual_review` you cannot explain from the event log. All involve money and none has a safe automatic answer.
