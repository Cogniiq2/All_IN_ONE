# Cloudflare deployment

Next.js 14.2 on Cloudflare Workers through OpenNext (`@opennextjs/cloudflare`).
Three worker targets are declared in `wrangler.jsonc`; the **default is the
preview**, so a deploy without `--env` cannot reach production.

## 1. Runtime facts the code relies on

| Concern | How it is handled |
|---|---|
| Node compatibility | `nodejs_compat` flag; every route declares `runtime = 'nodejs'`. Web Crypto only in `lib/admin/session.ts`, `lib/admin/preview.ts`, `lib/n8n/signing.ts` so the same modules run in the edge middleware |
| Environment reads | never at module scope; every value is read through a function at request time (`lib/booking/config.ts`, `lib/config/environment.ts`) because OpenNext evaluates modules at build time |
| Raw request bodies | `request.text()` in the webhook and n8n routes; the signature covers the bytes as sent |
| Cookies | `HttpOnly; Secure; SameSite=Lax; Path=/admin`; Secure is relaxed only under `next dev` |
| Caching | every API answer is `Cache-Control: no-store` (route + `next.config.js`); every `/admin` answer is `no-store` from the middleware |
| Server actions | the four admin actions; Next's origin check plus the Lax cookie are the CSRF defence |
| Per-isolate state | the in-memory rate limiter and the provider token caches are per isolate and documented as best-effort; the guarantees do not depend on them |
| Timeouts | Beds24 10 s, PayPal 12 s; the reconcile pass is bounded by `limit` |
| Scheduled work | **not** a Cloudflare Cron Trigger (OpenNext exposes no `scheduled` handler). Supabase `pg_cron` + `pg_net` call the two secured routes — see `docs/schedulers.md` |

## 2. Configuration per target

`wrangler.jsonc` carries the plain vars per `env`; every secret is
`wrangler secret put NAME --env <target>`. The full list is in
`docs/environments.md` §3.

```bash
# preview (default target)
npm run cf:build && npx wrangler deploy
# staging
npx wrangler deploy --env staging
# production
npx wrangler deploy --env production
```

## 3. Deployment checklist

1. `npm run typecheck && npm run lint && npm test && ./scripts/db-test.sh`.
2. `node --experimental-strip-types scripts/check-env.mjs <dotenv for the target>` → exit 0.
3. Database migrations for the target's Supabase project applied and verified (`docs/supabase-migration-runbook.md`) **before** the worker that depends on them: the 2026-09-20 migration changes a function signature the new code calls.
4. `npm run cf:build`.
5. `npx wrangler deploy --env <target>`.
6. Smoke: `GET /` 200, `GET /apartments` 200, `GET /admin` 307 to login with the hardened headers, `GET /api/booking/payment/config` 403 while the gate is off, `POST /api/booking/reconcile` with the secret returns a report and writes a heartbeat.
7. System page: Configuration section shows no contradictions; Schedulers section shows runs.

## 4. Rollback checklist

1. `npx wrangler rollback --env <target>` (or redeploy the previous build).
2. If the 2026-09-20 migration was applied with this deploy and the previous
   worker must run against it: the previous worker calls the **5-argument**
   `bolagio_begin_external_operation`, which no longer exists. Either keep the
   new worker, or run `supabase/ops/rollback_20260920.sql` first. The failure
   mode of getting this wrong is fail-closed (every external mutation refused).
3. Confirm the System page and `GET /api/internal/health`.
4. Do not disable the reconciliation schedule during a rollback; in-flight
   bookings still need to reach a resting state.

## 5. Cloudflare WAF rate limiting (required before launch)

The in-isolate limiter is not the security boundary. Rules, in order:

| Path | Rule |
|---|---|
| `POST /api/booking/intent` | 10 / minute / IP |
| `POST /api/booking/payment/*` | 10 / minute / IP |
| `POST /api/booking/quote` | 30 / minute / IP |
| `GET /api/booking/*` | 120 / minute / IP |
| `/admin/login` | 10 / minute / IP |
| `/api/internal/*`, `/api/webhooks/*` | allow-list source IPs where the sender's ranges are published; otherwise 60 / minute / IP |
