# Environments

Four, declared by `APP_ENV` and never inferred. Anything that is not exactly
one of the four names reads as **production** — the safe direction.

The rules live in `lib/config/environment.ts` and have no imports, so
`scripts/check-env.mjs` applies exactly the same rules to a dotenv file before
a deploy:

```bash
node --experimental-strip-types scripts/check-env.mjs .env.production
```

Exit 1 on any `refuse` finding. Findings name variables, never values.

---

## 1. The matrix

| | local | preview | staging | production |
|---|---|---|---|---|
| `APP_ENV` | `local` | `preview` | `staging` | `production` |
| Cloudflare worker | — (`next dev`) | `bolagio-preview` (default target) | `bolagio-staging` | `bolagio` |
| Supabase project | own dev project or none | **none** | staging project | production project |
| `BEDS24_MODE` | `mock` | `mock` | `live` (real account, reads) | `live` |
| `PAYPAL_MODE` | unset or `sandbox` | unset | `sandbox` | `live` |
| `DIRECT_BOOKING_ENABLED` | may be `true` for dev | **refused** | `true` only for the sandbox E2E | `true` only after `docs/production-readiness.md` |
| Admin data | fixtures (`ADMIN_DEV_FIXTURES`) or Supabase | preview demo (`ADMIN_PREVIEW_DEMO`) | Supabase | Supabase |
| Guest messages | none | none | none (outbox only) | via n8n |

## 2. Contradictions the gate refuses

A `refuse` finding shuts the direct-booking gate whatever
`DIRECT_BOOKING_ENABLED` says; `requireDirectBooking()` logs
`config.validation` and the System page shows the codes.

| Code | Condition |
|---|---|
| `DEMO_SWITCH_OUTSIDE_PREVIEW` | `ADMIN_PREVIEW_DEMO=true` and `APP_ENV` is not `preview` |
| `FIXTURE_SWITCH_ON_PRODUCTION` | `ADMIN_DEV_FIXTURES=true` on staging or production |
| `LIVE_PAYPAL_OUTSIDE_PRODUCTION` | `PAYPAL_MODE=live` on local or preview |
| `LIVE_PAYPAL_ON_STAGING` | `PAYPAL_MODE=live` on staging |
| `SANDBOX_PAYPAL_ON_PRODUCTION` | production, `PAYPAL_MODE=sandbox`, gate on (warn when the gate is off) |
| `DIRECT_BOOKING_ON_PREVIEW` | gate on, on a preview |
| `DIRECT_BOOKING_WITHOUT_*` | gate on with a missing PayPal mode, credential, webhook id, live Beds24, Beds24 token, database, or scheduler secret |

Warnings (surfaced, no behaviour change): `APP_ENV_ASSUMED`,
`DEMO_WITH_DATABASE`, `PAYPAL_MODE_INVALID`, `LIVE_BEDS24_ON_PREVIEW`,
`DIRECT_BOOKING_WITHOUT_BEDS24_WEBHOOK`, `ADMIN_UNCONFIGURED`,
`N8N_UNCONFIGURED`, `SCHEDULER_UNCONFIGURED`, `PAYPAL_MODE_UNSET`.

## 3. Secret matrix

Every secret is set with `wrangler secret put <NAME> --env <env>` (Cloudflare)
and, where marked, `supabase secrets set` on the Edge Function of the matching
Supabase project. **Two stores; a value in one is not a value in the other.**
Nothing below may be `NEXT_PUBLIC_`.

| Variable | Kind | Cloudflare | Supabase Edge Fn | Notes |
|---|---|---|---|---|
| `APP_ENV` | var | ✓ (in `wrangler.jsonc`) | — | |
| `BEDS24_MODE` | var | ✓ | — | |
| `BEDS24_REFRESH_TOKEN` | secret | ✓ | — | per account |
| `BEDS24_WEBHOOK_SECRET` | secret | ✓ | — | |
| `BEDS24_CONFIRMED_STATUS` | var | ✓ | — | default `confirmed`; unproven live |
| `SUPABASE_URL` | var | ✓ | auto | **per environment's project** |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | ✓ | auto | |
| `SUPABASE_ANON_KEY` | secret | ✓ | — | admin sign-in only |
| `PAYPAL_MODE` | var | ✓ | ✓ | must match in both stores |
| `PAYPAL_CLIENT_ID` | var | ✓ | ✓ | public by nature |
| `PAYPAL_CLIENT_SECRET` | secret | ✓ | ✓ | |
| `PAYPAL_WEBHOOK_ID` | secret | ✓ | ✓ | one webhook per environment |
| `N8N_INTERNAL_SECRET` | secret | ✓ | — | |
| `BOOKING_SYNC_SECRET` | secret | ✓ | — | scheduler → sync + reconcile |
| `ADMIN_SESSION_SECRET` | secret | ✓ | — | ≥ 32 chars |
| `ADMIN_PREVIEW_*` | secret | preview only | — | |
| `DIRECT_BOOKING_ENABLED` | var | ✓ | — | |
| `BOOKING_*_MINUTES/SECONDS` | var | optional | — | clamped defaults |

Rotation: rotate a secret in **both** stores in one change window; the
PayPal webhook id is per-webhook, so a new webhook means a new id in both.
