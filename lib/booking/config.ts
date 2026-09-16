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

export function supabaseConfig() {
  return {
    url: env('SUPABASE_URL') ?? env('NEXT_PUBLIC_SUPABASE_URL'),
    // Service role. Server-side only, by construction — see the note at the
    // top of this file.
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function n8nPaymentConfig() {
  return {
    webhookUrl: env('N8N_BOOKING_PAYMENT_WEBHOOK_URL'),
    webhookSecret: env('N8N_BOOKING_PAYMENT_WEBHOOK_SECRET'),
  };
}

/**
 * The shared secret n8n and the payment workflow present when they call back
 * to say a payment succeeded, failed, was cancelled or expired. Returning to
 * /booking/success in a browser proves nothing; this does.
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
