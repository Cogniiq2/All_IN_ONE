import 'server-only';

import { appEnvironment, refusals, validateEnvironment } from '@/lib/config/environment';
import { bookingLegalGaps } from '@/lib/legal/readiness';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SERVER CONFIGURATION — the only place booking secrets are read.
 *
 * `server-only` is not decoration. Importing this module from a client
 * component is a BUILD ERROR, which is the mechanism that keeps the Beds24
 * refresh token, the Supabase service role key and the n8n secret out of the
 * browser bundle. Nothing in here may ever be re-exported from a file that a
 * `'use client'` component imports.
 *
 * Nothing is read at module scope either: OpenNext evaluates modules during
 * the Cloudflare build, where the runtime environment does not exist yet.
 * Every value is read through a function, at request time.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Beds24 operating mode. See lib/integrations/beds24/index.ts. */
export type Beds24Mode = 'mock' | 'live';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Which provider implementation answers.
 *
 * Defaults to 'mock'. That default is safe in exactly one direction: a
 * developer without credentials gets a working flow, and a production
 * deployment that forgets to set it gets fixtures rather than a silent
 * half-integration. What must NEVER happen is the reverse — 'live' quietly
 * degrading to fabricated availability when a call fails — and no code path
 * in this repository does that.
 */
export function beds24Mode(): Beds24Mode {
  return env('BEDS24_MODE') === 'live' ? 'live' : 'mock';
}

export const BEDS24_DEFAULT_BASE_URL = 'https://beds24.com/api/v2';

/**
 * Whether a provider base URL may be pointed somewhere other than the real
 * provider. Only a deployment that declares itself `local` may: that is where
 * the provider simulators run. On every other environment an override is
 * ignored here AND refused by `validateEnvironment()`, so a simulator can
 * never be selected on staging or production, silently or otherwise.
 */
export function providerOverridesPermitted(): boolean {
  return appEnvironment() === 'local';
}

export function beds24Config() {
  const override = env('BEDS24_API_BASE_URL');
  return {
    baseUrl: override && providerOverridesPermitted() ? override : BEDS24_DEFAULT_BASE_URL,
    refreshToken: env('BEDS24_REFRESH_TOKEN'),
  };
}

/**
 * The Beds24 status a PAID booking is promoted to.
 *
 * ── An honest uncertainty, made configurable rather than guessed ─────────
 * The live test against this account proved two things: a booking created as
 * `new` blocks inventory, and cancelling it restores inventory. It did NOT
 * test what `confirmed` does here, and which statuses block inventory is a
 * PER-PROPERTY setting in Beds24, not a universal rule.
 *
 * So the value is configurable, it defaults to `confirmed`, and — crucially —
 * the finalizer READS THE BOOKING BACK and verifies it landed in this status.
 * A wrong value therefore fails loudly into `finalization_failed` with the
 * hold still in place, rather than quietly leaving a paid guest with a
 * reservation that does not block the night.
 *
 * See docs/booking-core-audit.md §5.1.
 */
export function beds24ConfirmedStatus(): string {
  return env('BEDS24_CONFIRMED_STATUS') ?? 'confirmed';
}

export function supabaseConfig() {
  return {
    url: env('SUPABASE_URL') ?? env('NEXT_PUBLIC_SUPABASE_URL'),
    // Service role. Server-side only, by construction — see the note at the
    // top of this file.
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

/* ── The launch gate ───────────────────────────────────────────────────── */

/**
 * Whether this deployment may create real direct bookings at all.
 *
 * Fail-closed: anything other than the exact string `true` is off. Hiding the
 * frontend button is not a gate — a gate is something a curl request runs
 * into. Every command endpoint that can reserve inventory or create a payment
 * order checks this before it does anything else.
 *
 * The database's `bolagio_units.is_bookable` is the SECOND gate, per unit.
 * Both must be on. See docs/direct-booking-production-readiness.md.
 */
export function directBookingEnabled(): boolean {
  return env('DIRECT_BOOKING_ENABLED') === 'true';
}

/**
 * Whether direct booking is ACTUALLY open: the flag is on AND the
 * environment does not contradict itself.
 *
 * `validateEnvironment()` is the second lock on the launch gate. A flag set
 * to true on a deployment whose PayPal mode is sandbox in production, whose
 * Beds24 is mock, whose webhook id is missing, or which is a preview, is a
 * flag that means nothing — the gate stays shut and the refusals are logged
 * under `config.validation` and shown on the System page. See
 * lib/config/environment.ts for the rules and docs/environments.md for the
 * matrix.
 */
export function directBookingPermitted(): { permitted: boolean; refusals: string[] } {
  if (!directBookingEnabled()) return { permitted: false, refusals: [] };
  const report = validateEnvironment();
  // The third lock: every text a guest must see before paying is approved.
  // An unapproved cancellation policy shuts the gate exactly as a missing
  // webhook id does — see lib/legal/readiness.ts.
  const legal = bookingLegalGaps().map((g) => g.code);
  return {
    permitted: report.directBookingPermitted && legal.length === 0,
    refusals: [...refusals(report).map((f) => f.code), ...legal],
  };
}

/* ── PayPal ────────────────────────────────────────────────────────────── */

export type PayPalMode = 'sandbox' | 'live';

/**
 * Sandbox or live — and there is no third answer, no default to live, and no
 * inference from NODE_ENV.
 *
 * ── Why this throws instead of defaulting ────────────────────────────────
 * A default of `sandbox` would be safe for money and unsafe for truth: a
 * production deployment whose PAYPAL_MODE was lost would silently take
 * sandbox payments, tell guests they had paid, and hold real inventory
 * against play money. A default of `live` is obviously worse. So an absent or
 * unrecognised value is a configuration ERROR that stops the payment path, and
 * the guest is told the payment page could not be opened — which is true.
 */
export function paypalMode(): PayPalMode | null {
  const raw = env('PAYPAL_MODE');
  if (raw === 'sandbox' || raw === 'live') return raw;
  return null;
}

export function paypalConfig() {
  const mode = paypalMode();
  // Derived from the mode, never read from an environment variable. A
  // configurable base URL is one typo away from sandbox credentials being
  // presented to the live API, or the reverse. The ONE exception is the
  // local provider simulator, and it is only honoured on APP_ENV=local, and
  // only in sandbox mode — never against a live mode, never off a laptop.
  const simulator = env('PAYPAL_SIMULATOR_URL');
  const baseUrl =
    simulator && providerOverridesPermitted() && mode === 'sandbox'
      ? simulator
      : mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
  return {
    mode,
    baseUrl,
    clientId: env('PAYPAL_CLIENT_ID'),
    clientSecret: env('PAYPAL_CLIENT_SECRET'),
    /** The webhook whose signature we verify. Registered in the PayPal dashboard. */
    webhookId: env('PAYPAL_WEBHOOK_ID'),
  };
}

/**
 * The PayPal client id the BROWSER is given, for the JS SDK.
 *
 * Public by design — it identifies the merchant, it does not authorise
 * anything. It is served from a route handler rather than a NEXT_PUBLIC_
 * variable so that the mode and the id cannot drift apart between the build
 * and the runtime, and so a deployment with the gate off serves no id at all.
 */
export function paypalPublicClientId(): string | undefined {
  return paypalConfig().clientId;
}

/* ── n8n ───────────────────────────────────────────────────────────────── */

/**
 * The HMAC key n8n signs its internal-API calls with.
 *
 * NOT a bearer secret presented in a header: see lib/n8n/signing.ts for why a
 * timestamped HMAC over the body is used instead, and docs/n8n-booking-contract.md
 * for the exact algorithm n8n has to implement.
 */
export function n8nInternalSecret(): string | undefined {
  return env('N8N_INTERNAL_SECRET');
}

/** How far out of date an n8n request signature may be. */
export function n8nReplayWindowSeconds(): number {
  return intEnv('N8N_REPLAY_WINDOW_SECONDS', 300, 30, 900);
}

/** The secret the scheduled inventory sync presents. */
export function inventorySyncSecret(): string | undefined {
  return env('BOOKING_SYNC_SECRET');
}

/** Beds24's own webhook verification token, where Beds24 is set to send one. */
export function beds24WebhookSecret(): string | undefined {
  return env('BEDS24_WEBHOOK_SECRET');
}

/**
 * How long inventory is blocked at Beds24 while the guest pays.
 *
 * Long enough for a real card flow with a 3-D Secure step, short enough that a
 * guest who walks away does not cost a sellable night. Clamped so a typo in
 * the environment cannot hold a room for a week.
 */
export function holdMinutes(): number {
  return intEnv('BOOKING_HOLD_MINUTES', 15, 5, 120);
}

/**
 * How long the LOCAL lock may be held before another attempt may reclaim it.
 *
 * This is not the guest-facing hold. It covers exactly one Beds24 POST, so it
 * only has to outlast that request's timeout with margin. Short, because a
 * lock whose owner died blocks those dates for everyone until it lapses.
 */
export function lockSeconds(): number {
  return intEnv('BOOKING_LOCK_SECONDS', 120, 30, 600);
}

/**
 * How long a booking may sit in a reserving state before reconciliation calls
 * it stale, regardless of its lease. A backstop for rows whose lease was never
 * set because the process died before setting it.
 */
export function staleHoldMinutes(): number {
  return intEnv('BOOKING_STALE_HOLD_MINUTES', 180, 30, 1440);
}

/**
 * How long AFTER `hold_expires_at` a sweep waits before it may release.
 *
 * The guest-facing gate (order creation, capture) closes exactly at
 * `hold_expires_at`. The sweep opens strictly later. The gap is what makes
 * the two unable to cross: a capture that started at 14:59:59 and lands at
 * 15:00:02 cannot meet a release that only becomes possible at 15:02:00.
 * Clamped so the grace can neither be disabled nor hold a room for hours.
 */
export function leaseGraceSeconds(): number {
  return intEnv('BOOKING_LEASE_GRACE_SECONDS', 120, 30, 900);
}

/** How far ahead inventory is synchronised and the calendar may be browsed. */
export function inventoryMonths(): number {
  return intEnv('BOOKING_INVENTORY_MONTHS', 18, 1, 36);
}

/* ── Reservation import ────────────────────────────────────────────────── */

/**
 * How far BACK the canonical reservation import reaches on a full backfill.
 *
 * Twelve months by default: far enough to carry a full season of Booking.com
 * history into the local record, bounded so a backfill cannot become an
 * account-wide scan. The forward edge is `inventoryMonths()` — the same
 * horizon the availability cache already holds, so the two never disagree
 * about how far the calendar goes.
 */
export function reservationBackfillMonths(): number {
  return intEnv('BOOKING_RESERVATION_BACKFILL_MONTHS', 12, 1, 60);
}

/**
 * How wide one provider query may be, in days.
 *
 * The import splits its horizon into windows of this size. Smaller windows
 * mean more requests and fewer rows each; larger ones risk a provider result
 * cap silently truncating a page. Ninety days is small enough that the page
 * limit in `readReservations` is never approached for a two-unit property.
 */
export function reservationWindowDays(): number {
  return intEnv('BOOKING_RESERVATION_WINDOW_DAYS', 90, 7, 365);
}

/**
 * Which provider statuses the import asks for, or nothing.
 *
 * ── Why this is unset by default ─────────────────────────────────────────
 * Whether `GET /bookings` accepts a `status` filter on THIS account is not
 * established (docs/beds24-contract.md §1 lists the booking read as UNKNOWN,
 * and the environment this repository is developed in cannot reach the Beds24
 * documentation). An unrecognised query parameter is usually ignored, but a
 * REJECTED one would fail the whole import — so nothing is sent unless an
 * operator, having verified the account's behaviour, sets it.
 *
 * Unset therefore means "whatever the provider returns by default". Because
 * the import never deletes and never infers a cancellation from absence, that
 * default is safe: the worst case is that a cancellation is learned from the
 * webhook (which re-reads the booking by id) rather than from the sweep.
 *
 * Set to e.g. `new,request,confirmed,cancelled,black` once verified.
 */
export function reservationStatusFilter(): string[] | undefined {
  const raw = env('BEDS24_RESERVATION_STATUSES');
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => /^[a-z]{2,20}$/.test(v));
  return values.length > 0 ? values : undefined;
}

/**
 * How long a live quote stays honest.
 *
 * Shorter than the hold: a price the guest saw ten minutes ago is not a price
 * we are still obliged to, and the flow re-quotes rather than carrying a stale
 * total into a payment.
 */
export function quoteMinutes(): number {
  return intEnv('BOOKING_QUOTE_MINUTES', 20, 5, 60);
}

/* ── Cancellation and refund gates ─────────────────────────────────────── */

/**
 * May an operator cancel a booking that carries payment evidence?
 *
 * Off by default. The domain command, the database invariants and the
 * release saga are built and tested, but ending a CONFIRMED stay at Beds24
 * (status → cancelled on a `confirmed` booking) has not been exercised on the
 * live account, and the commercial cancellation terms are not decided. The
 * unpaid cancellation path needs no gate: it is the release the lease sweep
 * already performs.
 */
export function operatorPaidCancellationEnabled(): boolean {
  return env('OPERATOR_PAID_CANCELLATION_ENABLED') === 'true';
}

/**
 * May the refund saga call the payment provider?
 *
 * Off by default, and refused on production by `validateEnvironment()` until
 * the PayPal refund contract has been proven in the sandbox
 * (docs/paypal-sandbox-e2e.md, refund cases). With the gate off, a refund
 * decision is recorded (`refund_state = required`) and nothing is sent.
 */
export function refundExecutionEnabled(): boolean {
  return env('PAYMENT_REFUND_EXECUTION_ENABLED') === 'true';
}

/* ── Messaging ─────────────────────────────────────────────────────────── */

/**
 * Whether a delivery may be completed with provider `test` (no real send).
 *
 * The automation platform's test transport reports "sent" without sending.
 * That is only meaningful where no guest is real: never on production, and
 * on staging only when explicitly allowed. Elsewhere the completion is
 * refused and recorded as a failure, so a mis-set transport cannot make the
 * ledger claim a confirmation went out when it did not.
 */
export function testCompletionsAllowed(): boolean {
  const environment = appEnvironment();
  if (environment === 'production') return false;
  if (environment === 'staging') return env('MESSAGING_TEST_COMPLETIONS_ALLOWED') === 'true';
  return true;
}

/**
 * The contact details guest messages carry.
 *
 * `MESSAGING_CONTACT_EMAIL` is required before any guest message can render:
 * the brand file deliberately has no email address until one is verified,
 * and a template with `{{contactEmail}}` fails safely without it (the
 * delivery ledger records the refusal; nothing is sent).
 */
export function messagingContact(): { email: string | undefined; phone: string | undefined } {
  return { email: env('MESSAGING_CONTACT_EMAIL'), phone: env('MESSAGING_CONTACT_PHONE') };
}

/**
 * Provider HTTP timeouts.
 *
 * Fixed in every real environment (Beds24 10 s, PayPal 12 s). Only a local
 * deployment may shorten them, so the simulator's "never answers" case does
 * not cost twelve seconds per test; nowhere else is the value read.
 */
export function providerTimeoutMs(provider: 'beds24' | 'paypal'): number {
  const fixed = provider === 'beds24' ? 10_000 : 12_000;
  if (!providerOverridesPermitted()) return fixed;
  const override = intEnv('PROVIDER_TIMEOUT_MS', fixed, 200, 60_000);
  return override;
}
