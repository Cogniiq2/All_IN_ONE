# Booking runbook

For the person on call. Every procedure starts with **read the state**, because
in this system the state is recorded rather than inferred.

```sql
select * from bolagio_ops_attention order by severity, updated_at;
select * from bolagio_ops_queues where state in ('failed','exhausted');
```

For one booking:

```sql
select reference, status, payment_status, beds24_booking_id, payment_order_id,
       payment_capture_id, quoted_total_cents, paid_amount_cents,
       last_failure_code, last_failure_reason, reconciliation_state
from bolagio_booking_intents where reference = 'BLG-XXXXXX';

select from_status, to_status, reason, created_at
from bolagio_booking_intent_events
where intent_id = (select id from bolagio_booking_intents where reference='BLG-XXXXXX')
order by created_at;

select operation_type, outcome, resource_id, last_error, started_at
from bolagio_external_operations
where intent_id = (select id from bolagio_booking_intents where reference='BLG-XXXXXX');
```

The second query is the one that answers "why is it like this". It is an
append-only log written in the same transaction as each change, so it cannot
disagree with the row.

---

## Three rules

1. **Never release a hold for a booking with any payment evidence.** If in
   doubt, leave it held. An unsold night costs one night; a resold night costs
   a guest their holiday and the business its reputation.
2. **Never create a second Beds24 booking.** If one may exist, find it.
3. **Never refund automatically.** A refund is a business decision.

---

## "I paid but I have no confirmation"

```sql
select status, payment_status, beds24_booking_id, confirmed_at
from bolagio_booking_intents where reference = 'BLG-XXXXXX';
```

| `payment_status` | `status` | What is true | Do |
|---|---|---|---|
| `paid` | `confirmed` | it worked; the email did not send | check the outbox (below) |
| `paid` | `paid_unfinalized` / `finalization_failed` | **money ours, Beds24 not updated** | see next section |
| `paid` | `finalizing` | in progress right now | wait one cycle |
| `capture_pending` | anything | PayPal has not settled it | tell the guest it is processing. **Do not confirm** |
| `not_created` / `order_created` | anything | **no payment reached us** | check PayPal by the reference in `custom_id` |
| `unknown` | anything | we do not know | check PayPal directly. Do not release |

Outbox check:

```sql
select event_type, status, attempts, last_error, created_at
from bolagio_outbox_events where reference = 'BLG-XXXXXX' order by created_at;
```

A `booking.confirmed` row that is `pending` with a growing `attempts` means the
n8n pump is down or the email is failing. The booking is fine.

---

## "PayPal says paid, Supabase does not"

1. Was the event received?
   ```sql
   select provider_event_id, event_type, verification, status, last_error
   from bolagio_payment_events where reference = 'BLG-XXXXXX';
   ```
2. **No row** → the webhook never arrived. Check the PayPal dashboard's
   delivery log. Usually: wrong URL, or `PAYPAL_WEBHOOK_ID` mismatched between
   the two secret stores.
3. **`verification = 'failed'`** → the signature did not verify. Almost always
   a webhook-id mismatch, not an attack. Fix the config; PayPal will redeliver,
   or replay from the dashboard.
4. **`status = 'failed'` / `'exhausted'`** → received and processing failed.
   Read `last_error`.
5. **Row looks fine but the booking did not move** → run reconciliation:
   ```bash
   curl -XPOST https://<site>/api/booking/reconcile \
     -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" -d '{"limit":50}'
   ```
   It reads the order from PayPal and applies the capture through the same
   validation as a webhook.

If the amount does not match, the booking is already in `manual_review` with
`PAYMENT_AMOUNT_MISMATCH`. **Do not confirm it.** Establish what the guest
actually paid and why it differs before anything else.

---

## "Supabase says paid, Beds24 finalization failed"

**The highest-priority state. The hold is still in place, so the guest's nights
are safe.** Nothing is oversold while this is open.

1. Confirm: `status in ('paid_unfinalized','finalization_failed')`.
2. Look at Beds24 for `beds24_booking_id`. It should exist and be `new`.
3. Run reconciliation. It retries against the **same** booking id.
4. Still failing → find out why. The usual cause is
   `BEDS24_CONFIRMED_STATUS` not being a status this property accepts:
   ```sql
   select last_failure_reason from bolagio_booking_intents where reference='BLG-XXXXXX';
   ```
   The message names the expected and actual status.
5. Fix `BEDS24_CONFIRMED_STATUS`, redeploy, reconcile again.
6. Last resort: promote the booking **by hand in Beds24**, then
   ```sql
   select bolagio_booking_transition(
     (select id from bolagio_booking_intents where reference='BLG-XXXXXX'),
     'finalization_failed'::bolagio_booking_status,
     'confirmed'::bolagio_booking_status,
     'manual: promoted in Beds24 by <name> <date>');
   ```
   Only after seeing it correct in Beds24 with your own eyes.

**Never** create a second Beds24 booking. **Never** refund because a Beds24
call failed.

---

## "A hold cannot be released"

`status = 'release_failed'` — **the local range is still reserved**, which is
correct. Nothing is oversold; at worst a night is unsellable.

1. Look at `beds24_booking_id` in Beds24.
2. Already cancelled there → the nights may not have reopened. Check the Beds24
   calendar. Often something else took them (a Booking.com reservation), which
   is a perfectly ordinary reason and not a fault.
3. Still active there → cancel it by hand, then reconcile. The saga re-checks
   and only writes `released` once the nights are provably open.
4. Genuinely free but stuck:
   ```sql
   select bolagio_booking_transition(
     (select id from bolagio_booking_intents where reference='BLG-XXXXXX'),
     'release_failed'::bolagio_booking_status,
     'released'::bolagio_booking_status,
     'manual: verified released in Beds24 by <name> <date>');
   ```

---

## "Beds24 is down"

Mostly automatic, and the degradation is deliberate:

* **Quotes fail** with `provider_unavailable`. Guests are told live
  availability is temporarily unavailable — never "no nights free", which is a
  different fact.
* **The calendar keeps working** from cache, marked as cached.
* **Holds are not created.** Nothing is half-created.
* **Finalizations queue up.** Paid bookings sit in `paid_unfinalized` with
  their holds intact and finalize when Beds24 returns.
* **Releases queue up.** Local ranges stay reserved.

Your job: confirm it is Beds24 and not us, watch `bolagio_ops_attention` grow,
and let reconciliation drain it. If the outage is long, consider
`DIRECT_BOOKING_ENABLED=false` so guests get an honest enquiry flow instead of
a failing checkout.

---

## "The PayPal webhook is delayed"

Not an incident by itself. The browser-triggered capture usually gets there
first, and the webhook is the backstop.

It matters when a guest closed the tab mid-payment: the hold runs on its lease,
and the lease check **refuses to release** while an order is `approved`,
`capture_pending` or `unknown`. The room is not given away.

Check the PayPal delivery log. If deliveries are failing rather than slow, see
"PayPal says paid".

---

## "n8n is offline"

**Nothing is lost.** Events accumulate in `bolagio_outbox_events` and drain
when it returns.

```sql
select event_type, count(*), min(created_at)
from bolagio_outbox_events where processed_at is null group by 1;
```

What actually stops: guest emails, invoices, alerts. Bookings continue to be
taken, paid, finalized and confirmed — **unless** n8n is also your
reconciliation trigger, in which case recovery has stopped too. That is the
argument for Supabase Cron instead.

Down for more than a few hours → tell affected guests manually. The context
they need is in `bolagio_ops_attention` plus
`GET /api/internal/booking?ref=...`.

---

## "A duplicate event arrived"

Expected, and handled. PayPal delivers up to nine times.

* duplicate webhook → refused by `unique (provider, provider_event_id)`,
  recorded as `duplicate: true`;
* duplicate capture → `bolagio_record_payment_capture` returns `duplicate`;
* duplicate outbox delivery → possible after a worker crash; n8n workflows are
  required to be idempotent.

A **different** capture on a booking that already has one is not a duplicate —
it is two real payments, it goes to `manual_review` as
`PAYMENT_DUPLICATE_CAPTURE`, and it needs a person.

---

## "Inventory looks wrong"

1. Is it a cache problem? `bolagio_unit_inventory_days.synced_at`. Force a
   sync:
   ```bash
   curl -XPOST https://<site>/api/booking/sync \
     -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" -d '{"unitSlug":"schulstrasse-i"}'
   ```
2. Do we reserve a range Beds24 does not?
   ```sql
   select reference, status, check_in, check_out from bolagio_booking_intents
   where bolagio_status_reserves(status) and unit_id = '<uuid>';
   ```
   A stuck `manual_review` or `release_failed` blocks nights. That is by
   design; resolve the booking rather than forcing the range free.
3. Does Beds24 hold a booking we know nothing about? An **orphan hold** —
   usually the tail of an uncertain create. Match by arrival date and
   `referer = 'BoLaGio Direct'`, then cancel it in Beds24 by hand.
4. Never edit `bolagio_unit_inventory_days` by hand. It is a cache; the next
   sync overwrites it.

---

## Escalate rather than act

* an amount or currency mismatch;
* two captures on one booking;
* a PayPal capture whose `custom_id` matches no booking;
* a Beds24 booking marked `BoLaGio Direct` that no intent claims;
* anything in `manual_review` you cannot explain from the event log.

All of these involve money and none has a safe automatic answer.
