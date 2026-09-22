# Real-time reservation sync — the Beds24 webhook

```
Booking.com ─┐
Airbnb ──────┼─► Beds24 ─► POST /api/webhooks/beds24 ─► fresh GET /bookings?id=… ─► Supabase
Beds24 UI ───┘                  (the signal)                 (the truth)
```

There is **one** Beds24 webhook endpoint in this codebase and there must stay
one: `app/api/webhooks/beds24/route.ts`. It already existed for the inventory
cache; the reservation refresh is part of the same handler, not a second system.

---

## 1. The exact URL to configure

| deployment | URL |
|---|---|
| staging | `https://<staging-domain>/api/webhooks/beds24` |
| production | `https://<production-domain>/api/webhooks/beds24` |

Replace `<…-domain>` with the host the Cloudflare Worker serves. **HTTPS only** —
the secret travels in the request and a plaintext delivery would publish it.

---

## 2. The exact Beds24 settings

In Beds24: **Settings → Apps & Integrations → (Booking) Webhook**, per property,
for **both** Schulstraße rooms — the mapped rooms are the only ones imported.

| setting | value |
|---|---|
| Webhook URL | `https://<domain>/api/webhooks/beds24` |
| Method | **POST** |
| Content type | `application/json` |
| Trigger on | booking **created**, **modified** and **cancelled** (enable all three) |
| Custom header *(if offered)* | name `x-bolagio-signature`, value = `BEDS24_WEBHOOK_SECRET` |
| Include booking data | on, if offered — harmless, and useful in the stored event for audit |
| Retries | leave at the Beds24 default |

### The secret — two transports

The endpoint refuses every delivery unless `BEDS24_WEBHOOK_SECRET` is set, and
then accepts the secret **either** way:

1. **Preferred — a custom header.**
   `x-bolagio-signature: <BEDS24_WEBHOOK_SECRET>`
2. **Fallback — a query parameter**, for a Beds24 webhook form that offers only
   a URL:
   `https://<domain>/api/webhooks/beds24?token=<BEDS24_WEBHOOK_SECRET>`

Both are compared in constant time. The fallback exists because Beds24's webhook
configuration does not offer a custom header on every account, and the reference
cannot be read from the environment this was built in (`docs/beds24-contract.md`);
without it, an account with no header field could not authenticate at all, and
the realistic alternative would be no authentication. **Use the header where
Beds24 offers one.** A secret in a URL is written to access logs, proxy logs and
referrer headers in a way a header is not; if a URL ever leaks, rotate
`BEDS24_WEBHOOK_SECRET` and update both Beds24 and the Worker secret.

> **Not verified live.** The Beds24 webhook form's exact field names, whether it
> offers a custom header, and the action vocabulary it sends (`created`,
> `modified`, `cancelled`, or something else) are **not established for this
> account** — `beds24.com` is unreachable from this build environment. The
> handler is written so that none of that matters: see §4.

### Generating and setting the secret

```bash
openssl rand -hex 32                       # the value
npx wrangler secret put BEDS24_WEBHOOK_SECRET                  # preview/staging
npx wrangler secret put BEDS24_WEBHOOK_SECRET --env production # production
```

It is listed in `ops/staging/secrets-checklist.md`. Without it the endpoint
answers 401 to everything, by design — the scheduled import
(`POST /api/booking/reservations/sync`) keeps working and remains the floor.

---

## 3. What happens on a delivery

1. **Authenticate**, constant time, header then query. An unverified body is
   never read, parsed, hashed or stored.
2. **Persist the raw delivery**, keyed by a SHA-256 of the body
   (`bolagio_integration_events`). A byte-identical re-delivery hits the unique
   index, is acknowledged and dropped — **without a provider call**.
3. **Inventory** (unchanged): close the affected nights, then bulk-resync the
   unit from Beds24.
4. **Refresh the reservation**: `GET /bookings?id=<id>&includeInvoiceItems=false`,
   normalise through the existing mapper, upsert through the existing
   `upsertReservation`. Same code as the scheduled import — there is no second
   normalisation path.
5. **Queue reconciliation** if the booking is one of BoLaGio's own direct
   bookings, on `cancelled` or `modified`. The engine re-reads Beds24 before
   changing anything; the payload is never acted on.
6. **Answer 200** `{"received": true}`.

Beds24 only ever sees **200** (accepted) or **401** (not you). A processing
failure is recorded against the stored event and appears in the logs, never in
the response — a webhook that answers with a database message is free
reconnaissance. A failure after step 2 still answers 200, because the delivery
is already durably stored and a 500 would make Beds24 redeliver something that
was accepted.

---

## 4. The three properties that make this safe

**The payload is a trigger, never the data.** Everything stored comes from the
fresh `GET`. A forged delivery claiming a cancellation at €1.00 results in one
wasted read and the true, confirmed reservation being written — there is a test
that does exactly that.

**No action word is trusted.** The reservation refresh is *not* gated on the
action string, because Beds24's vocabulary is unverified. Any delivery carrying a
booking id gets a fresh read. `BOOKING_CANCELLED`, `booking_changed` or no action
at all all work. (The inventory step keeps its action gate — closing nights is a
state change, not a read.) The booking id itself is validated as digits before it
reaches a provider query.

**Nothing is ever written to Beds24.** Every call on this path is a `GET` with no
body and no idempotency key, asserted across every action in
`tests/beds24-webhook.test.ts`.

### Idempotence

| case | behaviour |
|---|---|
| identical re-delivery | dropped at the payload hash; no provider call, no write |
| re-delivery differing by a timestamp | reprocessed — and converges, because the upsert key is `(provider, external_booking_id)`. The cost is one extra `GET`. |
| out-of-order deliveries | harmless: each one re-reads current provider state |
| a booking on an unmapped room | skipped, counted, not stored |

### What is deliberately *not* done

A cancellation is **never inferred from absence**. If the fresh `GET` returns no
booking, the stored row keeps its status and the outcome is logged as
`not_found_at_provider`. A filtered read, a transient provider fault and a real
deletion are indistinguishable from here, and a stay that vanishes the moment a
read hiccups is worse than one that is a few minutes stale. Beds24 returns
cancelled bookings with `status: cancelled`, which *is* imported — that is the
real cancellation path.

---

## 5. Verifying it

```bash
# Should be 401 — no secret.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://<domain>/api/webhooks/beds24" -d '{}'

# Should be 200 — header transport, unknown booking id, nothing written.
curl -s -X POST "https://<domain>/api/webhooks/beds24" \
  -H "x-bolagio-signature: $BEDS24_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  -d '{"action":"modified","bookingId":"0"}'
```

Then make a real change in Beds24 (move a test booking's dates) and check, within
seconds: the row in `bolagio_reservations`, the delivery in
`bolagio_integration_events` with `status = 'processed'`, and a
`webhook.beds24` log line with `outcome: "updated"`. No log line on this path
carries a guest name, email or phone — the logger's allow list drops them.

---

## 6. Scope

This path changes no finance or accounting code, no direct-booking behaviour
(`DIRECT_BOOKING_ENABLED` stays off and is neither read nor written here), and
no Beds24 state. The scheduled import stays exactly as it is and remains the
floor under the webhook, for the deliveries that never arrive.
