# PayPal

**Status: implemented, sandbox-only by default, and never exercised against a
real PayPal account — not even a sandbox one.** Everything below the
configuration section is modelled from the published Orders v2 and Webhooks v1
references. §7 is the list of things a sandbox run has to confirm.

---

## 1. Fail closed

`PAYPAL_MODE` must be **exactly** `sandbox` or `live`. Anything else — unset,
empty, `production`, a trailing space — and no payment is taken at all: the
adapter refuses before touching the network, and
`GET /api/booking/payment/config` serves no client id so the SDK never loads.

There is deliberately **no default**. `sandbox` would be safe for money and
unsafe for truth: a production deployment that lost this value would take
play-money payments, tell guests they had paid, and hold real inventory against
them. `live` is obviously worse.

The API base URL is **derived** from the mode and is not configurable. A
settable base URL is one environment typo away from presenting sandbox
credentials to the live API.

```
sandbox → https://api-m.sandbox.paypal.com
live    → https://api-m.paypal.com
```

Asserted in `tests/paypal-adapter.test.ts`.

---

## 2. Configuration

| Variable | Where | Notes |
|---|---|---|
| `PAYPAL_MODE` | Cloudflare **and** Supabase | `sandbox` \| `live` |
| `PAYPAL_CLIENT_ID` | Cloudflare **and** Supabase | public; served to the browser |
| `PAYPAL_CLIENT_SECRET` | Cloudflare **and** Supabase | server only, always |
| `PAYPAL_WEBHOOK_ID` | Cloudflare **and** Supabase | required; binds a delivery to our webhook |

**Two secret stores.** The Next.js routes read Cloudflare Worker secrets; the
Edge Function reads Supabase function secrets. Setting a value in one does not
set it in the other, and a mode mismatch between them is the failure to watch
for — the website creating live orders while the Edge Function verifies against
sandbox, or the reverse.

```bash
npx wrangler secret put PAYPAL_CLIENT_SECRET
supabase secrets set PAYPAL_CLIENT_SECRET=... PAYPAL_MODE=sandbox \
  PAYPAL_CLIENT_ID=... PAYPAL_WEBHOOK_ID=...
```

---

## 3. The flow

```
browser                      BoLaGio                        PayPal
   │  GET payment/config        │                              │
   │◄───── clientId, mode ──────│                              │
   │  SDK loads                 │                              │
   │  press Pay                 │                              │
   │  POST payment/order ──────►│  read total from the ROW     │
   │                            │  POST /v2/checkout/orders ──►│
   │◄───── orderId ─────────────│◄──────── order ──────────────│
   │  guest approves in PayPal ─┼─────────────────────────────►│
   │  POST payment/capture ────►│  POST .../capture ──────────►│
   │                            │◄──────── capture ────────────│
   │                            │  validate vs the quote       │
   │◄──── status ───────────────│  → paid → finalize Beds24    │
   │                            │                              │
   │                            │◄═══ webhook (independent) ═══│
```

The browser knows: the client id, the reference, an order id. It cannot learn:
the client secret, the service role key, the Beds24 token, any callback secret.
It decides: nothing.

`POST /api/booking/payment/order` takes **only a reference**. The amount is
read from the booking intent the server wrote from a live Beds24 offer.

---

## 4. Idempotency

Every mutating call carries a **deterministic** `PayPal-Request-Id`:

| Operation | Request id |
|---|---|
| create order | `<reference>:<quote hash>` |
| capture | `capture:<order id>` |
| refund | `refund:<capture id>` |

Never a random uuid. A random one makes a retry create a second order, which is
the exact failure the header prevents.

The quote hash is in the create key on purpose: a booking re-quoted to a
different total gets a **new** order rather than silently reusing one priced at
the old amount.

Two further defences on the guest double-clicking Pay:

* an existing order is **read from PayPal** and reused if still payable
  (including a `denied` one — the restart flow re-approves the same order);
* if it turns out already captured, the capture is applied rather than a second
  order being opened.

### Guards (2026-09-20)

| Call | Refused when |
|---|---|
| create order | state not payable; `hold_expires_at` passed; quote expired; payment `paid`; payment `unknown` or `capture_pending` (money may be in motion) |
| capture | payment `unknown` (a previous capture's outcome is unresolved — the database also refuses the re-send); state not payable or lease passed; already paid-side → idempotent answer |

A capture rejected with `ORDER_NOT_APPROVED` (or any non-decline 4xx) is
**not** recorded as a declined payment; `INSTRUMENT_DECLINED` and the other
decline issues are. `denied → paid` is legal, so the retry on the same order
completes.

---

## 5. Answered vs unanswered

The distinction the whole recovery model rests on.

| PayPal's response | Classified as | May we retry? |
|---|---|---|
| 200 / 201 | succeeded | — |
| 400, 401, 403, 404, 422 | **answered refusal** | yes, after compensating |
| 5xx | **uncertain** | **no** — read first |
| timeout, socket error | **uncertain** | **no** — read first |

A 5xx after a POST may still have taken effect. Collapsing these two categories
is how an uncertain capture becomes a double charge.

An uncertain capture sets `payment_status = 'unknown'`, which **blocks any
release**, and queues a severity-1 job that reads the order from PayPal.

---

## 6. Webhooks

### Verification

Against PayPal's own `/v1/notifications/verify-webhook-signature`, not locally.

Local verification means fetching a certificate from a URL the request itself
supplies, trusting it, checking the chain and reimplementing PayPal's
canonicalisation. Every one of those is a place to be subtly wrong, and being
subtly wrong here means accepting forged "you have been paid" events.

`webhook_id` is **ours**, from the environment. Without it, a valid PayPal
signature from any other merchant's webhook would verify.

All five headers are required; a delivery missing any is not verifiable and is
refused without calling PayPal.

### Events handled

| Event | Effect |
|---|---|
| `PAYMENT.CAPTURE.COMPLETED` | validate against the quote → `paid` → finalize |
| `PAYMENT.CAPTURE.PENDING` | `payment_pending`. **Not paid** |
| `PAYMENT.CAPTURE.DENIED` | `payment_failed`. The hold is **not** released here |
| `PAYMENT.CAPTURE.REFUNDED` / `REVERSED` | recorded, outbox event, escalated. The booking is **not** changed |
| `CHECKOUT.ORDER.APPROVED` | `awaiting_payment` |
| `CUSTOMER.DISPUTE.CREATED` | severity-1 job. Nothing automated |

A refund does not cancel a reservation — a partial refund for a shortened stay
is perfectly normal. It is recorded and escalated.

### Deduplication

`unique (provider, provider_event_id)`. PayPal delivers up to nine times;
repeated delivery is harmless **by construction**, not by convention.

An event whose signature does not verify is **stored** (with
`verification = 'failed'`) and never queued. Storing it is deliberate: a stream
of failed-signature deliveries is the difference between "our webhook id is
wrong" and "someone is posting forged events at us".

### Responses

`200` once durably stored — including for an event we do not act on.
`500` when we could not store it, so PayPal redelivers.
Never `401`: a forged event must not learn whether it was believed, and a
genuine event whose signature we mishandled must not retry forever.

---

## 7. Dashboard setup

1. Developer Dashboard → **Sandbox** → create an app. Copy the client id and
   secret. These are **not** interchangeable with live credentials.
2. Add a webhook pointing at **one** of:
   * `https://<project>.supabase.co/functions/v1/paypal-webhook` (preferred), or
   * `https://<site>/api/webhooks/paypal`
3. Subscribe to: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`,
   `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`,
   `PAYMENT.CAPTURE.REVERSED`, `CHECKOUT.ORDER.APPROVED`,
   `CUSTOMER.DISPUTE.CREATED`.
4. Copy the **webhook id** into `PAYPAL_WEBHOOK_ID` in both secret stores.
5. Deploy the Edge Function:
   ```bash
   supabase functions deploy paypal-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` is required and is not a weakening: PayPal does not send a
   Supabase JWT, and authenticity comes from PayPal's signature.

---

## 8. What a sandbox run must confirm

The scripted run is `docs/paypal-sandbox-e2e.md`. **Official PayPal
documentation could not be reached from the environment this pass was written
in**, so nothing below was re-checked against the current reference; the
shapes remain the earlier documentation pass's model.

None of this is proven. Each line is a real way the integration could be wrong.

- [ ] Client-credentials auth returns a token against the sandbox.
- [ ] `POST /v2/checkout/orders` accepts the body shape, and the response
      carries `id` and an `approve` link where the mapper looks for them.
- [ ] `custom_id` is echoed on the **capture** and on the **webhook**. This is
      how an event that carries nothing else is attributed to a booking; if it
      is not echoed, attribution falls back to the order id and the
      `supplementary_data.related_ids.order_id` path must be confirmed.
- [ ] `PayPal-Request-Id` genuinely de-duplicates a repeated create.
- [ ] A capture response nests under
      `purchase_units[].payments.captures[]` as modelled.
- [ ] The amount comes back as a decimal **string** in `amount.value`.
- [ ] `ORDER_ALREADY_CAPTURED` arrives as a 422 with that issue name.
- [ ] `verify-webhook-signature` returns `SUCCESS` for a genuine delivery and
      `FAILURE` for a tampered one.
- [ ] A PENDING capture is observable at all in sandbox (it may not be).
- [ ] A refund produces `PAYMENT.CAPTURE.REFUNDED` in the shape modelled.

Until these are ticked, treat `lib/payments/paypal/types.ts` the way
`lib/integrations/beds24/types.ts` was treated before the live Beds24 run: as a
good-faith model of a wire format nobody has seen.

---

## 9. Going live

Every item in `docs/direct-booking-production-readiness.md`, plus:

1. A **separate** live app in the PayPal dashboard. Never reuse sandbox
   credentials.
2. A **separate** live webhook, and its own `PAYPAL_WEBHOOK_ID`.
3. `PAYPAL_MODE=live` in **both** secret stores, at the same time.
4. One real low-value transaction, end to end, including a refund.
5. Confirm that PayPal's own account settings do not auto-refund or auto-void
   anything on a schedule.
