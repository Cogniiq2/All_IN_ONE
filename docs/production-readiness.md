# Production readiness — go / no-go

State on 2026-09-20. Direct booking is OFF (`DIRECT_BOOKING_ENABLED` unset,
`is_bookable=false` everywhere). This document is the single list of what
stands between the repository and a real booking.

| Area | Verdict | What decides it |
|---|---|---|
| Admin (BoLaGio Control) in production | **READY AFTER CONFIG** | dedicated Supabase project, migrations applied, `ADMIN_SESSION_SECRET`, `SUPABASE_ANON_KEY`, one operator row |
| Database migration | **READY** (procedure) / not applied | `docs/supabase-migration-runbook.md`; project decision (§6 there) |
| PayPal | **REQUIRES SANDBOX VALIDATION** | `docs/paypal-sandbox-e2e.md`, 17 cases |
| Beds24 | **REQUIRES CONTROLLED LIVE VALIDATION** | `docs/beds24-contract.md` §4 — needs your approval |
| n8n | **READY AFTER CONFIG** (contract) / workflows not built | `docs/n8n-booking-contract.md` §6 |
| Direct booking | **BLOCKED** | every row above, plus legal (§3) |
| Production launch | **BLOCKED** | as above |

## 1. Order of manual steps

1. Decide the Supabase project (recommendation: dedicated). Create it.
2. Run `supabase/ops/preflight.sql` there; apply the five migrations; run
   `verify.sql`; run the seed.
3. Deploy the Edge Function with sandbox PayPal values to the **staging**
   project; create the staging worker (`--env staging`) with the secret
   matrix; `check-env.mjs` exit 0.
4. Create the `pg_cron` jobs on staging; confirm three heartbeats on
   `/admin/system`.
5. Approve and run the controlled Beds24 validation
   (`docs/beds24-contract.md` §4). Record results; set
   `BEDS24_CONFIRMED_STATUS` from row 9.
6. Run the PayPal sandbox E2E on staging (`docs/paypal-sandbox-e2e.md`).
   Record results in `docs/payment-paypal.md` §8.
7. Build the n8n event pump, guest confirmation, operational alerts and
   queue-health workflows against staging; verify `booking.confirmed` sends
   exactly once; verify `/api/internal/health` is polled.
8. Legal (§3).
9. Production: project, migrations, Edge Function with **live** PayPal app and
   webhook, worker `--env production` with live values, cron jobs, WAF rules
   (`docs/cloudflare-deployment.md` §5), alerting on `counts.CRITICAL`.
10. `DIRECT_BOOKING_ENABLED=true`; `is_bookable=true` for **one** unit; one
    real low-value booking on a near date; watch a full day; second unit.

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
