# BoLaGio n8n — test mode

How to run the entire package against **staging** without a single message,
alert or work item leaving n8n, and what to assert in the backend to prove
the exactly-once behaviour before any transport is switched on.

## 1. The two safe transport settings

| Setting | Guest Message does | Ledger row (`bolagio_message_deliveries`) after the run |
|---|---|---|
| `BOLAGIO_MESSAGING_TRANSPORT` unset or `disabled` | claims the slot, sends nothing, completes as **skipped** | `status='skipped'`, `provider='disabled'` |
| `BOLAGIO_MESSAGING_TRANSPORT=test` | claims the slot, sends nothing, completes as **sent** with a synthetic id | `status='sent'`, `provider='test'`, `provider_message_id='test-<deliveryId>'` |

Both are final for that `(reference, kind, sequence)`. A later `prepare`
returns `already_sent`, which is exactly what makes a re-run harmless — and
also why **`disabled` on a real booking consumes its confirmation**: turning
`smtp` on afterwards does not send the message that was skipped. That needs
an operator resend (a new row with `sequence` 2), never a hand edit. On
staging this is fine; on production, see the production runbook for the
order in which the transport is enabled relative to the first real booking.

`BOLAGIO_ALERT_TRANSPORT` and `BOLAGIO_CLEANING_TRANSPORT` have no `test`
value: `disabled` completes the flow with `ok:true` and nothing is sent.
`webhook` on staging may point at a staging channel / sandbox endpoint —
that is a real send to a place that is allowed to receive it, not test mode.

The backend refuses `provider: 'test'` on production. Never set
`BOLAGIO_MESSAGING_TRANSPORT=test` against a production `BOLAGIO_SITE_URL`;
the delivery would stay `sending` until its lease lapses and the event would
dead-letter after eight attempts.

## 2. Setup

1. n8n env (see `credentials-matrix.md`):
   `BOLAGIO_SITE_URL=<staging worker URL>`,
   `BOLAGIO_N8N_INTERNAL_SECRET=<staging N8N_INTERNAL_SECRET>`,
   `BOLAGIO_ENVIRONMENT=staging`,
   `BOLAGIO_MESSAGING_TRANSPORT=test` (or unset),
   `BOLAGIO_ALERT_TRANSPORT` unset, `BOLAGIO_CLEANING_TRANSPORT` unset.
   Restart n8n.
2. Import the package (`README.md` §4a). Do **not** activate anything yet.
3. Prove the signature from a shell before touching n8n, using the same
   secret (replace the placeholders; nothing here is a real value):

   ```bash
   SITE='https://<staging worker>'; SECRET='<staging N8N_INTERNAL_SECRET>'
   TS=$(date +%s); SIG=$(printf 'v1:%s:' "$TS" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
   curl -sS -o /dev/null -w '%{http_code}\n' "$SITE/api/internal/health" \
     -H "x-bolagio-timestamp: $TS" -H "x-bolagio-signature: v1=$SIG"
   ```

   Expect `200`. A `401` means the secret pair or the clock; fix that first.

## 3. Running

1. Open **BoLaGio · Health Poll** → *Test workflow*. The Code node must
   produce either no items (nothing to alert) or one alert item; the
   Operational Alert sub-workflow returns `ok:true, outcome:'skipped'`.
   Remember that static data is empty in a manual run.
2. Create a staging booking that reaches `booking.confirmed` (the PayPal
   sandbox E2E, `docs/paypal-sandbox-e2e.md`, produces one), or requeue an
   already-acked `booking.confirmed` event from BoLaGio Control
   (*Operations → queue → requeue*).
3. Open **BoLaGio · Outbox Event Pump** → *Test workflow*. Watch the
   execution: *Claim events* returns N items, the loop runs N times, each
   iteration ends in *Settle event* with `settled:'ack'` (or `'fail'` with a
   readable error).
4. Run the pump a **second** time immediately. Expect *Claim events* to
   return zero items (everything was acked), or, for events that failed,
   the same ids with `attempt` incremented after their backoff.
5. Requeue the same `booking.confirmed` event and run the pump again. The
   Guest Message sub-workflow must return `outcome:'already_sent', ok:true,
   sent:false`, and the event is acked.
6. Activate the pump and the health poll, leave them for 15 minutes, then
   deactivate and assert (§4).

## 4. What to assert in the backend (staging database)

```sql
-- One delivery per (booking, kind); provider reflects the transport used.
select reference, kind, sequence, status, provider, provider_message_id, attempts, outbox_event_id
from bolagio_message_deliveries
order by reference, kind, sequence;
```

Expect, per confirmed test booking: exactly **one** row with
`kind='booking_confirmation'`, `sequence=1`, `status` `sent` (transport
`test`, `provider='test'`, `provider_message_id='test-'||id`) or `skipped`
(`provider='disabled'`); `attempts=1`. Running the pump again, re-sending
the event, or running two pumps at once must not add a row or change this
one. **No row** may have `provider='smtp'` while the transport is not `smtp`.

```sql
-- No duplicates, ever.
select reference, kind, count(*) from bolagio_message_deliveries
group by reference, kind having count(*) > 1;            -- expect zero rows
```

```sql
-- Outbox: every routed event acked exactly once; unsupported ones failing visibly.
select event_type, status, attempts, claimed_by, last_error, count(*)
from bolagio_outbox_events
group by 1,2,3,4,5 order by 1,2;
```

Expect `claimed_by='n8n-bolagio'` on everything the pump touched, the
routed types `succeeded` (`processed_at` set), and — if you deliberately
inserted an unknown type or an `event_version` of 2 — a row cycling
`claimed` → `failed` with `last_error='unsupported type/version'`,
`attempts` climbing and `available_at` in the future (the backoff), which
becomes `exhausted` after eight attempts. No `succeeded` row carries an
error text. `bolagio_ops_queues`
(BoLaGio Control → System) shows the same counts without the join.

```sql
-- Scheduler heartbeats are unaffected by n8n; the health poll only reads.
select * from bolagio_scheduler_status;
```

In the n8n UI: every execution of the pump is green; the Error Handler has
**no** executions (or, if it does, each names a real cause); no execution's
data shows a guest name or address outside the *Prepare message → send*
edge of the Guest Message sub-workflow.

## 5. Leaving test mode

Test mode is left one transport at a time, per the runbooks. Before
switching `BOLAGIO_MESSAGING_TRANSPORT` to `smtp` on staging, point the
staging booking's guest e-mail at a mailbox you own; the message the backend
renders will really be sent.
