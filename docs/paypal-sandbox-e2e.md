# PayPal sandbox — the end-to-end run

**Not executed.** Every step below uses sandbox credentials only and touches
no live account. It needs your PayPal Developer account and a staging
deployment; nothing in this repository can run it unattended.

## 0. Preconditions

* A **staging** Supabase project with all five migrations applied and verified.
* A staging worker (`wrangler deploy --env staging`) with:
  `APP_ENV=staging`, `BEDS24_MODE=live`, `BEDS24_REFRESH_TOKEN`,
  `PAYPAL_MODE=sandbox`, sandbox `PAYPAL_CLIENT_ID/SECRET`,
  `PAYPAL_WEBHOOK_ID` (below), `BOOKING_SYNC_SECRET`, `N8N_INTERNAL_SECRET`,
  `ADMIN_SESSION_SECRET`, `SUPABASE_*`.
* The Edge Function deployed to the staging project with the same four PayPal
  values: `supabase functions deploy paypal-webhook --no-verify-jwt`.
* `node --experimental-strip-types scripts/check-env.mjs .env.staging` exits 0
  with `DIRECT_BOOKING_ENABLED=true`.
* The Beds24 unit used is Schulstraße I on a date ≥ 60 days out, and the
  controlled Beds24 validation (`docs/beds24-contract.md` §4) has passed.
  **This run creates real Beds24 holds on the real account** (the test
  property has no sandbox). Every hold is released by the flow or by hand.
* `bolagio_units.is_bookable = true` for `schulstrasse-i` **in staging only**.

## 1. Dashboard

1. Developer Dashboard → Sandbox → Apps → create "BoLaGio staging". Copy id and secret.
2. Webhooks → add `https://<staging project>.supabase.co/functions/v1/paypal-webhook`, events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CHECKOUT.ORDER.APPROVED`, `CUSTOMER.DISPUTE.CREATED`. Copy the webhook id into **both** stores.
3. Sandbox → Accounts → a personal buyer account with a balance; note its login.

## 2. The scripted cases

Run each from the staging site; observe with the admin (Payments, the booking page, System) and the SQL in `docs/incident-runbooks.md`.

| # | Case | Do | Expect |
|---|---|---|---|
| 1 | Happy path | book, pay with the buyer account, stay on the page | `paid` within seconds, `confirmed` after finalization; `booking.confirmed` in the outbox; Beds24 shows the booking in `BEDS24_CONFIRMED_STATUS`; one verified `PAYMENT.CAPTURE.COMPLETED` row marked `duplicate` or processed |
| 2 | Webhook before return | throttle the browser (DevTools offline) right after approving, restore after 30 s | the inbox processes the capture first; the browser's capture returns `duplicate`; one `paid_at` |
| 3 | Browser closes after approval | approve, close the tab | the webhook alone moves it to `paid` → `confirmed` within one pass |
| 4 | Browser closes after capture | close during "confirming" | same end state; no second capture in PayPal |
| 5 | Double submit | click Pay twice fast; open the same booking in two tabs | one order id in PayPal (`PayPal-Request-Id`), one capture |
| 6 | Refresh the return page | refresh repeatedly | capture endpoint answers idempotently; no new order |
| 7 | Cancel at PayPal | cancel in the PayPal window | `payment_cancelled`; hold stands; after lease + grace the sweep releases it and Beds24 reopens the night |
| 8 | Declined instrument | buyer with the "decline" test card | `payment_failed`, `denied`; retry with a good funding source on the **same** order → `paid` (`denied → paid`) |
| 9 | Duplicate webhook | Dashboard → Webhooks → resend the COMPLETED event twice | `duplicate: true`; no state change |
| 10 | Reordered webhooks | resend `CHECKOUT.ORDER.APPROVED` after `COMPLETED` | refused by compare-and-set; booking stays `confirmed` |
| 11 | Tampered webhook | `curl` the Edge Function with a copied body and wrong `paypal-transmission-sig` | row with `verification='failed'`, never processed; 200 returned |
| 12 | Wrong amount | temporarily change `quoted_total_cents` on a `hold_created` row by one cent, then pay | `manual_review`, `PAYMENT_AMOUNT_MISMATCH`, severity-1 job, no confirmation, no refund |
| 13 | Capture timeout | set an unreachable proxy for the worker's egress during capture (or block `api-m.sandbox.paypal.com` in the WAF for one minute) | `payment_status='unknown'`, no release; a pass reads the order and applies the capture |
| 14 | Finalization fails | set `BEDS24_CONFIRMED_STATUS=nonsense` for one attempt | `paid_unfinalized` / `finalization_failed`, `booking.paid_unfinalized` in the outbox, hold intact; fix the value, one pass → `confirmed` |
| 15 | Hold expiry race | pay at the last second of the lease (`BOOKING_HOLD_MINUTES=5` on staging) | capture refused with `hold_expired` after the lease, or applied before it; never a paid booking that the sweep then releases |
| 16 | Refund | refund case 1 from the dashboard | `PAYMENT.CAPTURE.REFUNDED` → `payment_status='refunded'`, booking unchanged, `payment.refunded` in the outbox, job escalated |
| 17 | PENDING | if the sandbox can produce it (eCheck buyer) | `payment_pending`, `capture_pending`; lease refuses to release; later COMPLETED → `paid` |

## 3. What to confirm in the responses (the unproven shapes)

* `POST /v2/checkout/orders` returns `id` and an `approve`/`payer-action` link.
* the capture nests under `purchase_units[].payments.captures[]` with `status`, `amount.value` (string), `custom_id`.
* `custom_id` is echoed on the capture and on every webhook; `supplementary_data.related_ids.order_id` is present on `PAYMENT.CAPTURE.*`.
* `ORDER_ALREADY_CAPTURED` and `ORDER_NOT_APPROVED` arrive as 422 with those issue names.
* `verify-webhook-signature` answers `SUCCESS` for a real delivery and `FAILURE` for case 11.

Record each as proven in `docs/payment-paypal.md` §8.

## 4. Clean-up

Cancel any remaining Beds24 test booking by hand; set `is_bookable=false`;
`DIRECT_BOOKING_ENABLED=false` on staging.
