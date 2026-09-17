import 'server-only';

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

export function beds24Config() {
  return {
    baseUrl: env('BEDS24_API_BASE_URL') ?? 'https://beds24.com/api/v2',
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
  return {
    mode,
    // Derived from the mode, never read from an environment variable. A
    // configurable base URL is one typo away from sandbox credentials being
    // presented to the live API, or the reverse.
    baseUrl:
      mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
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

/**
 * The secret on the reconciliation / maintenance endpoint.
 *
 * ── What this no longer is ───────────────────────────────────────────────
 * It used to authenticate a caller claiming a payment had succeeded. It does
 * not any more, and nothing does: payment truth comes from a PayPal
 * signature-verified event or an authoritative server-side capture, never from
 * a caller's assertion behind a static string. See docs/booking-core-audit.md §2.1.
 */
export function bookingCallbackSecret(): string | undefined {
  return env('BOOKING_CALLBACK_SECRET');
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

/** How far ahead inventory is synchronised and the calendar may be browsed. */
export function inventoryMonths(): number {
  return intEnv('BOOKING_INVENTORY_MONTHS', 18, 1, 36);
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
