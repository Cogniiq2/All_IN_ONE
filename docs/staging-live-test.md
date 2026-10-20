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

## 2. The approved test (to be filled in by the owners)

| | Proposed | Approved by / at |
|---|---|---|
| Apartment | Schulstraße II — Beds24 property 354658, room 731146 | |
| Dates | arrival Tue 19 Jan 2027, departure Thu 21 Jan 2027 (2 nights) | |
| Party / setup | 1 adult, 1 Schlafzimmer | |
| Why these | no reservation overlaps them in either apartment (checked 20 Oct 2026, 10:30 UTC); a low-demand midweek in January; within Booking.com's and (normally) Airbnb's open calendar | |
| Side effect accepted | the two nights are closed on Booking.com and Airbnb from the hold until the cancellation (target: under 1 hour) | |

Re-check the dates are still free immediately before the test.

## 3. Prerequisites (owner actions)

Cloudflare, worker `bolagio-staging` (**Encrypt** every value, so a deploy
from `wrangler.jsonc` cannot wipe it): `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` (sandbox app), and check that
`BEDS24_REFRESH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_SYNC_SECRET`,
`ADMIN_SESSION_SECRET`, `N8N_INTERNAL_SECRET` and `MESSAGING_CONTACT_EMAIL`
exist. PayPal developer dashboard → sandbox app → Webhooks →
`https://bolagio-staging.popovic-lazar0603.workers.dev/api/webhooks/paypal`
(events listed in `docs/paypal-sandbox-e2e.md`). n8n (staging):
`BOLAGIO_MESSAGING_TRANSPORT=smtp` with the "BoLaGio SMTP" credential and a
test inbox as the guest e-mail — or `test` to prove "exactly once" without
mail leaving.

Beds24: no Auto Action may e-mail on these bookings (the API booking source
is `BoLaGio Direct`). Beds24's own "Booking Confirmation" message is sent only
for bookings made on the Beds24 booking page, so it does not apply.

## 4. Steps and evidence

Record a UTC timestamp and a screenshot or query result for each.

1. Control → System → Test bookings → allow. Confirm the System page shows no
   `DIRECT_BOOKING_*` or `LEGAL_*` refusal.
2. Book the approved stay on the staging site; pay with a PayPal **sandbox
   personal account**. Expect `/booking/confirmed`.
3. Beds24 → the booking: property/room, dates, guest, total, referer
   `BoLaGio Direct`, status `confirmed`, notes `BoLaGio BLG-…`.
4. Staging site, a private window: the two nights show as taken.
5. Booking.com extranet calendar and Airbnb host calendar: both nights closed
   (screenshots, with the time).
6. Second attempt, same unit and dates, from the tester browser: "these dates
   have just been taken", nothing new in Beds24.
7. Control → the booking → messages: one `booking_confirmation`, status `sent`
   (or `skipped` under the `test` transport), sequence 1; the test inbox has
   exactly one mail.
8. Abandoned payment: start a booking for the same unit on the next free
   night pair, close the PayPal window. The hold is released after the lease
   (`BOOKING_HOLD_MINUTES`, default 15, plus the grace period): Beds24 shows the
   booking `cancelled`, the nights reopen; no confirmation mail.
9. Cancel the approved test booking in Control → the booking → Cancel, as an
   administrator (`OPERATOR_PAID_CANCELLATION_ENABLED=true` is set on staging
   only), refund decision "not required" (sandbox money; refund execution
   stays off). The saga cancels the Beds24 booking and verifies the nights
   reopened before the booking reads `cancelled`. Do **not** cancel it in
   Beds24 by hand: our copy would stay `confirmed` and keep the nights locked
   on the website. Then confirm Booking.com and Airbnb reopen both nights.
10. Control → System → Test bookings → stop.

Anything not directly observed is recorded as **not verified**.
