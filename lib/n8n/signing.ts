import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE n8n INTERNAL API SIGNATURE.
 *
 * ── Why not a bearer secret in a header ──────────────────────────────────
 * Because a bearer secret is a replayable password. Anything that ever sees
 * one request — a proxy log, an n8n execution history, a screenshot in a
 * support ticket, a misconfigured egress — can repeat that request forever.
 * For an API that claims and acknowledges booking events, that means replaying
 * an acknowledgement and losing an event.
 *
 * So: an HMAC over the timestamp and the body, with a replay window.
 * Capturing a request gives an attacker five minutes of that exact body, and
 * nothing else. It is materially stronger for a few lines of code.
 *
 * ── THE ALGORITHM, exactly ───────────────────────────────────────────────
 * n8n has to implement this. The canonical string is:
 *
 *     v1:<timestamp>:<raw request body>
 *
 * where `timestamp` is UNIX SECONDS as a decimal string, and the body is the
 * bytes actually sent — not a re-serialised object. Then:
 *
 *     signature = hex( HMAC-SHA256( N8N_INTERNAL_SECRET, canonical ) )
 *
 * and the request carries:
 *
 *     x-bolagio-timestamp: 1789123456
 *     x-bolagio-signature: v1=<hex>
 *
 * A worked example, copy-pasteable, is in docs/n8n-booking-contract.md.
 *
 * ── Verification order, which is not arbitrary ───────────────────────────
 *   1. the secret is configured           — unset means refuse, never allow
 *   2. the timestamp parses and is fresh   — cheap, and bounds replay
 *   3. the HMAC matches, in constant time  — expensive, done last
 *
 * Checking freshness before the HMAC means a flood of stale requests costs
 * almost nothing. Comparing in constant time means the signature cannot be
 * guessed a byte at a time from response timings.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { n8nInternalSecret, n8nReplayWindowSeconds } from '@/lib/booking/config';
import { timingSafeEqual } from '@/lib/booking/reference';

export type SignatureFailure =
  | 'not_configured'
  | 'missing_headers'
  | 'bad_timestamp'
  | 'expired'
  | 'bad_signature';

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

const PREFIX = 'v1=';

/**
 * Verify a signed internal request.
 *
 * `rawBody` must be the exact string that was read from the request. Signing
 * a re-serialised object would make the signature depend on key ordering and
 * whitespace, which is how an integration works on Tuesday and fails on
 * Wednesday.
 */
export async function verifyN8nSignature(
  headers: Headers,
  rawBody: string,
  now: Date = new Date()
): Promise<SignatureResult> {
  const secret = n8nInternalSecret();
  // Fail closed. An endpoint that accepts anything when its secret is unset is
  // how a staging misconfiguration becomes a production incident.
  if (!secret) return { ok: false, reason: 'not_configured' };

  const timestamp = headers.get('x-bolagio-timestamp');
  const signature = headers.get('x-bolagio-signature');
  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const seconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(seconds) || String(seconds) !== timestamp.trim()) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  // Symmetric window: a clock ahead of ours is as suspicious as one behind,
  // and a request timestamped in the future is either a skewed clock or an
  // attempt to mint a long-lived signature.
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - seconds);
  if (skew > n8nReplayWindowSeconds()) return { ok: false, reason: 'expired' };

  if (!signature.startsWith(PREFIX)) return { ok: false, reason: 'bad_signature' };

  const expected = await sign(secret, timestamp, rawBody);
  return timingSafeEqual(signature.slice(PREFIX.length).toLowerCase(), expected)
    ? { ok: true }
    : { ok: false, reason: 'bad_signature' };
}

/**
 * The canonical signature for a timestamp and body.
 *
 * Exported so the tests sign requests exactly as n8n will, rather than
 * asserting against a hardcoded hex string that would happily keep passing if
 * the canonical form changed.
 */
export async function sign(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v1:${timestamp}:${rawBody}`)
  );
  return Array.prototype.slice
    .call(new Uint8Array(mac))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}
