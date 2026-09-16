/**
 * The BoLaGio reservation number, and the idempotency key behind it.
 *
 * ── Why BoLaGio owns the number ──────────────────────────────────────────
 * A guest quotes their reservation number on the phone, in an email and at the
 * door. If that number is a Beds24 id then Beds24 is in BoLaGio's guest
 * communication forever, and changing channel manager means changing every
 * guest's reference. Three identifiers are kept deliberately separate:
 *
 *   internal uuid      the database row. Never shown, never in a URL.
 *   BLG-XXXXXX         what the guest sees and says out loud.
 *   Beds24 booking id  the provider's, stored beside it, never displayed.
 */

/**
 * Crockford-style alphabet: no I, L, O, U, and no digits 0 or 1.
 *
 * A reference is read over a bad phone line and written down by hand, so the
 * pairs that get confused doing that are simply not in it. Six characters over
 * 30 symbols is 729 million combinations, which is not a collision risk at any
 * volume this business will reach — and the unique index on the column is the
 * backstop regardless.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * A fresh guest-facing reference.
 *
 * `crypto.getRandomValues`, not `Math.random`: a reservation number is quoted
 * as a weak identifier in support conversations, and one that can be guessed
 * by enumerating a seeded PRNG is a disclosure risk rather than a convenience.
 *
 * The modulo below is unbiased because 256 is not a multiple of 30 — bytes
 * above the largest whole multiple are discarded rather than folded in.
 */
export function newBookingReference(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  while (out.length < 6) {
    const bytes = randomBytes(6);
    for (let i = 0; i < bytes.length && out.length < 6; i += 1) {
      const byte = bytes[i];
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return `BLG-${out}`;
}

export const BOOKING_REFERENCE_PATTERN = /^BLG-[0-9A-Z]{6}$/;

export function isBookingReference(value: unknown): value is string {
  return typeof value === 'string' && BOOKING_REFERENCE_PATTERN.test(value);
}

/**
 * The idempotency key for a booking attempt.
 *
 * Derived from what actually identifies the attempt — the unit, the dates, the
 * party and the guest's email — rather than from a client-supplied token
 * alone. A double-clicked button, a retried fetch, a page refresh and a
 * duplicated n8n callback all produce the same key, and the unique index on
 * `idempotency_key` turns the second one into a no-op instead of a second
 * Beds24 booking.
 *
 * The email is hashed with everything else and never stored in the key in
 * clear; the key ends up in logs.
 */
export async function bookingIdempotencyKey(input: {
  unitSlug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  email: string;
  /** A client-supplied attempt id, so a deliberate retry can be distinguished. */
  attemptId?: string;
}): Promise<string> {
  const material = [
    input.unitSlug,
    input.checkIn,
    input.checkOut,
    String(input.adults),
    String(input.children),
    input.email.trim().toLowerCase(),
    input.attemptId ?? '',
  ].join('|');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return hex(digest);
}

/** A stable hash of a webhook body, for duplicate-delivery rejection. */
export async function payloadHash(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return hex(digest);
}

function hex(buffer: ArrayBuffer): string {
  return Array.prototype.slice.call(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison, for shared secrets on inbound webhooks.
 *
 * `a === b` on a secret leaks its prefix through timing. The length check
 * first is safe: the length of a shared secret is not the secret.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
