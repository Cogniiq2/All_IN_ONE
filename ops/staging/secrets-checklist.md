# Staging secrets — checklist

Three stores, none of which reads the others. A value set in one is not a
value in another; the PayPal quartet must be set **twice**, the n8n HMAC
secret **twice**. Names below, never values. Template with per-variable
notes: `ops/staging/.env.staging.example`; validator:
`node --experimental-strip-types ops/staging/validate-staging-config.mjs <filled copy>`.

| Store | How a value is set | Who reads it |
|---|---|---|
| Cloudflare worker `bolagio-staging` | plain vars in `wrangler.jsonc` `env.staging.vars`; secrets with `npx wrangler secret put <NAME> --env staging` | every Next.js route and server action (`lib/booking/config.ts`) |
| Supabase Edge Function `paypal-webhook` (staging project) | `supabase secrets set <NAME>=<value> --project-ref <ref>`; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically and cannot be set by hand | the Edge Function only |
| n8n process environment | systemd unit / Docker `environment:` / the platform's secret manager — never a Set node, never a workflow; every name prefixed `BOLAGIO_` | the six `BoLaGio ·` workflows (`n8n/credentials-matrix.md`) |

Rules that apply to all three: nothing is `NEXT_PUBLIC_`; nothing is
committed (`.env`, `.env*.local`, `.dev.vars*` are git-ignored; the example
file carries placeholders only); nothing is pasted into a workflow JSON, a
Set node, a log line or a ticket; staging values differ from production
values for every secret.

## 1. Cloudflare — `wrangler secret put <NAME> --env staging`

| ☐ | Name | Kind | Note |
|---|---|---|---|
| ☐ | `APP_ENV` | var (`wrangler.jsonc`) | `staging`, already declared |
| ☐ | `BEDS24_MODE` | var (`wrangler.jsonc`) | `live`, already declared |
| ☐ | `DIRECT_BOOKING_ENABLED` | var (`wrangler.jsonc`) | `false`; `true` only for the scripted sandbox run, then back |
| ☐ | `BEDS24_REFRESH_TOKEN` | secret | per account |
| ☐ | `BEDS24_WEBHOOK_SECRET` | secret | optional on staging |
| ☐ | `BEDS24_CONFIRMED_STATUS` | var | default `confirmed`; set after the controlled validation |
| ☐ | `SUPABASE_URL` | var | the shared project's URL |
| ☐ | `SUPABASE_SERVICE_ROLE_KEY` | secret | service-role JWT, or a `bolagio_app` JWT (`docs/supabase-shared-project.md` §4) |
| ☐ | `SUPABASE_ANON_KEY` | secret | admin sign-in only |
| ☐ | `PAYPAL_MODE` | var | `sandbox` — must equal the Edge Function's |
| ☐ | `PAYPAL_CLIENT_ID` | var | sandbox app — must equal the Edge Function's |
| ☐ | `PAYPAL_CLIENT_SECRET` | secret | sandbox app — must equal the Edge Function's |
| ☐ | `PAYPAL_WEBHOOK_ID` | secret | the staging webhook — must equal the Edge Function's |
| ☐ | `N8N_INTERNAL_SECRET` | secret | must equal n8n's `BOLAGIO_N8N_INTERNAL_SECRET` |
| ☐ | `N8N_REPLAY_WINDOW_SECONDS` | var | optional, default 300 |
| ☐ | `BOOKING_SYNC_SECRET` | secret | must equal the database setting `app.booking_sync_secret` written by `ops/staging/cron.sql` |
| ☐ | `ADMIN_SESSION_SECRET` | secret | ≥ 32 characters |
| ☐ | `MESSAGING_CONTACT_EMAIL` | var | required for guest messages to render; a staging mailbox |
| ☐ | `MESSAGING_CONTACT_PHONE` | var | optional |
| ☐ | `PAYMENT_REFUND_EXECUTION_ENABLED` | var | `false` or unset |
| ☐ | `OPERATOR_PAID_CANCELLATION_ENABLED` | var | `false` or unset |
| ☐ | `MESSAGING_TEST_COMPLETIONS_ALLOWED` | var | **unset**; set for a messaging rehearsal, then `wrangler secret delete` / remove |
| ☐ | `BOOKING_TEST_TERMS` | var | `true` only for the scripted sandbox run (the checkout shows "TEST" terms), then remove |
| ☐ | `PRIVILEGES_UNSUBSCRIBE_SECRET` | secret | ≥ 32 random characters; required before any marketing email |
| ☐ | `BOOKING_*` clamps | var | optional |
| ☐ | none of `ADMIN_PREVIEW_*`, `ADMIN_DEV_FIXTURES`, `BEDS24_API_BASE_URL`, `PAYPAL_SIMULATOR_URL`, `NEXT_PUBLIC_*` | — | confirm absent: `npx wrangler secret list --env staging` |

## 2. Supabase Edge Function — `supabase secrets set … --project-ref <staging ref>`

| ☐ | Name | Note |
|---|---|---|
| ☐ | `PAYPAL_MODE` | `sandbox` — same as the worker |
| ☐ | `PAYPAL_CLIENT_ID` | same as the worker |
| ☐ | `PAYPAL_CLIENT_SECRET` | same as the worker |
| ☐ | `PAYPAL_WEBHOOK_ID` | same as the worker |
| ☐ | `SUPABASE_URL` | injected — do not set |
| ☐ | `SUPABASE_SERVICE_ROLE_KEY` | injected — do not set; stays the service key even when the worker uses `bolagio_app` |

Deploy and verify: `ops/staging/edge-function-deploy.md`. Confirm with
`supabase secrets list --project-ref <ref>` (names only).

## 3. n8n — process environment, `BOLAGIO_*` (`n8n/credentials-matrix.md`)

| ☐ | Name | Note |
|---|---|---|
| ☐ | `BOLAGIO_SITE_URL` | the staging worker's public URL, no trailing slash |
| ☐ | `BOLAGIO_N8N_INTERNAL_SECRET` | the worker's `N8N_INTERNAL_SECRET` |
| ☐ | `BOLAGIO_ENVIRONMENT` | `staging` |
| ☐ | `BOLAGIO_MESSAGING_TRANSPORT` | `disabled` (default) or `test`; `smtp` only for the final rehearsal |
| ☐ | `BOLAGIO_MAIL_FROM` | a staging sender |
| ☐ | `BOLAGIO_ALERT_TRANSPORT` | `disabled` or `webhook` to the staging channel |
| ☐ | `BOLAGIO_ALERT_WEBHOOK_URL` | secret (a capability); staging channel |
| ☐ | `BOLAGIO_ALERT_EMAIL_TO` | optional |
| ☐ | `BOLAGIO_CLEANING_TRANSPORT` | `disabled` unless a sandbox endpoint exists |
| ☐ | `BOLAGIO_CLEANING_WEBHOOK_URL` | secret; sandbox endpoint |
| ☐ | credential **`BoLaGio SMTP`** | n8n credential store, name exact; staging SMTP account |
| ☐ | n8n holds **no** Supabase key, no PayPal value, no Beds24 token | by design — it speaks to the worker's signed API only |

## 4. Rotation

| Secret | Order | Between the steps |
|---|---|---|
| `N8N_INTERNAL_SECRET` ↔ `BOLAGIO_N8N_INTERNAL_SECRET` | worker first (`wrangler secret put`), then n8n env, restart n8n | every signed request is `401`; the pump's executions error and events wait; nothing is lost |
| `BOOKING_SYNC_SECRET` ↔ `app.booking_sync_secret` | worker first, then re-run `ops/staging/cron.sql` with the new `-v secret=` | scheduled calls are `401`; held bookings wait; keep the gap under one reconcile interval (3 min) |
| PayPal quartet | new sandbox app or webhook → set all four in **both** stores in one window → redeploy the Edge Function | a mismatch means the site creates orders the Edge Function cannot verify; PayPal retries for three days, nothing is lost |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Dashboard → Settings → API → new JWT secret rotates **every** key in the shared project, Cogniiq's clients included — coordinate with that owner; then `wrangler secret put` both, redeploy the Edge Function | the worker is `503` on the database until the new key is set |
| a `bolagio_app` JWT | mint a new one (`docs/supabase-shared-project.md` §4), `wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging` | none if the JWT secret did not change |
| `ADMIN_SESSION_SECRET` | `wrangler secret put` | every operator is signed out |
| `BEDS24_REFRESH_TOKEN` | generate in Beds24, `wrangler secret put` | Beds24 calls fail closed (`outcome_unknown` never — the token is checked before any write) |

Record each rotation (name, date, who) in the deployment notes. Never the value.
