# Production readiness — go / no-go

State on **2026-09-24**, end of the production-readiness sprint
(was 2026-09-21, platform completion). Direct booking is
OFF (`DIRECT_BOOKING_ENABLED` unset, `is_bookable=false` everywhere outside
test data). This document is the single list of what stands between the
repository and a real booking. The exhaustive report is
`docs/platform-completion-report.md`.

| Area | Verdict | What decides it |
|---|---|---|
| Booking core, cancellation saga, refund ledger | **READY** (code, real-database and simulator proof) | `docs/platform-completion-delta.md`; every automatic path proven; refund execution gated off |
| Admin (BoLaGio Control) incl. cleaning, automations, cancellation | **READY AFTER CONFIG** | migrations applied to the shared project, `ADMIN_SESSION_SECRET`, `SUPABASE_ANON_KEY`, operator rows; `OPERATOR_PAID_CANCELLATION_ENABLED` decided |
| Database migration (six files) on the **shared** Supabase project | **READY** (procedure, rehearsed on a throwaway cluster) / not applied | `docs/supabase-shared-project.md` §2, `docs/supabase-migration-runbook.md` |
| Guest messaging | **READY AFTER CONFIG** | `MESSAGING_CONTACT_EMAIL/PHONE`, the SMTP credential in n8n, a real send on staging (`n8n/test-mode.md`) |
| n8n | **READY AFTER IMPORT** (six workflows generated and validated; never imported into a real instance) | `n8n/README.md` §4–5, `n8n/runbooks/staging-activation.md` |
| PayPal | **REQUIRES SANDBOX VALIDATION** (17 cases proven against a simulator, not against PayPal) | `docs/paypal-sandbox-e2e.md`; refund contract additionally unvalidated (`REFUND_EXECUTION_UNVALIDATED`) |
| Beds24 | **REQUIRES CONTROLLED LIVE VALIDATION** (contract proven against a simulator) | `docs/beds24-contract.md` §4 — needs your approval; cancellation of a confirmed reservation is included |
| CI | **READY** (no credential in CI; live checks stay manual) | `.github/workflows/ci.yml` |
| Invoicing | **BLOCKED** on tax decisions | `docs/invoicing.md` §5 |
| Data retention | **DOCUMENTED**, nothing automated | `docs/data-retention.md` |
| Canonical reservations (Beds24 → Supabase) | **LIVE AND PROVEN** | 16 real Booking.com reservations imported; idempotency proven; webhook proven live for both properties (`docs/beds24-webhook.md`) |
| Reservation safety net | **READY AFTER CONFIG** | hourly job now in `ops/staging/cron.sql`; run the first import by hand, then schedule |
| Operating performance (`/admin/performance`) | **READY** | reads the verified reservations; gross only, commission/payout marked unavailable |
| Guest Privileges (QR loyalty) | **READY AFTER CONFIG** | migration + n8n email template + campaign row + legal §7/§8; redemption deliberately not wired (`docs/guest-privileges.md` §7) |
| Legal register | **OPEN** | `LEGAL_REVIEW_REQUIRED.md` — 12 items, 8 of them launch-blocking |
| Direct booking | **BLOCKED** | every row above, plus legal (§3) |
| Production launch | **BLOCKED** | as above |

## 1. Order of manual steps

1. **Shared Supabase project, staging first.** Run
   `supabase/ops/shared_project_inventory.sql`, then
   `shared_project_preflight.sql`; apply the six migrations in order; run
   `verify.sql` and `shared_project_verify.sql`; run the seed
   (`docs/supabase-shared-project.md` §2). Optionally apply
   `bolagio_app_role.sql` and mint the narrower JWT for the worker (§4 there).
2. **Staging worker and Edge Function.** `ops/staging/.env.staging.example`
   → real values; `node --experimental-strip-types ops/staging/validate-staging-config.mjs <file>`
   exit 0; `wrangler secret put` per `ops/staging/secrets-checklist.md`;
   `supabase functions deploy paypal-webhook` per `ops/staging/edge-function-deploy.md`.
3. **Schedules.** `ops/staging/cron.sql`; confirm three heartbeats on
   `/admin/system` and `ops/staging/health-check.sh` exit 0.
4. **Beds24 controlled live validation** (`docs/beds24-contract.md` §4),
   now including: hold → finalize → **cancel a confirmed reservation** →
   verify the nights reopen. Record results; set `BEDS24_CONFIRMED_STATUS`.
5. **PayPal sandbox E2E** (`docs/paypal-sandbox-e2e.md`, 17 cases) on
   staging, plus the refund case: capture, refund from the sandbox
   dashboard, confirm the `PAYMENT.CAPTURE.REFUNDED` webhook settles the
   ledger. Only then may `PAYMENT_REFUND_EXECUTION_ENABLED` be considered.
6. **n8n.** Import the six workflows (`n8n/README.md` §4), set the
   `BOLAGIO_*` environment and credentials (§5, `n8n/credentials-matrix.md`),
   activate in the order of `n8n/runbooks/staging-activation.md`; send one
   `booking_confirmation` to a test mailbox with `MESSAGING_TEST_COMPLETIONS_ALLOWED`
   **unset**; check the row in `/admin/automations` reads `sent`.
7. **Smoke** on staging: `ops/staging/smoke-test.sh`.
8. Legal (§3) and tax (`docs/invoicing.md` §5).
9. **Production**: same six migrations (already present if the project is
   shared with staging — verify with the inventory diff), worker
   `--env production` with live PayPal, live webhook id, cron jobs, WAF rules
   (`docs/cloudflare-deployment.md` §5), alerting on `counts.CRITICAL` from
   `/api/internal/health`.
10. `DIRECT_BOOKING_ENABLED=true`; `is_bookable=true` for **one** unit; one
    real low-value booking on a near date; cancel it through Control and
    confirm the refund path end to end; watch a full day; second unit.

## 2. Beds24 account settings (not code)

- [ ] Overbooking Protection on.
- [ ] Booking.com auto-replenishment reviewed.
- [ ] Auto Actions re-checked (none on booking creation, or accepted).
- [ ] Outgoing email deliberately configured or off.
- [ ] Webhook registered with `BEDS24_WEBHOOK_SECRET`.

## 3. Legal and commercial — Germany (flagged, not answered)

- [ ] AGB cover a concluded direct booking; cancellation policy shown before
      payment (`BookingQuote.cancellationPolicy` renders what Beds24 returns; if
      nothing is returned, nothing is shown — a consumer-law gap).
- [ ] Total price is the total (Kurtaxe, deposits visible before payment).
      Nothing computes tax; `taxCategory` only records what Beds24 said.
- [ ] Payment button wording ("zahlungspflichtig bestellen" semantics) — the
      PayPal button is PayPal's; the surrounding copy is ours and needs review.
- [ ] Widerrufsrecht exemption wording (§ 312g Abs. 2 Nr. 9 BGB) confirmed.
- [ ] Privacy notice: PayPal, Beds24, Supabase, Cloudflare as processors;
      retention of booking data (tax law vs. GDPR minimisation). No "delete
      guest" function exists on purpose; retention is documented, not automated.
- [ ] Meldeschein handled outside the checkout.
- [ ] Invoicing on `booking.confirmed` (n8n), VAT treatment decided.
- [ ] Local accommodation tax, if applicable in Bayreuth, modelled as a quote
      component from Beds24 or shown as payable on site.
- [ ] TDDDG/DDG: no cookies or tracking are set by the booking flow; the PayPal
      SDK loads only after the guest reaches the payment step and is
      disclosed in the privacy notice.

## 4. Turning it off

`DIRECT_BOOKING_ENABLED=false` and redeploy, or `is_bookable=false` per unit
(no deploy). Keep the schedule running.

---

## 5. The system, end to end

```
  Booking.com ─┐
  Airbnb ──────┼──►  BEDS24  ◄── the availability + reservation authority
  Beds24 UI ───┘       │  ▲
                       │  └──── GET only from BoLaGio on this path.
       webhook (signal)│       Nothing here ever writes a reservation.
                       ▼
        ┌──────────────────────────────────────────────┐
        │  CLOUDFLARE WORKER  (Next.js via OpenNext)   │
        │                                              │
        │  /api/webhooks/beds24   signal → fresh GET   │
        │  /api/booking/reservations/sync   hourly net │
        │  /api/booking/sync      inventory, 30 min    │
        │  /api/booking/reconcile saga, 3 min          │
        │  /api/guest/privileges/*  QR signup + verify │
        │  /admin/*   BoLaGio Control (session-gated)  │
        └───────────────┬──────────────────────────────┘
                        │ service role only
                        ▼
        ┌──────────────────────────────────────────────┐
        │  SUPABASE / POSTGRES — operational authority │
        │                                              │
        │  bolagio_reservations      what IS booked    │
        │  bolagio_unit_inventory_days  is it free     │
        │  bolagio_booking_intents   direct checkout   │
        │  bolagio_finance_*         accounting truth  │
        │  bolagio_guest_identities  privileges + consent│
        │  bolagio_outbox_events  →  n8n               │
        │  pg_cron + pg_net          all three schedules│
        └───────────────┬──────────────────────────────┘
                        │ outbox (references, never PII)
                        ▼
                  n8n  → SMTP → guest
                        
  PayPal ──► /api/webhooks/paypal (or the Edge Function — exactly ONE)
             direct booking only, and currently gated OFF
```

Two authorities, deliberately not merged:

* **Beds24** decides what is booked and what is free.
* **Supabase** is the operational record of everything BoLaGio does about it.

Two kinds of money truth, deliberately not merged:

* **`/admin/performance`** — gross booking value from the channel manager.
  Operational, available immediately, never netted.
* **`/admin/finance`** — reconciled, VAT-correct, defensible. Fed by imports
  and documents, never by a channel read.

## 6. Rollback

| To stop | Do this | Deploy needed? |
|---|---|---|
| Direct booking, everywhere | `DIRECT_BOOKING_ENABLED=false` | yes |
| Direct booking, one unit | `update bolagio_units set is_bookable=false where slug='…'` | no |
| The real-time reservation webhook | remove the webhook in Beds24, **or** unset `BEDS24_WEBHOOK_SECRET` (the endpoint then refuses everything) | secret: yes |
| The hourly reservation import | `select cron.unschedule(jobid) from cron.job where jobname='bolagio-reservation-sync';` | no |
| A privileges campaign | `update bolagio_privilege_campaigns set active=false where code='…'` | no |
| All privileges signups | `update bolagio_privilege_campaigns set active=false` — signup still works and still verifies, but earns no grant | no |

**Never disable the reconcile schedule when disabling booking.** Held and paid
bookings still need finalizing and releasing; stopping the schedule strands
them.

Nothing on this branch deletes data. Turning a feature off leaves every row in
place, so turning it back on is the same switch in the other direction.
