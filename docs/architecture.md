# BoLaGio — system architecture

The map of the whole system after the 2026-09-20 production-readiness pass.
Each section points at the code that implements it; nothing here describes an
intention that is not in the repository.

## 1. Authority

| System | Authoritative for | Never for |
|---|---|---|
| Postgres (Supabase) | booking and payment state, transitions, concurrency, idempotency, audit, outbox, inbox, operation ledger, reconciliation queue, heartbeat, turnovers | availability at other channels, money |
| Beds24 | inventory across Booking.com / Airbnb / direct; the external reservation | our state |
| PayPal | whether money moved | our state |
| Next.js on Cloudflare | the synchronous guest path, the operator interface | any truth of its own |
| Supabase Edge Function | durable PayPal webhook ingress | processing |
| n8n | messages, invoices, alerts, cleaning routing | any state change |
| Browser | rendering server answers | anything |

Enforced, not promised: a status change outside `bolagio_booking_transition()`
raises (trigger); `paid` is reachable only through
`bolagio_record_payment_capture()`; every external mutation is recorded before
it is sent and cannot be re-sent while its outcome is unknown (`BLG01`); n8n's
API has no state-changing action; the admin's only writes call the
reconciliation engine.

## 2. Modules

```
lib/config/environment.ts      local|preview|staging|production, fail-closed contradictions
lib/booking/config.ts          every secret read, at request time; the two-lock launch gate
lib/booking/states.ts          the machines (mirror of SQL; tests parse the migrations)
lib/booking/service.ts         availability, quote, startBooking, sweep, sync
lib/booking/hold.ts            lock locally → live re-check → tracked hold → read back → verify blocked
lib/booking/payments.ts        order (guards) → capture (guards) → applyCapture → finalize; event processor
lib/booking/finalization.ts    paid → finalizing → update SAME Beds24 booking → read back → confirmed
lib/booking/release.ts         releasing → cancel → verify calendar → released | release_failed
lib/booking/lease.ts           may an expired hold be released? four blocks + grace period
lib/booking/reconciliation.ts  inbox → sweep → queue, read-before-write handlers
lib/booking/operations.ts      turnovers + guest events (after each reconcile)
lib/booking/property-config.ts house rules, timing, portfolio reference (no secrets)
lib/ops/external-operations.ts the operation ledger and trackedCall
lib/ops/alerts.ts              CRITICAL/HIGH/MEDIUM derivation, unknown stays unknown
lib/integrations/beds24/*      adapter (live + mock), mapper, client, auth
lib/payments/paypal/*          adapter, mapper, client
lib/n8n/*                      HMAC, the narrow internal API
lib/admin/*                    Control: auth, session, preview, queries, attention, headers
app/api/booking/*              guest routes + sync + reconcile
app/api/internal/*             outbox, booking context, health (HMAC)
app/api/webhooks/*             beds24 (signal only), paypal (fallback ingress)
supabase/functions/paypal-webhook  primary ingress
supabase/migrations/*          the authority
supabase/ops/*                 preflight, verify, rollback
```

## 3. The guest path

```
GET availability (cache)  →  POST quote (live Beds24)  →  POST intent
   gate: DIRECT_BOOKING_ENABLED && environment has no contradiction && unit.is_bookable
   → idempotency key → quoted → LOCK (exclusion constraint) → live offer
   → tracked POST /bookings (uncertain = manual_review, never retried)
   → read back → calendar closed? → hold_created (lease = 15 min)
POST payment/order   guards: payable state, lease not expired, quote fresh, no money in motion
                     reuse existing order (read from PayPal) or create with deterministic request id
POST payment/capture guards: payable state, lease not expired, payment not unknown
                     capture → bolagio_record_payment_capture (amount, currency, order, dedup)
                     → paid → finalize (same Beds24 id) → confirmed → outbox booking.confirmed
```

Time: the guest-facing gate closes at `hold_expires_at`; the sweep releases
only `BOOKING_LEASE_GRACE_SECONDS` later, so the two cannot cross.

## 4. Asynchronous paths

* **Webhook**: Edge Function verifies against PayPal, stores deduplicated on
  event id, 2xx. Reconciliation processes.
* **Reconcile** (every 3 min): inbox → sweep (`locking`, held/payable states,
  `expired`, paid-side, releasing, manual) → queue by severity. Handlers read
  the provider before any write. Then the operations pass.
* **Sync** (every 30 min): lease sweep through `evaluateLease`, then cache.
* **Outbox → n8n**: claim (lease, skip locked) → ack/fail, dead-letter at 8.

## 5. What is measured

Heartbeat per job; queues; attention; alerts; configuration findings. Exposed
on `/admin/system` and `GET /api/internal/health`. Not measured: provider
reachability (no live probe), n8n internals.

## 6. Documents

| Topic | File |
|---|---|
| state machines | `booking-state-machine.md` |
| reconciliation | `booking-reconciliation.md` |
| PayPal | `payment-paypal.md`, `paypal-sandbox-e2e.md` |
| Beds24 | `beds24-contract.md`, `beds24-write-test-plan.md` |
| n8n | `n8n-booking-contract.md` |
| environments / secrets | `environments.md` |
| Cloudflare | `cloudflare-deployment.md` |
| database | `supabase-migration-runbook.md` |
| schedulers | `schedulers.md` |
| guest ops / cleaning | `guest-operations.md` |
| admin | `admin-control.md` |
| incidents | `incident-runbooks.md` |
| launch | `production-readiness.md` |

Added in the platform-completion phase: `docs/platform-completion-delta.md`
(what changed and why), `docs/platform-completion-report.md` (the final
report), `docs/cancellation.md`, `docs/guest-messaging.md`,
`docs/cleaning-operations.md`, `docs/provider-simulation.md`,
`docs/invoicing.md`, `docs/data-retention.md`, `docs/supabase-shared-project.md`,
`docs/security/2026-09-21-platform-completion-review.md`, and the automation
package under `n8n/`.
