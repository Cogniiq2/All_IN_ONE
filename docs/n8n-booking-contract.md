# The n8n contract

**This document is the specification. If n8n and this document disagree, n8n is
wrong.** It is written so the workflows can be built in parallel with the
backend, against a fixed surface.

Everything here is implemented and unit-tested. Nothing here has been exercised
against a real n8n instance.

---

## 1. What n8n is, and is not, allowed to do

n8n is automation **outside** the transactional core.

| n8n does | n8n cannot do |
|---|---|
| claim durable events | mark a booking paid |
| acknowledge one it handled | mark a booking confirmed |
| report one it could not handle | cancel a booking |
| read booking context for a message or invoice | release inventory |
| send guest communication, invoices, alerts | change an amount |
| | move a booking to **any** state |

This is not a policy that someone could work around. There is no endpoint for
the right-hand column, and the database refuses a status change made anywhere
but `bolagio_booking_transition()` — a `BEFORE UPDATE` trigger raises on a
direct write, even with the service role key.

The reason is not distrust of n8n. A workflow engine is an excellent place to
write a "your booking is confirmed" email and a terrible place to *decide*
whether a booking is confirmed: the failure modes are an unsent email versus a
guest told they have a room they do not have.

---

## 2. Authentication

HMAC-SHA256 over the timestamp and the raw body, with a replay window.

Not a bearer token, deliberately. A bearer secret is a replayable password, and
anything that ever observes one request — a proxy log, an n8n execution
history, a screenshot in a support ticket — can repeat it forever. For an API
that *acknowledges* events, a replayed acknowledgement loses an event.

### 2.1 The algorithm

```
canonical = "v1:" + timestamp + ":" + rawBody
signature = hex( HMAC-SHA256( N8N_INTERNAL_SECRET, canonical ) )
```

* `timestamp` — UNIX **seconds**, decimal, no milliseconds.
* `rawBody` — the exact bytes being sent. For a `GET`, the **empty string**.

Headers:

```
x-bolagio-timestamp: 1789123456
x-bolagio-signature: v1=<64 hex characters>
content-type: application/json
```

### 2.2 Worked example — verify your implementation against this

```
secret     = test-secret
timestamp  = 1789123456
body       = {"action":"claim"}
canonical  = v1:1789123456:{"action":"claim"}

signature  = bebf91c99dadd3d299ea3c9a0e4a053be9573e9476a0b8b5565a35b2206a5063
header     = x-bolagio-signature: v1=bebf91c99dadd3d299ea3c9a0e4a053be9573e9476a0b8b5565a35b2206a5063
```

Check it on a shell before writing any workflow:

```bash
printf 'v1:1789123456:{"action":"claim"}' | openssl dgst -sha256 -hmac 'test-secret' -hex
```

### 2.3 In n8n

A **Code** node before the HTTP Request node:

```javascript
const crypto = require('crypto');

// The body as a STRING, built once and used for both the signature and the
// request. Signing one string and sending another is the single most common
// way to get this wrong.
const body = JSON.stringify({ action: 'claim', worker: 'n8n-main', limit: 20 });
const timestamp = Math.floor(Date.now() / 1000).toString();

const signature = crypto
  .createHmac('sha256', $env.N8N_INTERNAL_SECRET)
  .update(`v1:${timestamp}:${body}`)
  .digest('hex');

return [{ json: { body, timestamp, signature: `v1=${signature}` } }];
```

Then in the HTTP Request node set **Body Content Type: Raw/Custom**, body
`{{ $json.body }}`, and the two headers from `$json`.

> **The mistake to avoid.** If you let n8n serialise a JSON body for you, the
> bytes it sends may differ from the bytes you signed — key order and
> whitespace both matter. `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same
> object and different signatures. Build the string once. Send that string.

### 2.4 Rejections

A bad signature is `401` with **no body**. You learn nothing from it: not the
reason, not whether the event exists, not whether the secret is configured.
The reason is in the BoLaGio logs under `event: "n8n.request"`.

| Cause | What to check |
|---|---|
| `not_configured` | `N8N_INTERNAL_SECRET` is unset on the BoLaGio side |
| `missing_headers` | one of the two headers is absent |
| `bad_timestamp` | not UNIX seconds (an ISO date is the usual mistake) |
| `expired` | outside ±`N8N_REPLAY_WINDOW_SECONDS` (default 300). Check the n8n host clock |
| `bad_signature` | wrong secret, or the body was re-serialised after signing |

---

## 3. The outbox endpoint

```
POST https://<site>/api/internal/outbox
```

One route, three actions, because n8n's HTTP node is easier to configure once
with a varying body than three times with varying paths — and it means one
signature implementation.

### 3.1 Claim

```json
{ "action": "claim", "worker": "n8n-main", "limit": 20 }
```

```json
{
  "events": [
    {
      "id": "8f3c1e2a-....",
      "type": "booking.confirmed",
      "version": 1,
      "reference": "BLG-7K2M9Q",
      "occurredAt": "2026-09-17T10:04:11.221Z",
      "attempt": 1,
      "payload": { "reference": "BLG-7K2M9Q", "unitSlug": "schulstrasse-i", "...": "..." }
    }
  ]
}
```

A claim is a **lease**, not a removal. It is held for five minutes; a worker
that dies mid-batch leaves rows whose lease passes, and the next claim picks
them up. Nothing is lost by a crash.

**Your workflows must be idempotent.** At-least-once delivery is the guarantee;
exactly-once is not available across a network. `attempt` is surfaced so you
can behave differently on a retry — post an internal warning on attempt 5
rather than sending a fifth identical email.

`FOR UPDATE SKIP LOCKED` in the database means two n8n workers claiming
simultaneously get **disjoint** sets. Running more than one is safe.

### 3.2 Acknowledge

```json
{ "action": "ack", "worker": "n8n-main", "eventId": "8f3c1e2a-...." }
```

```json
{ "acknowledged": true }
```

`false` means this worker does not hold the claim — usually because the lease
expired and another worker took it. Do not retry; the other worker has it.

### 3.3 Fail

```json
{ "action": "fail", "worker": "n8n-main", "eventId": "8f3c1e2a-....", "error": "SMTP 550" }
```

Retried with exponential backoff, dead-lettered after **eight** attempts. A
dead-lettered event is not deleted — it stays visible in `bolagio_ops_queues`,
because an event nobody consumed is an operational fact.

Call this rather than letting the lease lapse silently: the error text is what
an operator reads at 07:00.

---

## 4. Booking context

```
GET https://<site>/api/internal/booking?ref=BLG-7K2M9Q
```

Signed the same way, over the **empty string**.

```json
{
  "reference": "BLG-7K2M9Q",
  "status": "confirmed",
  "paymentStatus": "paid",
  "unitSlug": "schulstrasse-i",
  "checkIn": "2026-10-20",
  "checkOut": "2026-10-23",
  "nights": 3,
  "adults": 2,
  "children": 0,
  "currency": "EUR",
  "totalCents": 42500,
  "paidAmountCents": 42500,
  "confirmedAt": "2026-09-17T10:04:09.882Z",
  "guest": {
    "firstName": "Ada", "lastName": "Lovelace",
    "email": "ada@example.com", "phone": "+49 ...", "locale": "de"
  }
}
```

**Why guest details are here and not in the event.** An outbox payload sits in
a queue table, travels through an n8n execution history, and appears in
whatever logs that platform keeps — none of which is a good home for a guest's
name, email and phone under the DSGVO. So the PII is fetched once, per booking,
by the workflow that actually needs it.

Deliberately absent: the internal uuid, the Beds24 booking id, the PayPal order
and capture ids, the idempotency key. A messaging workflow has no use for any
of them, and a Beds24 booking id in an n8n variable is one badly-written HTTP
node away from a cancelled reservation.

---

## 5. Event types

Every event: `{ id, type, version, reference, occurredAt, attempt, payload }`.
Payloads carry **references and operational facts only**.

`version` is the payload schema version. **Refuse a version you do not know**
rather than reading it optimistically — an IF node on `version === 1` is two
minutes of work and prevents a silent mis-read later.

### Implemented and emitted today

| Type | When | Payload | What n8n should do |
|---|---|---|---|
| `booking.held` | inventory blocked at Beds24, before payment | `reference, unitSlug, checkIn, checkOut, holdExpiresAt` | usually nothing; useful for internal visibility |
| `payment.order_created` | a PayPal order exists | `reference, amountCents, currency` | nothing |
| `payment.completed` | a **verified** capture, amount and currency matched | `reference, amountCents, currency` | internal notification at most — **not** the guest confirmation |
| `booking.confirmed` | Beds24 updated **and read back verified** | `reference, unitSlug, checkIn, checkOut, amountCents, currency` | **the guest confirmation email.** This is the only event that means a guest has a reservation |
| `booking.cancelled` | a hold was released and **verified** released | `reference, reason, unitSlug` | internal; a guest message only if the reason warrants one |
| `booking.expired` | a lease ran out with no payment evidence | `reference, unitSlug` | optional: a gentle "your dates are free again" |
| `payment.failed` | the provider denied the capture | `reference, reason` | optional guest nudge. **Never** say the booking is cancelled |
| `payment.refunded` | a refund event arrived | `reference, amountCents, currency, partial` | internal alert. Do not act on the booking |
| `booking.paid_unfinalized` | **paid, and Beds24 not updated** | `reference, code, amountCents, currency` | **urgent internal alert.** Never a guest message |
| `booking.release_failed` | a hold could not be verifiably released | `reference, code` | internal alert |
| `booking.manual_review_required` | a human must decide | `reference, code` | **urgent internal alert** with the code |

### The two that matter most

**`booking.confirmed` is the guest confirmation trigger. Nothing else is.**
Not `payment.completed` — money arriving and a channel manager accepting a
reservation are different facts, and there is a real state between them.

**`booking.paid_unfinalized` means a guest has paid and Beds24 does not have
the reservation.** Alert a person immediately, by whatever channel actually
wakes someone up. Do not email the guest — the system is already retrying
against the same Beds24 booking id, and it usually succeeds within minutes.

### Emitted by the operations pass (2026-09-20)

| Type | When | Payload |
|---|---|---|
| `cleaning.required` | a turnover is created for a confirmed departure | `reference, unitSlug, departure, nextArrival, sameDay` |
| `guest.prearrival_ready` | check-in ≤ 3 days away, once | `reference, unitSlug, checkIn, checkOut, daysUntilArrival` |
| `guest.checkin_ready` | check-in day (property calendar), once | `reference, unitSlug, checkIn, checkOut` |
| `review.requested` | 1 day after check-out, within 14 days, once | `reference, unitSlug, checkIn, checkOut` |

Only for **confirmed** stays; each at most once per booking; a stay that
leaves `confirmed` first never gets them. Timing and the rules:
`docs/guest-operations.md`. The booking context now carries `houseRules`
(`timezone`, `checkInTime`, `checkOutTime`).

---

## 4a. Health

```
GET https://<site>/api/internal/health
```

Signed the same way, over the empty string. Returns the alert list
(`CRITICAL` / `HIGH` / `MEDIUM`), `counts`, scheduler heartbeats with their
age, queue counts and configuration findings. Poll every 5 minutes; page a
person on `counts.CRITICAL > 0`; warn on `HIGH`. No guest data, no secret.

## 6. Workflows to build

Roughly in the order they earn their keep.

1. **Event pump** — Schedule (60s) → claim → Switch on `type` → ack or fail.
   Everything else hangs off this. One pump, not one per event type.
2. **Guest confirmation** — on `booking.confirmed`, fetch context, send the
   email in `guest.locale`. Ack only after the send succeeds.
3. **Operational alerts** — on `booking.paid_unfinalized`,
   `booking.manual_review_required`, `booking.release_failed`: message a person.
   Include `reference` and `code`.
4. **Health** — Schedule (5 min) → `GET /api/internal/health` → alert on
   `counts.CRITICAL`, warn on `counts.HIGH`. This is what tells you the pump,
   the scheduler or a payment has stopped.
5. **Invoice** — on `booking.confirmed`, fetch context, generate, store, send.
6. **Pre-arrival / check-in** — scheduled off `checkIn`, not event-driven.
7. **Review request** — scheduled off `checkOut`.

### The reconciliation trigger (optional but recommended)

```
POST https://<site>/api/booking/reconcile
x-bolagio-signature: <BOOKING_SYNC_SECRET>
{ "limit": 25 }
```

Every 2–5 minutes. This is a **plain shared secret**, not the HMAC — it is a
trigger that takes no data and carries no authority.

This does not have to be n8n. Supabase Cron or a Cloudflare Cron Trigger work
equally well, and the system is designed so that **none of the three is
required**: it must recover without n8n being healthy. Pick one.

---

## 7. What n8n must never do

* **Never write to `bolagio_*` tables directly.** Use these endpoints. Direct
  Postgres access from n8n bypasses every guarantee in
  `docs/booking-state-machine.md`, and the trigger will raise anyway.
* **Never call Beds24.** If a workflow needs something changed at the channel
  manager, that is a gap in the backend — raise it rather than routing around.
* **Never call PayPal.** Payment authority is the backend's, entirely.
* **Never tell a guest a booking is confirmed** on anything but
  `booking.confirmed`.
* **Never treat `payment.completed` as a confirmed stay.**
* **Never retry an event by re-claiming it.** Use `fail`, which schedules the
  retry with backoff and a dead-letter threshold.
