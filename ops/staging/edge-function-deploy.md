# Staging — deploying the PayPal webhook Edge Function

The Edge Function `supabase/functions/paypal-webhook/index.ts` is the durable
PayPal ingress: it verifies a delivery against PayPal, stores it through
`bolagio_record_payment_event` (deduplicated on PayPal's event id) and answers
`200 {"received":true}`. It must not depend on the Cloudflare worker being
up. It is deployed to the **shared** Supabase project (`docs/supabase-shared-project.md`).

## 1. Deploy

```bash
supabase link --project-ref <staging project ref>      # once per machine
supabase functions deploy paypal-webhook --no-verify-jwt
```

`--no-verify-jwt` is **required and not a weakening**: PayPal does not send a
Supabase JWT. Authenticity comes from PayPal's signature, verified against
PayPal inside the function; an unverified event is stored with
`verification='failed'` and never processed.

The function's URL is
`https://<staging project ref>.supabase.co/functions/v1/paypal-webhook`.
Register exactly **one** webhook for it in the PayPal sandbox dashboard
(`docs/payment-paypal.md` §7) and copy its id into `PAYPAL_WEBHOOK_ID` in
both stores.

## 2. The four PayPal secrets — must match the worker exactly

```bash
supabase secrets set --project-ref <staging project ref> \
  PAYPAL_MODE=sandbox \
  PAYPAL_CLIENT_ID=<sandbox client id> \
  PAYPAL_CLIENT_SECRET=<sandbox secret> \
  PAYPAL_WEBHOOK_ID=<webhook id>
supabase secrets list --project-ref <staging project ref>     # names only
```

| Name | Worker (`wrangler secret put … --env staging`) | Edge Function |
|---|---|---|
| `PAYPAL_MODE` | `sandbox` | `sandbox` |
| `PAYPAL_CLIENT_ID` | same value | same value |
| `PAYPAL_CLIENT_SECRET` | same value | same value |
| `PAYPAL_WEBHOOK_ID` | same value | same value |

A mismatch is the failure to watch for: the site creating orders under one
app while the Edge Function verifies against another means every delivery
lands as `verification='failed'` and no payment is ever applied. The function
fails closed (HTTP 500, PayPal retries) when any of the four is missing or
`PAYPAL_MODE` is not exactly `sandbox`/`live`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **injected** by Supabase
into the function; do not set them. The function keeps the service key even
when the worker has been moved to a `bolagio_app` JWT.

## 3. Verify

Prerequisites: the migrations applied and verified (`ops/staging/migrate.sh`),
so `bolagio_record_payment_event` and `bolagio_observe_integration` exist.

### 3a. Reachability — a body with no event id

A JSON body without `id`/`event_type` is accepted and dropped before any
signature check or database call (the function returns the success shape
so PayPal does not retry junk). This proves the function is deployed and
reachable, nothing more:

```bash
FN="https://<staging project ref>.supabase.co/functions/v1/paypal-webhook"
curl -sS -o /tmp/edge.out -w '%{http_code}\n' -X POST "$FN" \
  -H 'content-type: application/json' \
  -H 'paypal-auth-algo: SHA256withRSA' \
  -H 'paypal-cert-url: https://api.sandbox.paypal.com/v1/notifications/certs/x' \
  -H 'paypal-transmission-id: 00000000-0000-0000-0000-000000000000' \
  -H 'paypal-transmission-sig: bogus' \
  -H "paypal-transmission-time: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -d '{"event_type":"PAYMENT.CAPTURE.COMPLETED"}'
cat /tmp/edge.out; echo
```

Expect `200` and exactly `{"received":true}`. A `500` here means the
configuration check failed (a missing PayPal secret or an invalid
`PAYPAL_MODE`); a `404` means the function is not deployed to this project;
a `401` means it was deployed **without** `--no-verify-jwt`.

### 3b. A bogus signature is stored as failed, never processed

A body **with** an id and all five signature headers, but a signature PayPal
cannot verify:

```bash
EVT="test-$(date +%s)"
curl -sS -o /tmp/edge.out -w '%{http_code}\n' -X POST "$FN" \
  -H 'content-type: application/json' \
  -H 'paypal-auth-algo: SHA256withRSA' \
  -H 'paypal-cert-url: https://api.sandbox.paypal.com/v1/notifications/certs/x' \
  -H 'paypal-transmission-id: 00000000-0000-0000-0000-000000000000' \
  -H 'paypal-transmission-sig: bogus' \
  -H "paypal-transmission-time: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -d "{\"id\":\"$EVT\",\"event_type\":\"PAYMENT.CAPTURE.COMPLETED\",\"create_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"resource\":{\"id\":\"CAP-TEST\",\"status\":\"COMPLETED\",\"custom_id\":\"BLG-TEST\",\"amount\":{\"currency_code\":\"EUR\",\"value\":\"1.00\"}}}"
cat /tmp/edge.out; echo
```

Expect `200 {"received":true}` **and** one inbox row with
`verification = 'failed'`:

```sql
select provider_event_id, event_type, verification, processed_at
from bolagio_payment_events
where provider_event_id = '<the EVT value>';
-- one row, verification = 'failed', processed_at null — and it stays null:
-- the reconcile pass claims verified events only.
```

(If the verification call to PayPal itself fails — wrong client secret,
network — the function answers `500` and stores nothing; that is the
designed behaviour, PayPal retries. It is also how a wrong
`PAYPAL_CLIENT_SECRET` shows itself.)

A resend of the same body is `duplicate` (one row, unchanged). Delete the
test row afterwards, or leave it: a failed row is inert.

### 3c. A real verified delivery

Only PayPal can produce one: Dashboard → Webhooks → the staging webhook →
resend an event, or complete case 1 of `docs/paypal-sandbox-e2e.md`. Expect
`verification = 'verified'`, and — because the function now calls
`bolagio_observe_integration('paypal', 'last_verified_webhook', <event type>)`
**best-effort** after a verified store (a failure there never fails the
ingest) — a fresh `last_verified_webhook` on the System page and in
`bolagio_integration_health`:

```sql
select provider, signal, observed_at, detail
from bolagio_integration_health
where provider = 'paypal' and signal = 'last_verified_webhook';
```

Logs, names only: `supabase functions logs paypal-webhook --project-ref <ref>`
(`scope: paypal-webhook`, `event: received|verify|store|config`).

## 4. After a secret change

`supabase secrets set` takes effect on the next invocation; redeploy anyway
(`supabase functions deploy paypal-webhook --no-verify-jwt`) so the change is
tied to a deployment record, then repeat 3a and 3b.
