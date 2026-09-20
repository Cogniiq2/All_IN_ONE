# BoLaGio Control — Residence Operations

The internal operations interface at `/admin`. A read-mostly layer over the
booking core: it shows what the database, the payment inbox, the external
operations ledger, the outbox and the reconciliation queue hold, and offers
exactly one kind of write — running the existing reconciliation engine.

It is **not** a second booking engine. Nothing in it sets a booking status,
releases a hold, refunds a payment, edits a channel-manager mapping or talks
to Beds24 or PayPal from a browser.

---

## 1. Routes

| Route | Purpose |
|---|---|
| `/admin/login` | Sign-in. The only unauthenticated screen. |
| `/admin` | Today: attention first, arrivals/departures/in-house, residence status, key figures, upcoming, health. |
| `/admin/calendar` | Multi-property reservation calendar (read-only). `?days=14\|31\|62`, `?start=YYYY-MM-DD`, `?unit=slug`. |
| `/admin/bookings` | Booking index with URL-backed search, filters, sort and pagination. |
| `/admin/bookings/[reference]` | One booking: facts, lifecycle, payment, channel state, reconciliation, technical detail. |
| `/admin/operations` | The attention inbox, ordered by cost of ignoring. |
| `/admin/properties` | Unit registry, mapping ids, cache freshness, today's state. Read-only. |
| `/admin/payments` | Local payment records beside their bookings; recent webhook events. |
| `/admin/system` | Measured health, queues, recent jobs/operations/outbox, operator audit. |

Every `/admin` response carries `X-Robots-Tag: noindex, nofollow, noarchive`,
`Cache-Control: no-store`, a strict `Content-Security-Policy`
(`frame-ancestors 'none'`, `connect-src 'self'`, `form-action 'self'`),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a
`Permissions-Policy` (`lib/admin/headers.ts`, applied by the middleware and
asserted by `tests/admin-middleware.test.ts`). The CSP allows inline scripts
for the App Router's hydration payload; a nonce-based policy is a later
refinement. The admin is absent from `app/sitemap.ts` and linked from nowhere
on the public site.

---

## 2. Authentication and authorisation

```
browser ──form POST──▶ server action ──password──▶ Supabase Auth (anon key, server-side)
                                    ──email/uid──▶ bolagio_operators (service role)
                                    ◀── signed session cookie ──
```

| Layer | What | Where |
|---|---|---|
| Identity | Supabase Auth verifies the password. Server-side only; the browser never holds a Supabase client or key. | `lib/admin/auth.ts` → `authenticate()` |
| Authorisation | `bolagio_operators` allowlist: `email`, `role` (`viewer` / `operator` / `admin`), `active`. Read with the service role on **every request**. | `lib/admin/auth.ts` → `currentOperator()` |
| Session | HMAC-SHA256-signed cookie `bolagio_control_session` (HttpOnly, Secure in production, SameSite=Lax, path `/admin`, 12 h). Carries the Supabase user id and email — never a role. | `lib/admin/session.ts` |
| Outer gate | `middleware.ts` verifies signature + expiry on every `/admin` request (no I/O) and redirects to login. | `middleware.ts` |
| Inner gate | `app/(admin)/admin/(control)/layout.tsx` calls `requireOperator()` before rendering anything protected. | `lib/admin/auth.ts` |
| Revocation | `active = false`, or `sessions_invalidated_before = now()` on the operator row. Takes effect on the next request. | SQL |
| Audit | Every sign-in, refused sign-in, sign-out and manual command is a row in `bolagio_admin_audit_log`. | `lib/admin/auth.ts` → `audit()` |

Fail-closed: no `ADMIN_SESSION_SECRET` (or one shorter than 32 characters),
no `SUPABASE_ANON_KEY`, no Supabase at all, or no allowlist row → nobody
signs in. There is no configuration that admits a request by default.

CSRF: writes are Next.js server actions (origin-checked) behind a
`SameSite=Lax` cookie. Sign-in is rate-limited per isolate (8/min) on top of
Supabase Auth's own limits.

### Environment

Set as Cloudflare Worker secrets (and in `.env.local` for development):

```
ADMIN_SESSION_SECRET=   # openssl rand -hex 32 — at least 32 characters
SUPABASE_ANON_KEY=      # the project's anon/publishable key, server-side only
SUPABASE_URL=           # already required by the booking core
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_ANON_KEY` is deliberately **not** `NEXT_PUBLIC_`: the operations
interface has no browser-side Supabase client.

### First operator

1. Apply `supabase/migrations/20260919120000_admin_operators.sql` (after the
   three booking-core migrations).
2. Supabase Dashboard → Authentication → Users → *Add user* with the
   person's email and a password. Password reset and MFA are managed there.
3. `insert into bolagio_operators (email, display_name, role) values ('name@example.com', 'Name', 'operator');`
4. They sign in at `/admin/login`. The first successful sign-in binds
   `auth_user_id`; a later sign-in by a *different* Supabase user with the
   same email is refused.

---

## 3. Roles

| Capability | viewer | operator | admin |
|---|---|---|---|
| Read every screen | ✓ | ✓ | ✓ |
| Reconcile one booking | | ✓ | ✓ |
| Run one reconciliation pass | | ✓ | ✓ |
| Manage operators (reserved; no UI yet) | | | ✓ |

Defined in `lib/admin/permissions.ts`; checked server-side in every action.

---

## 4. The one write

**Reconcile now** (booking page) and **Run one reconciliation pass** (System
page) both call the existing engine in `lib/booking/reconciliation.ts`:

- *Reconcile now* queues, through `queueReconciliation`, exactly the job the
  scheduled sweep would queue for the booking's state
  (`reconciliationReasonFor`), then runs one bounded `runReconciliation`.
- *Run one pass* is `runReconciliation(logger, 25)` — identical to what the
  scheduler triggers via `POST /api/booking/reconcile`.

Both are audited, both revalidate the affected screens, and both inherit the
engine's guarantees: read the provider before writing, never retry an
unknown outcome blind, never release or refund a booking with payment
evidence. In development-fixture mode they refuse and say so.

There is no action for: setting a status, cancelling, releasing, refunding,
editing a mapping or bookability, moving dates, or deleting a guest.

---

## 5. Data access

```
page.tsx (server) ─▶ lib/admin/queries.ts ─▶ lib/admin/source.ts ─▶ Supabase (service role)
                          │                                    └▶ dev/fixtures.ts  (next dev + flag only)
                          └─▶ DTOs (lib/admin/dto.ts) ─▶ components
```

- `rows.ts` — the read-only `RowSource` interface and snake_case row shapes.
- `source-supabase.ts` — explicit column lists. `idempotency_key`,
  `provider_snapshot` and raw webhook `payload` are never selected.
- `queries.ts` — composes rows into DTOs; answers `QueryResult` so a page
  can render what loaded and name what did not. A database error is never
  shown as "0 bookings".
- `dto.ts` — the only shapes a screen sees. Lists carry `guestLabel`
  (surname + initial); only the booking detail carries contact details.
- `presentation.ts` — label/tone/glyph/summary per domain state. Describes
  `lib/booking/states.ts`; never redefines it. Unknown values → neutral
  "Unknown", never healthy.
- `attention.ts` — deterministic "needs a person" derivation, ordered like
  `bolagio_ops_attention`. Severity is not permission: no item says "retry".

### Development fixtures

`ADMIN_DEV_FIXTURES=true` under `next dev` (and only there — `NODE_ENV` is
inlined at build, so the branch is dead in a production build) serves
synthetic rows from `lib/admin/dev/fixtures.ts`. Sign-in then accepts
`ADMIN_DEV_FIXTURE_EMAIL` / `ADMIN_DEV_FIXTURE_PASSWORD` (both required;
no default). Every screen labels itself "Development fixtures".

---

## 6. Preview demo mode

For reviewing the interface on a Cloudflare preview without applying the
booking migrations or pointing anything at production Supabase.

### The guard

A Cloudflare preview **is a production build** — `NODE_ENV` is `production`
there — so `NODE_ENV` proves nothing and is not consulted. What is required
instead is that the deployment says what it is, and that the demo is
switched on deliberately:

| Variable | Required value | Why |
|---|---|---|
| `APP_ENV` | exactly `preview` | The deployment declares itself. Unset, empty, mis-cased or any other word reads as **production**. |
| `ADMIN_PREVIEW_DEMO` | exactly `true` | The deliberate switch. |
| `ADMIN_PREVIEW_EMAIL` | any address | No default. |
| `ADMIN_PREVIEW_PASSWORD` | ≥ 16 characters | No default. Also the session key material. |

**All four, or the demo does not exist** — no branch runs, no cookie
verifies, no credential is accepted. `ADMIN_PREVIEW_DEMO=true` left on a
worker whose `APP_ENV` is `production` (or unset) does nothing at all, and
the demo password cannot even be probed there: `previewCredentialsMatch`
returns `false` before looking at its arguments.

The single gate is `isPreviewDemoEnabled()` in `lib/admin/preview.ts`; every
preview code path in the application asks that one function.

### What the demo is, and is not

- Serves the same synthetic rows as the development fixtures
  (`lib/admin/dev/fixtures.ts`). It never constructs a Supabase client, so
  it needs **no `SUPABASE_SERVICE_ROLE_KEY`**, **no `SUPABASE_URL`**, **no
  `ADMIN_SESSION_SECRET`** and **no `bolagio_*` tables**.
- Never reads or writes production booking data, never calls Beds24, never
  calls PayPal, never calls the reconciliation engine.
- The session is a **separate cookie** (`bolagio_control_preview`), signed
  with a key **derived from the demo credentials** (SHA-256 over a
  domain-separated string) and carrying an explicit `aud: preview-demo`
  claim. An operator verifier refuses any token with an audience and a
  preview verifier refuses any token without one, so neither session can
  ever be accepted as the other even if the keys coincided.
- The viewer is hard-coded to the `viewer` role, and **every** capability
  except `view` is refused a second time by `previewAllows()` — so widening
  `viewer` later still cannot open a write path in the demo.
- `Reconcile now` and `Run one reconciliation pass` are not rendered, and
  are refused server-side with `reason: 'preview'` if called anyway.
- `Preview data` is shown persistently — sidebar footer on desktop, top bar
  on a phone, the login screen, the overview chips and the System page.
- `/admin` keeps `noindex, nofollow, noarchive` and `no-store` exactly as
  on any other deployment.

### Precedence

`preview` outranks `supabase` in `adminMode()` deliberately: a deployment
that has declared itself a preview and switched the demo on serves fixtures
to **every** request, so there is no path on it that reaches production
booking data — not through a demo session and not through an operator one.
The consequence is worth knowing: setting these variables on a worker that
does have production Supabase configured turns that worker into a demo. The
failure direction is safe (no data exposed), but it is a real switch.

Production operator authentication is untouched — same code, same cookie,
same Supabase path — and is simply not reachable on a preview-demo
deployment: `authenticate()` returns `unconfigured` there rather than
sending demo credentials to Supabase.

---

## 6a. Security review findings (2026-09-20)

Reviewed against the code: session signing, expiry and audience separation;
allowlist re-read per request; `sessions_invalidated_before`; CSRF (server
actions, Lax cookie); open redirect on `next` (prefix-checked); enumeration
(one message for every refusal); rate limit (per isolate, documented; WAF rule
required); PII (lists carry surname + initial only; detail carries contact
data; nothing in URLs beyond the reference); query abuse (search reduced to a
safe character set; page size capped at 200); error leakage (Postgres codes
mapped to sentences). Fixed: a redirect loop on a preview deployment that
carried an operator cookie; missing CSP / frame / nosniff / permissions
headers. Remaining: the in-isolate login rate limit is not global (Cloudflare
WAF rule on `/admin/login`); no MFA beyond what Supabase Auth offers; the CSP
permits inline scripts.

## 7. What is measured, and what is not

The System page reports only what can be measured from BoLaGio's own data:

| Section | Measured | Not measured (says so) |
|---|---|---|
| Database | Supabase answers a read | — |
| Booking core | Operations views readable (migrations applied) | — |
| Channel manager | Mapping present, cache age per unit, config posture | Live reachability (no call from the admin) |
| Payments | Config posture (mode, credentials, webhook id) | Settlement — proven by verified inbox events, not by config |
| Payment inbox / outbox / reconciliation | Queue counts and ages | — |
| Schedulers | Last run per job from the heartbeat, age, overdue | A job that never ran (reported as not instrumented) |
| Configuration | Environment declaration and contradiction findings | — |
| Alerts | The CRITICAL / HIGH / MEDIUM list, same as `/api/internal/health` | Provider reachability |

Reserved event names (`guest.prearrival_ready`, `guest.checkin_ready`,
`cleaning.required`, `review.requested`) are not emitted and are not shown
as if they were. Cleaning, access codes, messaging, invoices, refunds and
date changes are not built.

---

## 8. Relationship to the public site

Routes were moved into `app/(site)/` (URLs unchanged) so the public layout
— providers, navigation, footer, modals, JSON-LD — wraps the site only. The
root `app/layout.tsx` carries the document, fonts and default metadata; the
admin has its own layout, stylesheet (`app/(admin)/admin/control.css`,
every rule scoped under `.bc`) and metadata. No public component imports
anything from `lib/admin/` or `components/admin/`.
