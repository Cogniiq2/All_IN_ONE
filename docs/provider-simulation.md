# Provider simulation — the PayPal and Beds24 simulators and what they prove

This document describes the test infrastructure that runs the real booking
code against two simulated providers. Everything stated here is taken from
the files named in each section; where a behaviour is not exercised by any
test, it is marked **not covered** rather than inferred.

Sources: `tests/simulators/paypal-sim.mjs`, `tests/simulators/beds24-sim.mjs`,
`tests/simulators/control.mjs`, `tests/integration/*.test.ts`,
`tests/integration/harness.ts`, `vitest.integration.config.ts`,
`scripts/test-stack.sh`, `scripts/install-postgrest.sh`, `scripts/stack-proxy.mjs`,
`e2e/**`, `playwright.config.ts`, `lib/booking/config.ts`,
`lib/config/environment.ts`, `lib/ops/external-operations.ts`,
`lib/integrations/beds24/client.ts`, `lib/payments/paypal/client.ts`,
`supabase/migrations/20260920120000_booking_production_hardening.sql`,
`.github/workflows/ci.yml`.

---

## 1. Purpose and the safety rule

### What the simulation is

The two simulators are plain Node HTTP servers (`node:http`) that speak the
subset of the PayPal REST API and the Beds24 V2 API that the adapters in
`lib/payments/paypal/*` and `lib/integrations/beds24/*` use. They bind a real
port on `127.0.0.1`, so the adapters run **unmodified**: token fetch, request
ids, idempotency keys, error classification and the PayPal webhook
verification round trip all execute against the simulator exactly as they
would against the provider. Failure behaviour is not injected into the code;
it is scripted on the simulator through a `/__sim/*` control API.

Around the simulators sit two harnesses:

- **Integration** (`tests/integration/harness.ts`): starts both simulators
  in-process on ephemeral ports, serves the real route handlers from
  `app/api/**` over HTTP through a tiny in-process server, and points
  `supabase-js` at the local Supabase-shaped stack (`scripts/test-stack.sh`:
  real Postgres behind real PostgREST with the migrations applied). A
  simulated webhook therefore reaches `app/api/webhooks/paypal/route.ts` over
  HTTP, and "webhook before return" is a genuine race.
- **Playwright** (`e2e/global-setup.ts`): starts both simulators on fixed
  ports, builds the site (unless `E2E_SKIP_BUILD=1`) and serves it with
  `next start` in a child process whose environment points every provider
  call at a simulator. Chromium then drives the public booking dialog and
  BoLaGio Control, and each test asserts the database afterwards.

### The safety rule: a simulator is reachable only on `APP_ENV=local`

Three independent gates make it impossible for a deployed application to talk
to a simulator.

1. **`providerOverridesPermitted()`** (`lib/booking/config.ts`):

   ```ts
   export function providerOverridesPermitted(): boolean {
     return appEnvironment() === 'local';
   }
   ```

   `appEnvironment()` (`lib/config/environment.ts`) reads `APP_ENV` and
   returns it only if it is exactly one of `local`, `preview`, `staging`,
   `production`; anything else — unset, misspelled, mixed case — is read as
   `production`. So an override is honoured only when `APP_ENV=local` is set
   verbatim.

2. **The config readers ignore the override elsewhere** (`lib/booking/config.ts`):
   - `beds24Config()` uses `BEDS24_API_BASE_URL` only when
     `providerOverridesPermitted()`; otherwise `BEDS24_DEFAULT_BASE_URL`
     (`https://beds24.com/api/v2`).
   - `paypalConfig()` uses `PAYPAL_SIMULATOR_URL` only when
     `providerOverridesPermitted()` **and** `PAYPAL_MODE === 'sandbox'`;
     otherwise the base URL is derived from the mode
     (`https://api-m.paypal.com` for `live`, `https://api-m.sandbox.paypal.com`
     for `sandbox`). There is no configurable PayPal base URL.
   - `providerTimeoutMs()` honours `PROVIDER_TIMEOUT_MS` (clamped to
     200–60 000 ms) only when `providerOverridesPermitted()`; every other
     environment uses the fixed 10 s (Beds24) / 12 s (PayPal).

3. **`validateEnvironment()` refuses the configuration**
   (`lib/config/environment.ts`, finding code **`PROVIDER_OVERRIDE_OUTSIDE_LOCAL`**,
   severity `refuse`):
   - `BEDS24_API_BASE_URL` set to anything other than
     `https://beds24.com/api/v2` on any environment other than `local`;
   - `PAYPAL_SIMULATOR_URL` set at all on any environment other than `local`.

   A `refuse` finding makes `directBookingPermitted` false regardless of
   `DIRECT_BOOKING_ENABLED`, so even if a value leaked through, the booking
   routes would be disabled rather than pointed at the wrong system.

Both simulators state this in their file headers; the PayPal simulator's says
"Nothing here is reachable from a deployed application: the adapter only
honours `PAYPAL_SIMULATOR_URL` on `APP_ENV=local`, and the environment rules
refuse it anywhere else."

Two further test-only switches follow the same pattern and are set by the
Playwright setup: `OPERATOR_PAID_CANCELLATION_ENABLED` (a `warn` finding
everywhere) and `MESSAGING_TEST_COMPLETIONS_ALLOWED` (refused on `production`
with `TEST_MESSAGING_ON_PRODUCTION`).

> Note: `tests/environment.test.ts` does not contain a case that asserts
> `PROVIDER_OVERRIDE_OUTSIDE_LOCAL` by name. The rule is present in
> `lib/config/environment.ts` and is documented here from that source; its
> unit coverage is **not covered** at the time of writing.

---

## 2. How to run

All commands are from `package.json`.

| Step | Command | What it does |
|---|---|---|
| Start the local stack | `npm run stack:up` (`scripts/test-stack.sh up`) | `initdb` a throwaway Postgres cluster under `.stack/`, create the Supabase roles (`anon`, `authenticated`, `service_role`, `authenticator`), apply the six migrations listed in the script, apply `supabase/seed/bolagio_booking_units.sql`, open `schulstrasse-i` for booking (test data only), start PostgREST and the `/rest/v1` proxy, mint HS256 JWTs, write `.stack/env`. |
| Unit tests | `npm test` (`vitest run`) | No database, no simulators. |
| Integration | `npm run test:integration` (`vitest run --config vitest.integration.config.ts`) | Requires the stack. Runs `tests/integration/**/*.test.ts` with `fileParallelism: false` (one file at a time — the files share one database), `testTimeout` 30 s, `hookTimeout` 60 s. Each file starts its own simulator pair on ephemeral ports. |
| Playwright | `npm run test:e2e` (`playwright test`) | Requires the stack. `e2e/global-setup.ts` starts the simulators, builds and serves the site; `workers: 1`, `fullyParallel: false`, `retries: 0`, test timeout 90 s, locale `de-DE`, timezone `Europe/Berlin`. |
| Stop the stack | `npm run stack:down` | Kills PostgREST and the proxy, stops Postgres, removes `.stack/`. |
| Reset booking data only | `scripts/test-stack.sh reset` | Truncates the booking tables, keeps the schema. |
| Fetch PostgREST | `scripts/install-postgrest.sh` | Downloads the pinned PostgREST `v12.2.3` static Linux binary to `.tools/postgrest`, verified against a hard-coded SHA-256. |

Environment switches:

- `E2E_SKIP_BUILD=1` — skip `next build` in the Playwright global setup and
  serve the existing `.next`. By default the site is rebuilt so a stale build
  cannot make a test pass.
- `E2E_CHROMIUM=<path>` — use a Chromium binary supplied by the environment
  (`playwright.config.ts` also checks `/opt/pw-browsers/chromium`); otherwise
  Playwright's own download is used. CI runs `npx playwright install --with-deps chromium`.
- `E2E_PORT` — port for `next start` (default 3100).
- `BOLAGIO_STACK_DIR`, `BOLAGIO_STACK_PG_PORT`, `BOLAGIO_STACK_REST_PORT`,
  `BOLAGIO_STACK_PGRST_PORT`, `POSTGREST_BIN`, `PGBIN`, `BOLAGIO_STACK_JWT_SECRET`
  — stack overrides (`scripts/test-stack.sh`).

### Ports

| Component | Port | Source |
|---|---|---|
| Postgres (stack) | 56432 | `scripts/test-stack.sh` `PG_PORT` |
| `/rest/v1` proxy — this is `SUPABASE_URL` | 56433 | `scripts/test-stack.sh` `REST_PORT`, `scripts/stack-proxy.mjs` |
| PostgREST (bare) | 56434 | `scripts/test-stack.sh` `PGRST_PORT` |
| Next.js under Playwright | 3100 | `e2e/global-setup.ts` `PORT` |
| PayPal simulator under Playwright | 56441 | `e2e/global-setup.ts` `PAYPAL_PORT` |
| Beds24 simulator under Playwright | 56442 | `e2e/global-setup.ts` `BEDS24_PORT` |
| Simulators and app server under the integration harness | ephemeral (`listen(0)`) | `tests/integration/harness.ts` |

`scripts/stack-proxy.mjs` does one thing: it strips the `/rest/v1` prefix that
`supabase-js` adds and forwards to the bare PostgREST byte-for-byte. It does
no auth and rewrites nothing.

### The environment the harnesses set

Both harnesses set the same shape (`tests/integration/harness.ts`
`startHarness`, `e2e/global-setup.ts`): `APP_ENV=local`, `BEDS24_MODE=live`,
`BEDS24_API_BASE_URL=<beds24 sim>`, `PAYPAL_MODE=sandbox`,
`PAYPAL_SIMULATOR_URL=<paypal sim>`, `PAYPAL_WEBHOOK_ID=WH-SIM-ID`,
`DIRECT_BOOKING_ENABLED=true`, `BEDS24_CONFIRMED_STATUS=confirmed`,
`BOOKING_HOLD_MINUTES=5`, `BOOKING_LEASE_GRACE_SECONDS=30`,
`PROVIDER_TIMEOUT_MS=1200` (integration) / `1500` (Playwright), plus fixed
worthless secrets for sync, n8n and the admin session. The integration
harness runs with `NODE_ENV=test`; Playwright serves a production build with
`NODE_ENV=production`.

### CI

`.github/workflows/ci.yml` runs four jobs on every push and pull request:
`quality` (typecheck, lint, `npm test`), `database` (`scripts/db-test.sh`,
`scripts/db-ops-check.sh`), `integration` (install PostgREST, `test-stack.sh up`,
`npm run test:integration`, `test-stack.sh down`) and `e2e` (the same stack,
`playwright install --with-deps chromium`, `npm run test:e2e`, reports uploaded
on failure). No job reads a repository secret. Live provider checks are the
two manual workflows `beds24-readonly-check.yml` and `beds24-write-test.yml`.

---

## 3. The PayPal simulator (`tests/simulators/paypal-sim.mjs`)

Start it standalone with `node tests/simulators/paypal-sim.mjs [port]` or
in-process with `startPayPalSim(port)`.

### Provider endpoints

| Method and path | Behaviour |
|---|---|
| `POST /v1/oauth2/token` | Requires a `Basic` authorization header; returns `access_token: 'sim-access-token'`, `expires_in: 3600`. |
| every other endpoint | Requires `Authorization: Bearer sim-access-token`, else 401 `invalid_token`. |
| `POST /v2/checkout/orders` | Creates an order in status `CREATED`, id `SIM-ORD-…`. Honours `PayPal-Request-Id`: the same id returns the first order (200). Amount is parsed from `purchase_units[0].amount.value`; a non-parsable amount is a 422 `INVALID_REQUEST`. `custom_id` and `invoice_id` are stored and echoed. |
| `GET /v2/checkout/orders/{id}` | Returns the order view (status, one purchase unit, `payments.captures` / `payments.refunds` when present, an `approve` link). 404 `RESOURCE_NOT_FOUND` when unknown. |
| `POST /v2/checkout/orders/{id}/capture` | 422 `ORDER_ALREADY_CAPTURED` when the order already has a capture; 422 `ORDER_NOT_APPROVED` unless the order is `APPROVED`. On success creates a capture `SIM-CAP-…`, sets the order to `COMPLETED`, schedules the auto-webhook, returns 201 with the order view. |
| `POST /v2/payments/captures/{id}/refund` | Honours `PayPal-Request-Id`. Refund amount defaults to the capture amount; a total exceeding the capture is 422 `REFUND_AMOUNT_EXCEEDED`. A completed refund sets the capture to `REFUNDED` or `PARTIALLY_REFUNDED` and schedules `PAYMENT.CAPTURE.REFUNDED`. Returns 201 with the refund view. |
| `POST /v1/notifications/verify-webhook-signature` | Recomputes the signature from the posted `transmission_id`, `transmission_time`, `webhook_event.id` and the configured `webhookId`; answers `verification_status: SUCCESS` only when the signature matches, `webhook_id` matches and the event id is one the simulator issued. |
| anything else | 404 `RESOURCE_NOT_FOUND`. |

Every request (including control calls) is appended to `state.calls` with
method, path, `paypal-request-id` header and parsed body.

### Control API (`/__sim/*`, JSON)

| Call | Effect |
|---|---|
| `POST /__sim/reset` | Fresh state: default modes, default config, no orders/captures/refunds/events/deliveries/calls. |
| `POST /__sim/config { webhookTarget, webhookId, autoWebhook, webhookDelayMs }` | Merged into config. Defaults: `webhookTarget: null`, `webhookId: 'WH-SIM-ID'`, `autoWebhook: 'immediate'`, `webhookDelayMs: 0`, `secret: 'sim-webhook-secret'`. |
| `POST /__sim/mode { op, mode }` | `op` ∈ `token`, `create_order`, `get_order`, `capture`, `refund`, `verify`. Unknown op → 400. |
| `POST /__sim/approve { orderId, webhook? }` | Moves a `CREATED` order to `APPROVED`; unless `webhook: false`, schedules `CHECKOUT.ORDER.APPROVED`. |
| `POST /__sim/webhook { orderId? \| captureId? \| eventId?, type, count?, delayMs?, tamper?, resourceOverride? }` | Builds and delivers an event for an order or capture (`resourceOverride` is merged into the resource), or re-delivers an existing event by `eventId`, `count` times, waiting `delayMs` before each delivery; `tamper: true` sends the literal signature `tampered`. |
| `GET /__sim/state` | Modes, config (secret omitted), orders, captures, refunds, event ids/types, deliveries. |
| `GET /__sim/calls` | The request log. |

`tests/simulators/control.mjs` wraps these as `reset`, `config`, `mode`,
`state`, `calls`, `approve(orderId, webhook = true)`, `webhook(input)` (plus
the Beds24-only `block`/`unblock`).

### Modes per operation

The common failure modes (`failure()` in the source) apply to every op:

| Mode | What the simulator does |
|---|---|
| `success` | Default; the endpoint's normal behaviour. |
| `timeout` | Never answers. The adapter's own timeout (`PROVIDER_TIMEOUT_MS`) fires. |
| `server_error` | 503 `SERVICE_UNAVAILABLE`. |
| `malformed` | 200 with `content-type: application/json` and the body `<html>not json</html>`. |
| `unauthorized` | 401 `invalid_client`. |
| `not_found` | 404 `RESOURCE_NOT_FOUND`. |

Op-specific modes (checked after the common ones):

| Op | Mode | What the simulator does |
|---|---|---|
| `token` | common modes only | — |
| `create_order` | `rejected` | 422 `INVALID_REQUEST`; no order stored. |
| `create_order` | `response_lost` | The order **is** stored (and the request id remembered), then the socket is destroyed before any response. |
| `get_order` | common modes only | — |
| `capture` | `decline` | Order stays `APPROVED`; schedules `PAYMENT.CAPTURE.DENIED` with a `DECLINED` capture resource; answers 422 `INSTRUMENT_DECLINED`. No capture is stored. |
| `capture` | `pending` | Capture stored with status `PENDING`; schedules `PAYMENT.CAPTURE.PENDING`; 201. |
| `capture` | `wrong_amount` | Capture stored for the order amount **minus 100 cents**; `COMPLETED`; 201. |
| `capture` | `wrong_currency` | Capture stored in `USD` regardless of the order currency; 201. |
| `capture` | `already_captured` | 422 `ORDER_ALREADY_CAPTURED` even on a first capture. |
| `capture` | `response_lost` | Capture stored, order `COMPLETED`, webhook scheduled, then the socket is destroyed. |
| `refund` | `rejected` | 422 `REFUND_AMOUNT_EXCEEDED`; nothing stored. |
| `refund` | `pending` | Refund stored with status `PENDING`; capture status unchanged; no webhook. |
| `refund` | `response_lost` | Refund stored (and completed, with its webhook scheduled), then the socket is destroyed. |
| `verify` | any mode other than `success` | The common modes answer as above; any other non-`success` value makes the endpoint answer `verification_status: FAILURE`. |

### Webhook delivery

- **Signing.** Each delivery carries the five `paypal-*` headers. The
  signature is `HMAC-SHA256(secret, transmissionId|transmissionTime|eventId|webhookId)`,
  base64. `paypal-auth-algo` is `SHA256withRSA` and `paypal-cert-url` is
  `https://sim.paypal.local/cert.pem`; neither is used by the simulator — the
  application verifies by calling the simulator's
  `/v1/notifications/verify-webhook-signature`, which recomputes the HMAC.
  This is a stand-in for PayPal's verification API, not for certificate-based
  verification (see §7).
- **`autoWebhook`** (config) governs the event the simulator emits by itself
  after an approval, capture or completed refund:
  - `immediate` — one delivery after 5 ms (default);
  - `delayed` — one delivery after `max(webhookDelayMs, 50)` ms;
  - `duplicate` — the same event delivered three times, at 5, 60 and 140 ms;
  - `none` — the event is built and stored but not delivered; a test can
    deliver it later through `/__sim/webhook`.
- **Manual delivery** through `/__sim/webhook` allows reordering
  (deliver `CHECKOUT.ORDER.APPROVED` after a capture), duplicates (`count`),
  delays (`delayMs`), tampering (`tamper: true`) and resource overrides.
- Deliveries are recorded in `state.deliveries` with the target's HTTP status;
  with no `webhookTarget` set the record says `delivered: false, reason: 'no target'`.

Which modes and options the tests actually use: `capture` — `decline`,
`pending`, `timeout`, `response_lost`, `wrong_amount`, `wrong_currency`;
`create_order` — `server_error`, `malformed`; `refund` — `response_lost`,
`timeout`, `rejected`; `token` — `unauthorized`; `autoWebhook` — `immediate`,
`duplicate`, `none`; manual webhooks with `eventId`+`count`, `orderId`+`resourceOverride`,
`captureId`+`tamper`, `captureId`+`resourceOverride`. The `get_order` and
`verify` modes, `already_captured`, `not_found`, the `delayed` plan and
`webhookDelayMs` are implemented but **not covered** by any test.

---

## 4. The Beds24 simulator (`tests/simulators/beds24-sim.mjs`)

Start it with `node tests/simulators/beds24-sim.mjs [port]` or
`startBeds24Sim(port)`. Two properties are built in:
`354659 Schulstraße I (sim)` with room `731147`, and
`354658 Schulstraße II (sim)` with room `731146`, both `EUR`, `maxPeople: 4`.

### Provider endpoints

| Method and path | Behaviour |
|---|---|
| `GET /authentication/token` | Requires a `refreshtoken` header; returns `token: 'sim-beds24-token'`, `expiresIn: 86400`. |
| every other endpoint | Requires header `token: sim-beds24-token`, else 401. |
| `GET /properties` | The two properties; `roomTypes` only with `includeAllRooms=true`. |
| `GET /inventory/rooms/calendar?roomId&propertyId&startDate&endDate` | Per-night availability as compressed runs (`from`, `to`, `numAvail` 0/1, `minStay: 1`, `maxStay: 30`, `price1 = nightlyCents/100`). A night is closed when a booking in a **blocking status** covers it or an external block covers it. |
| `GET /inventory/rooms/offers?roomId&propertyId&arrival&departure` | One offer `Standard` priced `nightlyCents × nights / 100` plus a fixed fee `Endreinigung` of `cleaningCents / 100` (default 45.00); an empty offer list when any night is closed, nights < 1, or mode `unavailable`. |
| `GET /bookings?id=` | Read one booking (see `read` modes). Unknown id → `data: []`. |
| `GET /bookings?roomId&propertyId&arrivalFrom&arrivalTo` | Search (see `search` modes). |
| `POST /bookings` `[ { … } ]` | An item without `id` is a **create (hold)**; with `id` and `status: 'cancelled'` a **release**; with `id` and another status a **finalize**. A create on a closed night answers `[{ success: false, errors: [{ field: 'arrival', message: 'not available' }] }]`. A create honours the `idempotency-key` header when `honourIdempotency` is true: the same key returns the first booking. |

Every request is logged to `state.calls` with method, path, query,
`idempotency-key` and body.

### Control API

| Call | Effect |
|---|---|
| `POST /__sim/reset` | Fresh state. |
| `POST /__sim/config { blockingStatuses, honourIdempotency, nightlyCents, cleaningCents }` | Merged into config. Defaults: `blockingStatuses: ['new','confirmed','request']`, `honourIdempotency: true`, `nightlyCents: 14000`, `cleaningCents: 4500`. |
| `POST /__sim/mode { op, mode }` | `op` ∈ `token`, `calendar`, `offers`, `hold`, `finalize`, `release`, `read`, `search`. |
| `POST /__sim/block { roomId, from, to, reason? }` | Closes `[from, to)` for the room "from outside" (a Booking.com reservation). |
| `POST /__sim/unblock { roomId, from, to }` | Removes that block. |
| `GET /__sim/state` | Modes, config (token omitted), bookings, blocks. |
| `GET /__sim/calls` | The request log. |

- **`blockingStatuses`** — which booking statuses close nights. This models
  the per-property Beds24 setting the live account has; a hold in status
  `new` blocks by default, and a test that sets `['confirmed']` makes a `new`
  hold *not* block.
- **`honourIdempotency`** — whether a repeated `idempotency-key` returns the
  first booking instead of creating a second one. Default true. No test sets
  it to false (**not covered**).
- **`nightlyCents`** — the price the calendar and offers quote; a test changes
  it mid-flow to make the server re-price.

### Modes per operation

Common failure modes (`failure()`): `timeout` (never answers),
`server_error` (500 `{ success: false }`), `malformed` (200 with body
`{not json`), `unauthorized` (401).

| Op | Mode | What the simulator does |
|---|---|---|
| `token` | common modes only | — |
| `calendar` | common modes only | — |
| `offers` | `unavailable` | Empty offer list. |
| `offers` | `no_price` | The offer has no `price`. |
| `hold` | `conflict` | `[{ success: false, errors: [arrival: not available] }]`; nothing stored. |
| `hold` | `response_lost` | Booking **stored** (and the idempotency key remembered), then the socket is destroyed. |
| `hold` | `reference_absent` | Booking stored; the `reference` field is omitted from the response. |
| `hold` | `mismatch` | Booking stored correctly; the response reports `roomId: 999999` and arrival/departure shifted by one day. |
| `hold` | `duplicate_result` | Two entries in the response array, the second with `id + 1` (only one booking is stored). |
| `finalize` | `failure` | `[{ success: false, errors: [status: not accepted] }]`; status unchanged. |
| `finalize` | `status_mismatch` | Status set to `request` instead of the requested one; `success: true`. |
| `finalize` | `response_lost` | Status changed, then the socket is destroyed. |
| `release` | `still_closed` | Status set to `cancelled`, **and** a block with `reason: 'phantom'` is added over the booking's nights, so the calendar still shows them closed. |
| `release` | `response_lost` | Status set to `cancelled`, then the socket is destroyed. |
| `read` | `not_found` | `data: []` even for a known id. |
| `read` | `reference_absent` | `reference` omitted from the view. |
| `read` | `status_mismatch` | View reports status `request`. |
| `read` | `mismatch` | View reports `roomId: 999999` and arrival + 1 day. |
| `search` | `not_found` | `data: []`. |
| `search` | `reference_absent` | Rows returned without `reference`. |

Modes the tests use: `hold` — `reference_absent`, `mismatch`, `timeout`,
`response_lost`, `duplicate_result`, `conflict`; `read` — `reference_absent`,
`mismatch`, `timeout`, `status_mismatch`; `search` — `reference_absent`,
`not_found`; `finalize` — `failure`, `status_mismatch`, `response_lost`,
`timeout`; `release` — `response_lost`, `still_closed`, `timeout`;
`offers` — `timeout` (Playwright G15). `calendar` and `token` modes,
`offers` `unavailable`/`no_price`, `read` `not_found`, `search` `timeout`, and
`server_error`/`malformed`/`unauthorized` on any op are implemented but
**not covered**.

---

## 5. PayPal 17-case matrix

Case numbering follows `docs/paypal-sandbox-e2e.md` §2; case 1 (the happy
path) is proven by `tests/integration/happy-path.test.ts` "holds, pays,
finalizes and confirms — with exactly one confirmation event" and by
Playwright G01/G02/G21, and is listed first for completeness. All other rows
are derived from the `it(...)` blocks in `tests/integration/paypal-cases.test.ts`.
Every integration case starts from `holdBooking()` (a hold through
`POST /api/booking/intent` on `schulstrasse-i`) and, where noted, `approveOrder()`
(`POST /api/booking/payment/order` then `/__sim/approve`). "Reconcile" is
`POST /api/booking/reconcile`; "sync" is `POST /api/booking/sync` (the hold
sweep); "expire" is a direct SQL update of `hold_expires_at` into the past.

| Case | Scenario | Simulator scripting | Expected booking status | Expected payment status | Expected side effects | Test that proves it |
|---|---|---|---|---|---|---|
| 1 | Happy path | Defaults (`autoWebhook: immediate`) | `confirmed`, `beds24_status = confirmed`, `hold_expires_at` null, `confirmed_at` set | `paid`, `paid_amount_cents` = quoted total | One Beds24 booking in `confirmed`; PayPal order amount = quoted total, `custom_id` = reference; `create_hold` op `succeeded`; payment events: the COMPLETED webhook row is verified and, after reconcile, 2 rows `succeeded`; outbox has `booking.held`, `payment.order_created`, `payment.completed`, exactly one `booking.confirmed`, one `invoice.required`, one `cleaning.required`; a turnover `required`; no reconciliation jobs | `happy-path.test.ts`: "holds, pays, finalizes and confirms — with exactly one confirmation event"; e2e G01, G02, G21 |
| 2 | Webhook before return | Approve with webhook; capture via route; wait 100 ms; reconcile (drains inbox); capture again | `confirmed` | `paid` (second capture answers 200, `status: confirmed`) | Exactly one `POST …/capture` at the simulator; exactly one intent event with `to_status = 'paid'`; `payment_order_id` matches the order | `paypal-cases.test.ts`: "2 — webhook before return: the inbox applies the capture first, the browser capture is a duplicate"; e2e G07 |
| 3 | Browser closes after approval | Approve with webhook; never capture; reconcile → `awaiting_payment`/`approved`; expire; sync; reconcile ×2 | After sync with lease lapsed: still `awaiting_payment`; after reconcile: `released` or `expired`; after a second reconcile: `released` | `approved` → `cancelled` | Job `BOOKING_LEASE_HELD_FOR_PAYMENT` created by the sweep; Beds24 booking `cancelled`; zero capture calls | `paypal-cases.test.ts`: "3 — browser closes after approval: nothing captures; after the lease the order is read and the hold released" |
| 4 | Browser closes after capture | Capture route called and its response discarded | `confirmed` (also via `GET /api/booking/status`) | `paid` | One capture at the simulator | `paypal-cases.test.ts`: "4 — browser closes after capture: the server-side capture stands and the status route says confirmed" |
| 5 | Double submit | Two concurrent order creates; approve; two concurrent captures | `confirmed` | `paid` | One order and one capture at the simulator; at least one capture call answers 200; exactly one `to_status = 'paid'` event | `paypal-cases.test.ts`: "5 — double submit: two concurrent order creates yield one order; two concurrent captures yield one capture"; e2e G08 |
| 6 | Refresh the return page | Capture, then four more captures, then another order create | `confirmed` | `paid` on every repeat | Repeated captures answer 200 `paymentStatus: paid`; the order route answers **410** once confirmed; one order, one capture at the simulator | `paypal-cases.test.ts`: "6 — refreshing the return page: repeated captures are idempotent and create no new order" |
| 7 | Cancel at PayPal | Order created, never approved; sync before the lease; expire; sync | `payment_session_created` until the lease; `released` after | not asserted beyond the status | Beds24 booking `cancelled`; outbox contains `booking.expired` and `booking.cancelled` | `paypal-cases.test.ts`: "7 — cancel at PayPal: the hold stands until the lease, then the sweep releases and the nights reopen"; e2e G04 |
| 8 | Declined instrument, retry on the same order | `capture: decline`; capture; `capture: success`; order route again; capture | `payment_failed` → `confirmed` | `denied` → `paid` | First capture answers 502 `payment_handoff_failed`; outbox contains `payment.failed`; the order route answers 201 with the **same** `orderId`; one order at the simulator | `paypal-cases.test.ts`: "8 — declined instrument, then a successful retry on the SAME order (denied → paid)"; e2e G05 |
| 9 | Duplicate webhook | `autoWebhook: duplicate`; approve without webhook; capture; resend the COMPLETED event by `eventId` ×2; reconcile | `confirmed` | not asserted directly | Exactly one `bolagio_payment_events` row of type `PAYMENT.CAPTURE.COMPLETED` after the three automatic and two manual deliveries; exactly one `to_status = 'paid'` event | `paypal-cases.test.ts`: "9 — duplicate webhook: one processed, the rest are duplicates, no state change" |
| 10 | Reordered webhooks | Capture to `confirmed`; then deliver `CHECKOUT.ORDER.APPROVED` with `resourceOverride { status: APPROVED }`; reconcile | `confirmed` | `paid` | No regression of the row | `paypal-cases.test.ts`: "10 — reordered webhooks: an APPROVED after a COMPLETED is refused by compare-and-set" |
| 11 | Tampered webhook | `autoWebhook: none`; capture; deliver `PAYMENT.CAPTURE.COMPLETED` with `tamper: true`; reconcile | not asserted | not asserted | Delivery answered **200**; the single payment event row has `verification = failed`, `status = failed`; after reconcile zero rows with `processed_at` set | `paypal-cases.test.ts`: "11 — tampered webhook: stored as verification failed, never processed, 200 returned" |
| 12 | Wrong amount | `capture: wrong_amount`; capture; reconcile ×2 | `manual_review`, `last_failure_code = PAYMENT_AMOUNT_MISMATCH`, unchanged by reconcile | `unknown` | Capture route answers 200; `beds24_booking_id` kept, Beds24 booking still `new`; job `PAYMENT_AMOUNT_MISMATCH` severity 1; outbox `booking.manual_review_required`; **zero refunds** at the simulator after two passes | `paypal-cases.test.ts`: "12 — wrong amount: manual_review with PAYMENT_AMOUNT_MISMATCH, no confirmation, no refund, hold intact" |
| 12b | Wrong currency | `capture: wrong_currency` | `manual_review`, `last_failure_code = PAYMENT_CURRENCY_MISMATCH` | not asserted | — | `paypal-cases.test.ts`: "12b — wrong currency: the same refusal" |
| 13 | Capture timeout | `capture: timeout`; capture; expire; sync; `capture: success`; capture again (blind); extend hold; reconcile; capture | not `released` while unknown; `confirmed` at the end | `unknown` → `approved` (after reconcile reads the order) → `paid` | First capture answers 409 `pending_verification`; op `capture` = `outcome_unknown`; Beds24 booking still `new` after the sweep; the blind retry answers 409 and the simulator still shows **one** capture call; after reconcile a capture answers 200 | `paypal-cases.test.ts`: "13 — capture timeout: payment unknown, no release; a pass reads the order and lets a later capture through" |
| 13b | Capture executed, response lost | `autoWebhook: none`; `capture: response_lost`; capture; reconcile | `confirmed` | `unknown` → `paid` | Capture route answers 409; one capture exists at the simulator before and after reconcile (reconciliation reads the order, does not re-capture) | `paypal-cases.test.ts`: "13b — capture executed but the response was lost: reconciliation applies the capture it finds on the order"; e2e G06 |
| 14 | Finalization fails | Beds24 `finalize: failure`; capture; expire; sync; `finalize: success`; reconcile | `finalization_failed` (capture body `status`), unchanged by the sweep → `confirmed` | `paid` throughout | Outbox `booking.paid_unfinalized`; Beds24 booking `new`; job `PAID_BOOKING_UNFINALIZED` severity 1; zero refunds; after reconcile: one Beds24 booking (never a second), exactly one `booking.confirmed` | `paypal-cases.test.ts`: "14 — finalization fails: paid_unfinalized, event emitted, hold intact; fixed configuration → one pass → confirmed"; e2e G03, A07, A08 |
| 14b | Finalization lands in the wrong status | Beds24 `finalize: status_mismatch`; capture; `finalize: success`; reconcile | `paid_unfinalized`, `last_failure_code = BEDS24_FINALIZATION_UNVERIFIED` → `confirmed` | not asserted | — | `paypal-cases.test.ts`: "14b — finalization lands in the wrong status: unverified, never confirmed on the write alone" |
| 15 | Hold expiry race | Approve; expire by 1 s; capture; sync; expire by 120 s; reconcile; sync | `payment_session_created` or `awaiting_payment` after the first sync (grace period); `released` at the end | not asserted | Capture answers **410** `hold_expired`; zero captures at the simulator | `paypal-cases.test.ts`: "15 — hold expiry race: a capture after the lease is refused; before it, applied; never both"; e2e G09 |
| 16 | Refund from the dashboard | Confirm; deliver `PAYMENT.CAPTURE.REFUNDED` for the capture with `resourceOverride { id: SIM-REF-DASH1, status: COMPLETED }`; reconcile | `confirmed` (unchanged), `reconciliation_state = manual` | `refunded` | Delivery answered 200; outbox `payment.refunded`; job `PAYMENT_REFUNDED`; Beds24 booking still `confirmed` | `paypal-cases.test.ts`: "16 — a refund from the dashboard: payment refunded, booking unchanged, event emitted, escalated" |
| 17 | PENDING capture | `autoWebhook: none`; `capture: pending`; capture; expire; sync; deliver `PAYMENT.CAPTURE.COMPLETED` with `resourceOverride { status: COMPLETED }`; reconcile | `payment_pending`, unchanged by the sweep → `confirmed` | `capture_pending` → `paid` | Capture route answers 200 `paymentStatus: capture_pending`; Beds24 booking `new` after the sweep | `paypal-cases.test.ts`: "17 — PENDING capture: payment_pending, the lease refuses to release, a later COMPLETED confirms"; e2e G10 |

### Simulator-only failure modes (`describe('simulator-only failure modes')`)

| Scenario | Simulator scripting | Expected booking status | Expected payment status | Expected side effects | Test |
|---|---|---|---|---|---|
| Server error on order creation | `create_order: server_error`; order; `create_order: success`; order again | not asserted | `unknown` | First order route answers 409 `pending_verification`; op `create_order` = `outcome_unknown`; the second order request answers 409 (refused until reconciled); exactly one `POST /v2/checkout/orders` at the simulator | "a server error on order creation is uncertain: the guest waits, nothing is retried blind" |
| Malformed 200 on order creation | `create_order: malformed` | not asserted | not asserted | 409 `pending_verification`; `payment_order_id` null; op `create_order` = `outcome_unknown` | "a malformed 200 on order creation is UNCERTAIN: the order may exist, so the guest waits" |
| Token failure | `token: unauthorized` | not asserted | not asserted | Order route answers 502; zero orders at the simulator | "a token failure fails closed before any order is created" |
| Order not found at the provider | `payment_order_id` overwritten with `SIM-ORD-GONE` in SQL; capture | `payment_session_created` or `awaiting_payment` (hold stands) | not asserted | Capture route answers 400 | "booking not found at the provider: an answered 404 leaves the hold standing" |
| Already captured at the provider | The test captures directly against the simulator with its own token, then calls the capture route | `confirmed` | not asserted | Capture route answers 200; one capture at the simulator | "already captured at the provider: the adapter reads the order and reports the truth" |

Refund modes are exercised in `tests/integration/cancellation.test.ts`
rather than here: `refund: response_lost` ("K — refund response lost: unknown,
a severity-1 job, then the order read-back completes it"), `refund: timeout`
("K′ — refund timed out and never executed: read-back finds no refund, the
job keeps waiting, nothing is sent blind") and `refund: rejected` ("refund
refused by the provider: failed, escalated, and retryable only through an
explicit reset"). Refund execution is gated by
`PAYMENT_REFUND_EXECUTION_ENABLED`, which those tests set per case.

---

## 6. Beds24 unknown-outcome matrix

### How the adapter and the ledger classify a provider answer

- `lib/integrations/beds24/client.ts` turns a timeout, a network failure, a
  429, any non-2xx status and a non-JSON body into
  `ProviderError('unavailable', …)`. A 401 is retried exactly once after
  invalidating the cached token. The client does not distinguish "timed out"
  from "answered 500" at the type level; only the message differs.
- `lib/ops/external-operations.ts` `trackedCall` records every external
  mutation in `bolagio_external_operations` with one of three outcomes:
  `succeeded`; `failed` when the caller's `isDefiniteFailure` predicate
  accepts the error; otherwise `outcome_unknown`, and an
  `UncertainOperationError` is thrown. The caller must then reconcile, not
  retry.
- **SQLSTATE `BLG01`** (`supabase/migrations/20260920120000_booking_production_hardening.sql`,
  `bolagio_begin_external_operation`): a new attempt of an operation key whose
  previous row is `outcome_unknown` or `in_flight` is refused by the database
  unless the caller passes `p_allow_retry_after_unknown = true`. `trackedCall`
  passes that flag only when `retryAfterUnknown: true`, which the source
  reserves for finalize and release ("this booking is confirmed", "this
  booking holds nothing"). The same refusal is mirrored in code from the row
  the database returns, so a database without the guard still cannot be
  talked into a blind retry. Create (hold) and capture therefore cannot be
  re-sent after an unknown outcome; finalize and release can.

### The matrix

Every row is from `tests/integration/beds24-contract.test.ts` unless another
file is named. "Classified as" is what the test asserts on the operation
row or the intent; where the test asserts only the end state, the column says
so.

| Op | Mode / condition | Adapter classification (as asserted) | Ledger / intent behaviour | Test |
|---|---|---|---|---|
| hold | `success` (reference echoed) | `create_hold` succeeded (asserted in `happy-path.test.ts`) | `hold_created`; `beds24_verified_at` set; at least one `GET /bookings?id=` read-back | "reference echoed: the hold is verified against the read-back and adopted" |
| hold + read | `reference_absent` on both | not asserted | `hold_created` — verification passes on room and dates | "reference absent from the write response: the hold still verifies on room and dates" |
| hold + read | `mismatch` on both | not asserted on the op row | Intent route answers 409 `pending_verification`; `manual_review`, `BEDS24_HOLD_MISMATCH`; a second guest for the same dates gets 409 `availability_conflict`; **nothing cancelled at Beds24** | "right id, wrong room or dates: manual review, never released, never resold" |
| hold | `timeout` | `create_hold` = `outcome_unknown` (the only op row) | 409 `pending_verification`; `manual_review`, `BEDS24_HOLD_OUTCOME_UNKNOWN`; outbox `booking.manual_review_required`; a retried intent is refused (409) with **one** create POST at the simulator; after reconcile (search finds nothing) still `manual_review`, job `BEDS24_HOLD_OUTCOME_UNKNOWN`, still one POST | "write timeout: outcome unknown, manual review, local range protected, no second POST ever" |
| hold | `response_lost`, search `success` | op outcome becomes `reconciled` | 409 at first; one booking exists at the simulator; reconcile adopts it: `hold_created`, `beds24_booking_id` = the simulator's id; one create POST | "write executed, answer lost, reference echoed by search: reconciliation adopts the booking" |
| hold + search | `response_lost` + search `reference_absent` | not asserted | After two reconciles: `manual_review`; one create POST; one booking at the simulator | "write executed, answer lost, search returns no reference: escalated, never a second booking" |
| hold + search | `response_lost` + search `not_found` | not asserted | `manual_review`; one create POST | "write executed, answer lost, booking not found by search at all: escalated" |
| hold | `duplicate_result` | not asserted | `hold_created`; exactly one intent row | "duplicate result entries in the write response: the first is taken, one booking recorded" |
| hold | external block lands between quote and hold (`/__sim/block`) | no create attempted | Quote 200, then intent 409 `availability_conflict`; zero intents in a reserving status; zero bookings; zero create POSTs | "inventory changes between quote and hold: the provider refuses, the lock is unwound, nothing is orphaned" |
| hold | `blockingStatuses: ['confirmed']` (a `new` hold does not block) | not asserted | 409 `pending_verification`; `manual_review`, `BEDS24_HOLD_DID_NOT_BLOCK` | "a hold whose status does not block inventory is not a hold: manual review, not confirmed" |
| hold | `conflict` | answered failure | 409; intent status `unavailable`; zero intents in a reserving status | "a conflict answered by the provider unwinds the lock so the guest can try other dates" |
| hold | `server_error`, `malformed`, `unauthorized` | **not covered** (the client maps all three to `ProviderError('unavailable')`; how the hold saga classifies that is not asserted by any test) | — | — |
| read | `timeout` after a successful write | not asserted | `hold_created` — verification passes on the write fields | "read timeout after a successful write: verification passes on the write fields, the hold stands" |
| read | `status_mismatch` after a finalize | not asserted | `paid_unfinalized`, `BEDS24_FINALIZATION_UNVERIFIED`; `read: success` + reconcile → `confirmed` | finalization: "finalize answered with success but read back in another status: unverified, retried, never confirmed on the write" |
| read | `not_found` | **not covered** | — | — |
| search | `timeout` | **not covered** | — | — |
| finalize | `failure` (`success: false`) | definite failure (capture body `status: finalization_failed`) | `finalization_failed`, payment `paid`; outbox `booking.paid_unfinalized`; job `PAID_BOOKING_UNFINALIZED` sev 1; lease lapse does not release; zero refunds; `success` + reconcile → `confirmed`, one booking, one `booking.confirmed` | `paypal-cases.test.ts` "14 — finalization fails…"; e2e G03, A07, A08 |
| finalize | `status_mismatch` | not asserted on the op row | `paid_unfinalized`, `BEDS24_FINALIZATION_UNVERIFIED` → `confirmed` after `success` + reconcile | `paypal-cases.test.ts` "14b — finalization lands in the wrong status…" |
| finalize | `response_lost` | finalize op = `outcome_unknown` | `finalization_failed`, payment `paid`; `success` + reconcile → `confirmed`; one booking at the simulator; still exactly **one** finalize op row (the retry is permitted and lands on the same key — `BLG01` does not apply to finalize) | "finalize response lost: retried against the SAME booking id until it verifies" |
| finalize | `timeout` | not asserted on the op row | `finalization_failed`; a reconcile before the job is due leaves it; `success` + `dueNow` + reconcile → `confirmed`; zero refunds | "finalize timeout: unfinalized and retried; the hold and the payment are untouched throughout" |
| release | `success` | — | Sweep: `released`, `beds24_status = cancelled`; outbox `booking.cancelled` | "release success: verified against the calendar, released, then cancelled event" |
| release | `response_lost` | not asserted on the op row | `release_failed`; `bolagio_status_reserves(status)` is true (dates protected); outbox `booking.release_failed`; `success` + reconcile → `released`. Via the cancellation saga: outcome `release_pending`, `cancellation_completed_at` null until reconcile → `cancelled` | "release response lost: release_failed, the range stays reserved, reconciliation re-sends (idempotent) and verifies"; `cancellation.test.ts` "F/G — release outcome unknown…" |
| release | `still_closed` | answered success, verification fails | `release_failed`, `BEDS24_RELEASE_UNVERIFIED`; reconcile leaves it; after `/__sim/unblock` of the `phantom` block + `success` + `dueNow` + reconcile → `released` | "release accepted but the nights stay closed: unverified, reserved, re-checked, never advertised" |
| release | `timeout` | not asserted on the op row | `release_failed`; `success` + reconcile → `released`; exactly **two** cancel POSTs at the simulator (the re-send is permitted because release is idempotent — `BLG01` does not apply). Paid variant via the saga: `release_pending`, `release_failed`, payment `paid` → `cancelled` | "release timeout: the same, and no second cancel is sent blind while the first is unresolved"; `cancellation.test.ts` "E — a paid cancellation whose Beds24 release is unknown…" |
| offers | `timeout` | — | Playwright: "Die Live-Verfügbarkeit ist derzeit nicht erreichbar" shown; no "Verbindlich buchen"; zero intents | e2e G15 |
| offers | `unavailable`, `no_price` | **not covered** | — | — |
| calendar | `timeout`, `server_error` | **not covered** | — | — |
| token | `unauthorized`, `timeout` | **not covered** | — | — |

Where `BLG01` is observable in these tests: the hold `timeout` row (a retried
intent is refused with one POST at the simulator) and, on the PayPal side,
case 13 (a blind capture retry answers 409 with one capture call) and the
simulator-only "server error on order creation" row. The tests assert the
refusal and the single provider call; they do not assert which layer (the
SQL guard or its in-code mirror) produced it. `tests/sql/concurrency.sql` and
`tests/external-operations.test.ts` cover the guard itself.

> Note on one test: "calendar unavailable during the post-hold check: flagged
> for a later check, never torn down" sets no simulator mode — it performs a
> plain hold and asserts `hold_created`. The behaviour its title describes is
> **not covered** by that test.

---

## 7. What the simulation does not prove

The simulators prove that *this repository's code* ends in a safe, explicable
state for every answer scripted above. They do not prove the providers'
behaviour. Specifically:

- **Real PayPal contract.** The response shapes, status codes and issue
  names (`INSTRUMENT_DECLINED`, `ORDER_ALREADY_CAPTURED`, `ORDER_NOT_APPROVED`,
  `REFUND_AMOUNT_EXCEEDED`) are the simulator's rendition. Whether the
  sandbox or live API answers the same way, in the same fields, is the
  subject of `docs/paypal-sandbox-e2e.md` §3 ("the unproven shapes") and is
  not established here. The same applies to `PayPal-Request-Id` idempotency
  semantics (the simulator remembers a request id forever; PayPal's window is
  not modelled), to the buyer approval flow (never rendered) and to the
  `PENDING`/eCheck path (the simulator produces `PENDING` on request; the
  sandbox may or may not).
- **Webhook signature verification against real certificates.** The
  simulator signs with an HMAC over `transmissionId|transmissionTime|eventId|webhookId`
  using a shared secret, sets `paypal-auth-algo: SHA256withRSA` and a
  `paypal-cert-url` that is never fetched, and verifies through its own
  `/v1/notifications/verify-webhook-signature`. What is proven is that the
  application sends the right fields to the verification endpoint and honours
  its `SUCCESS`/`FAILURE` verdict (case 11). Certificate retrieval, RSA
  verification and PayPal's own verification service are not exercised.
- **Real Beds24 contract.** Which statuses block inventory on the live
  account, whether `confirmed` blocks, whether the `idempotency-key` header is
  honoured, whether `reference` is echoed, and the exact shape of write
  responses are the account-level uncertainties `docs/beds24-contract.md` §4
  records as owed to a live validation. The simulator makes each of them a
  setting or a mode; it does not resolve them. The two manual workflows
  `beds24-readonly-check.yml` and `beds24-write-test.yml` are the live
  checks.
- **Rate limits.** The PayPal simulator never answers 429. The Beds24
  simulator never answers 429 either, although `lib/integrations/beds24/client.ts`
  maps one to `ProviderError('unavailable')`. Provider rate limiting, and the
  application's behaviour under it, is not covered.
- **Timing.** `PROVIDER_TIMEOUT_MS` is shortened to 1.2–1.5 s in the
  harnesses; the fixed production timeouts (10 s / 12 s) are never exercised.
  Webhook latency is 5–140 ms; real delays of seconds to minutes are not
  modelled beyond the `delayed` plan, which no test uses.
- **Token lifecycle.** Both simulators issue a fixed token and never expire
  it. The single-401 re-authentication in the Beds24 client and PayPal token
  refresh under expiry are not exercised (the harness resets the token caches
  between tests instead).
- **Runtime.** The integration harness serves route handlers through
  `NextRequest` in a plain Node HTTP server; Playwright runs `next start`
  under Node. Neither runs the Cloudflare Worker / OpenNext runtime, its
  request headers (`cf-connecting-ip` is set by the tests), or the scheduler
  that would call `/api/booking/sync` and `/api/booking/reconcile` in
  production.
- **Browser-side PayPal SDK.** Playwright replaces `https://www.paypal.com/sdk/js`
  with a stand-in exposing `createOrder`, `onApprove`, `onCancel` and
  `onError` (`e2e/support.ts` `installFakePayPal`). The real SDK, its popup
  and its error surface are not loaded.
- **Supabase services.** The stack is Postgres + PostgREST only: no GoTrue,
  Storage, Realtime or Edge Functions. Admin password sign-in is not run; the
  Playwright suite forges an operator session cookie with the application's
  own HMAC against an operator row it inserts (`operatorSession`).
- **Outbound effects.** No email is sent (`provider: 'smtp'` completions are
  reported by the test itself), n8n never runs (the tests sign internal
  requests with the n8n HMAC), and the public enquiry endpoint
  (`https://n8n.cogniiq.co/**`) is stubbed in the browser.
- **Modes never scripted by a test** (listed in §3 and §4) are implemented
  in the simulators but prove nothing until a test uses them.

---

## 8. Playwright suite summary

Configuration (`playwright.config.ts`): three projects — `guest` (Desktop
Chrome, `e2e/guest/*.spec.ts`), `guest-mobile` (iPhone 13 emulation, Chromium,
`e2e/guest/mobile.spec.ts` only) and `admin` (Desktop Chrome,
`e2e/admin/*.spec.ts`). Each test begins with `resetAll()` (truncate the
booking tables and `bolagio_operators`, reset both simulators, re-point the
PayPal webhook target, run one sync), `isolateClient()` (a distinct
`cf-connecting-ip` per test so the per-IP limiter never couples two cases)
and, for guest specs, `installFakePayPal()`.

### Guest cases

| Id | Test title | Database / simulator assertions |
|---|---|---|
| G01 | a guest books, pays and sees "bestätigt" only once the server confirmed — with a turnover and an outbox event behind it | `payment_order_id` = created order; row `confirmed`/`paid` with `beds24_booking_id`, `payment_capture_id`, `paid_amount_cents > 0`; one `booking.confirmed` outbox event; one `required` turnover after reconcile; one capture call at the simulator |
| G02 | the same journey in English records the locale and renders English copy | row `confirmed` with `locale = en`, `guest_email = grace@example.com` |
| G03 | finalization fails at the channel manager: the guest is told "Zahlung erhalten", never "bestätigt"; one pass later it is confirmed | `finalization_failed` with `payment_status = paid` and `beds24_booking_id`; after `finalize: success` + `dueNow` + reconcile: `confirmed` |
| G04 | the buyer cancels at PayPal: the dialog returns to the payment step, the hold stands, and only the lapsed lease releases it | `payment_session_created` / `order_created` after `onCancel`; after `lapseHold` + `sweepLapsed`: `released`, payment `order_created` or `cancelled`, `payment_capture_id` null, zero captures, every Beds24 booking `cancelled` |
| G05 | declined instrument: "nichts abgebucht", payment denied, hold intact, the button is offered again | `payment_failed`/`denied`, `payment_capture_id` null; on retry one intent row, the same order id, then `confirmed`/`paid` |
| G06 | capture answer lost: the guest is told to wait and not retry; reconciliation reads the order and confirms | `payment_status = unknown` with `status = payment_session_created`; one `outcome_unknown` operation; after reconcile `confirmed`/`paid`; one capture call at the simulator |
| G07 | the webhook lands before the browser returns: the inbox applies the capture first and the browser's own capture is a harmless duplicate | capture via API 200; `paid` before the browser acts; `confirmed`/`paid`; one `to_status = 'paid'` event; one capture call |
| G08 | a double click on the payment button creates one order, and one approval confirms one booking | one order at the simulator; `payment_order_id` matches; `confirmed`; one capture call; one intent row |
| G09 | the hold lapsed while the guest dawdled at PayPal: the capture is refused, nothing is charged, the guest is told why | `released` before approval; after approval still `released`, `payment_capture_id` null; zero capture calls |
| G10 | PENDING capture: "Zahlung erhalten" is not shown as confirmed; a later COMPLETED webhook confirms | `payment_pending`/`capture_pending`; after a manual COMPLETED webhook + reconcile: `confirmed`/`paid` |
| G11 | the PayPal SDK cannot load: the guest is told nothing was charged; the hold stands; no order exists | `hold_created` with `payment_order_id` null |
| G12 | the nights go while the guest is typing: the dialog returns to the calendar, keeps the contact details, and holds nothing | zero intents in `hold_created`/`locking`; zero `hold` operations with outcome `succeeded` |
| G13 | a night already held by another guest is shown as taken and cannot be picked | (a held booking is created through the API first) the arrival day button is rendered "— belegt" and disabled; no further DB assertion |
| G14 | the price moved between quote and booking: the server re-prices, the guest sees the new total and must confirm again; nothing is charged at the old price | intent `hold_created:44300` after `nightlyCents: 19900`; one intent row after the re-confirm; one Beds24 booking; the PayPal order amount is 44300 |
| G15 | the channel manager is unreachable: live availability is reported unavailable and no intent is created | zero intents (`offers: timeout`) |
| G16 | a residence without a connected source takes the enquiry path: a request, no hold, no provider call | one stubbed enquiry call of type `booking-request` with `payment.captured = false`; zero intents; zero Beds24 booking POSTs |
| G17 | a residence in preparation only offers "Informiert werden" — no dates, no hold | zero intents |
| G18 | contact validation stops the guest before any request: bad email, no intent | zero intents; `#bk-email` and `#bk-name` carry `aria-invalid` |
| G19 | the party-size stepper clamps at the residence maximum and never below one | reads `max_guests` from `bolagio_units`; no write assertion |
| G20 | a guest abandons a held booking and starts again for the same nights: their own hold blocks them; the first hold stands | the night is shown "— belegt"; the first intent is `payment_session_created` with a `payment_order_id`; one intent row |
| G21 | on a phone the guest books and pays without horizontal overflow | `scrollWidth <= innerWidth` at three points; `confirmed`/`paid` |

### Admin cases (`e2e/admin/control.spec.ts`)

| Id | Test title | Database / simulator assertions |
|---|---|---|
| A01 | without a session, /admin redirects to the login page with noindex and no-store | redirect to `/admin/login`; `x-robots-tag` contains `noindex`; `cache-control` contains `no-store`; `GET /api/internal/health` is 401 |
| A02 | a viewer reads everything and is offered no write | no "Cancel booking…" or "Mark done" buttons for a `viewer` session; no DB write assertion |
| A03 | an operator cancels an unpaid hold: released at the channel manager, cancelled locally, audited | `cancelled` with `refund_state` in `none`/`not_required`, `cancellation_authorized_by` null; audit row `booking.cancel` outcome `cancelled` with the operator's email; every Beds24 booking `cancelled` |
| A04 | a paid booking: an operator is refused; an administrator records the refund decision and no money moves | operator sees no cancel button; admin: `cancelled`, `refund_state = required`, `cancellation_authorized_by = admin@example.com`, `payment_status = paid`; zero refund calls at the simulator; every message delivery `suppressed` |
| A05 | the cleaning board: a confirmed departure becomes a turnover; start, assign and finish are audited | `bolagio_turnover_events` = `required>in_progress,in_progress>in_progress,in_progress>done`; audit actions `turnover.status,turnover.assign,turnover.status` |
| A06 | the automations board: a failed guest message is listed and requeued once; the ledger refuses a second send | delivery row back to `pending`; audit `delivery.requeue` outcome `ok` |
| A07 | the System page: integration signals never observed stay grey, and the reconciliation button is the scheduler's pass | after "Run one reconciliation pass": the `finalization_failed` booking is `confirmed`; audit `reconciliation.pass` outcome `ok` |
| A08 | "Reconcile now" on a paid, unfinalized booking finishes the job the sweep would | `finalization_failed` before; `confirmed` with `beds24_booking_id` after; audit `booking.reconcile` outcome `moved` |

### Integration files not in the matrices

- `tests/integration/happy-path.test.ts` — the disabled gate
  (`DIRECT_BOOKING_ENABLED=false` → 403 on config and intent, zero intents,
  zero Beds24 POSTs), calendar sync (`> 300` days, all available), live quote
  (`14000 × 2 + 4500` with components `accommodation`, `fee:endreinigung`;
  409 `availability_conflict` after an external block), the full happy path
  (§5 case 1) and the status route (no personal data; unknown reference → 400).
- `tests/integration/cancellation.test.ts` — cases A, B, B′, C, D/H, E, F/G,
  I, J, K, K′, L, M and "never auto-refunds" through `cancelBooking` and
  `executeRefund` directly.
- `tests/integration/messaging.test.ts` — the signed `/api/internal/messages`
  and `/api/internal/outbox` endpoints: exactly-once send, backoff, suppression
  on cancellation, unrenderable template, test-transport refusal on
  `APP_ENV=staging`, English rendering, claim → ack once.
- `tests/integration/admin-ops.test.ts` — cleaning board, automations board,
  outbox requeue, integration-signal health verdict and the `REFUND_ATTENTION`
  critical alert, through `lib/admin/queries` and `lib/booking/commands`
  directly.
