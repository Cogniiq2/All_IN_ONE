# Staging: the live direct-booking test

The one test that proves a website booking reaches Beds24 and closes the
nights on Booking.com and Airbnb. It writes to the **real Beds24 account**;
the money is PayPal **sandbox**. Nothing here may run before the owners have
approved the exact apartment and dates (§2).

## 1. What staging is configured to do

| | Value | Where |
|---|---|---|
| `APP_ENV` | `staging` | `wrangler.jsonc` → `env.staging.vars` |
| `BEDS24_MODE` | `live` (the real account) | same |
| `DIRECT_BOOKING_ENABLED` | `true` | same |
| `PAYPAL_MODE` | `sandbox` (`live` is refused on staging: `LIVE_PAYPAL_ON_STAGING`) | same |
| `OPERATOR_PAID_CANCELLATION_ENABLED` | `true`: an administrator may cancel the paid test booking through the saga | same |
| `BOOKING_TEST_TERMS` | `true`: the checkout shows texts labelled "TESTBEDINGUNGEN — keine gültige Regelung" (refused on production) | same |

The launch gate stays **shut** until every secret below exists
(`scripts/check-env.mjs` names what is missing). With it shut, every visitor
gets the live calendar and the request flow.

**The tester gate** (`lib/booking/tester.ts`). Even with the launch gate open,
on any non-production deployment that talks to the real Beds24, only a
browser holding a tester cookie may create a hold. An administrator issues it
in BoLaGio Control → System → *Test bookings* → "Allow test bookings in this
browser" (audited as `booking_tester.on`; valid 12 hours). Every other visitor
— including anyone who finds the staging URL — keeps the request flow and
writes nothing to Beds24.

**The books.** A booking concluded under the TEST terms is skipped by the
finance ingestion (`isStagingTestBooking`, `lib/finance/ingestion-rules.ts`):
no revenue, no receipt, no refund is posted for sandbox money. The Beds24
copy of the booking is imported into `bolagio_reservations` like any other;
once cancelled it counts as a cancellation without charge.

## 2. The approved test

| | Approved | |
|---|---|---|
| Apartment | Schulstraße II — Beds24 property 354658, room 731146 | approved by the owner, 2026-11-06, conditionally (below) |
| Dates | arrival Tue 19 Jan 2027, departure Thu 21 Jan 2027 (2 nights) | |
| Party / setup | 1 adult, 1 Schlafzimmer | |
| Side effect accepted | the two nights are closed on Booking.com and Airbnb from the hold until the cancellation (target: under 1 hour) | |

Conditions of the approval: every prerequisite verified first; availability
re-checked immediately before; sandbox money only; no production, pricing or
existing reservation touched; the test kept out of financial reporting; the
cancellation and release proven; evidence from Beds24, Booking.com, Airbnb,
PayPal and Supabase; every channel open again at the end. **Any missing
prerequisite means no booking.**

Enforced in code, not only here: on staging the booking API accepts **only**
this unit and these dates (`lib/booking/live-test-stay.ts`,
`requireApprovedTestStay`), and the tester unlock refuses unless the
preflight is GO.

## 3. Prerequisites (owner actions)

See the checklist in the session report of 2026-11-06; in short:
Cloudflare `bolagio-staging` secrets (encrypted): `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` (sandbox app), `MESSAGING_CONTACT_EMAIL`,
and present already: `BEDS24_REFRESH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`,
`BOOKING_SYNC_SECRET`, `ADMIN_SESSION_SECRET`, `N8N_INTERNAL_SECRET`.
PayPal sandbox webhook →
`https://bolagio-staging.popovic-lazar0603.workers.dev/api/webhooks/paypal`
(the Supabase Edge Function `paypal-webhook` is **not** deployed in this
project, so the worker route is the one to register). n8n: the isolated
**BoLaGio STAGING** workflows, set up per
`n8n/runbooks/staging-isolated-setup.md`, with
`BOLAGIO_STAGING_MESSAGING_TRANSPORT=smtp` and a guest e-mail address you own
(the `test` transport is refused by the backend on staging). Beds24: no Auto
Action e-mailing bookings from `BoLaGio Direct`.

## 4. Steps and evidence

Record a UTC timestamp and a screenshot or query result for each.

0. **Preflight.** Control → System → *Test bookings*: the *Live test
   preflight* must read **GO** (configuration, Beds24 calendar and bookings for
   the dates, database, reconciliation heartbeat). Screenshot it. Screenshot
   Booking.com and Airbnb showing both nights open. Refresh the preflight
   immediately before step 2.
1. Control → System → Test bookings → *Allow test bookings in this browser*
   (refused unless GO).
2. **Abandoned payment first**, on the approved dates, guest e-mail
   `<test inbox>+abandon@…`: go to the PayPal window, close it without paying.
   Expect: a Beds24 booking `new` appears; after the lease
   (`BOOKING_HOLD_MINUTES`, default 15, plus the grace period) reconciliation
   releases it — Beds24 `cancelled`, the nights free again on the website, no
   confirmation mail, the intent `released`/`expired`.
3. **Paid booking**, guest e-mail `<test inbox>+paid@…` (a different e-mail,
   so it is a new booking rather than a replay of step 2): pay with a PayPal
   **sandbox personal account**. Expect `/booking/confirmed`.
4. Beds24 → the booking: property/room, dates, guest, total, referer
   `BoLaGio Direct`, status `confirmed`, notes `BoLaGio BLG-…`.
5. Staging site, a private window: the two nights show as taken.
6. Booking.com extranet calendar and Airbnb host calendar: both nights closed
   (screenshots, with the time).
7. Second attempt, same unit and dates, from the tester browser: "these dates
   have just been taken"; nothing new in Beds24.
8. **E-mail.** Within about two minutes of step 3 the test inbox receives
   exactly **one** "Ihre Buchung BLG-… bei BoLaGio ist bestätigt" (or the
   English one), with the right dates, nights, total "per PayPal bezahlt"
   and the TEST terms. Control → the booking → messages: one
   `booking_confirmation`, `sent`, provider `smtp`, sequence 1. n8n: one
   green Guest Message execution for the reference. No mail arrived for the
   abandoned attempt of step 2. Re-run the pump by hand once: it claims
   nothing new and no second mail arrives. PayPal sandbox dashboard: one
   capture for the total.
9. Finance: no `bolagio_finance_payments` row and no revenue transaction for
   the reference (TEST terms → skipped).
10. Cancel in Control → the booking → Cancel, as an administrator, refund
    decision "not required" (sandbox money; refund execution stays off). The
    saga cancels the Beds24 booking and verifies the nights reopened before the
    booking reads `cancelled`. Do **not** cancel it in Beds24 by hand: our copy
    would stay `confirmed` and keep the nights locked on the website.
11. Beds24 `cancelled`; website, Booking.com and Airbnb show both nights open
    again (screenshots, with the time).
12. Control → System → Test bookings → stop.

Anything not directly observed is recorded as **not verified**.
