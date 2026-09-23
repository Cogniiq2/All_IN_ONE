/**
 * ══════════════════════════════════════════════════════════════════════════
 * MARKETING CONSENT — who may be written to, and how they stop it.
 *
 * Three rules, each enforced here rather than left to whoever one day builds
 * a newsletter:
 *
 *   1. CONFIRMED consent only. Ticking the box records `marketing_consent_at`;
 *      only the click on the emailed confirmation link sets
 *      `marketing_consent_confirmed_at`. Marketable = confirmed at or after
 *      the latest tick, and not withdrawn since. A booking email address is
 *      never marketing consent, and nothing here reads booking tables.
 *
 *   2. Withdrawal as easy as consent (Art. 7 Abs. 3 GDPR). Every marketing
 *      email must carry a signed unsubscribe link and RFC 8058 one-click
 *      headers. The link needs no login, reveals nothing, and works forever.
 *
 *   3. No unsubscribe mechanism, no marketing. `marketingRecipients()` in the
 *      repository — the ONLY way to read an audience — refuses unless the
 *      signing secret is configured AND the consent wording has been approved
 *      (lib/legal/messaging.ts). There is no other door.
 *
 * The signature is an HMAC-SHA256 over the identity id, keyed by
 * PRIVILEGES_UNSUBSCRIBE_SECRET. It proves the link was issued by BoLaGio for
 * that identity; it contains no email address, so a forwarded or leaked link
 * reveals nobody. Web Crypto only — it runs on the Cloudflare Workers runtime.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { SITE_URL } from '@/lib/content/brand';
import { MARKETING_CONSENT_APPROVAL } from '@/lib/legal/messaging';

export interface ConsentState {
  marketingConsentAt: string | null;
  marketingConsentConfirmedAt: string | null;
  marketingWithdrawnAt: string | null;
  verifiedAt: string | null;
}

/** The single definition of "may receive marketing". Pure. */
export function isMarketable(state: ConsentState): boolean {
  if (!state.verifiedAt || !state.marketingConsentAt || !state.marketingConsentConfirmedAt) return false;
  const consent = Date.parse(state.marketingConsentAt);
  const confirmed = Date.parse(state.marketingConsentConfirmedAt);
  if (!Number.isFinite(consent) || !Number.isFinite(confirmed) || confirmed < consent) return false;
  if (state.marketingWithdrawnAt) {
    const withdrawn = Date.parse(state.marketingWithdrawnAt);
    // A withdrawal after the latest consent ends it. A fresh, confirmed
    // consent after a withdrawal is a new consent and counts again.
    if (!Number.isFinite(withdrawn) || withdrawn >= consent) return false;
  }
  return true;
}

/** A consent that was ticked but not (yet) confirmed by the mailbox owner. */
export function consentPendingConfirmation(state: ConsentState): boolean {
  if (!state.marketingConsentAt) return false;
  if (state.marketingWithdrawnAt && Date.parse(state.marketingWithdrawnAt) >= Date.parse(state.marketingConsentAt)) return false;
  return !state.marketingConsentConfirmedAt || Date.parse(state.marketingConsentConfirmedAt) < Date.parse(state.marketingConsentAt);
}

/* ── Signed unsubscribe links ──────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE = /^[0-9a-f]{64}$/;

export function unsubscribeSecret(): string | undefined {
  const value = process.env.PRIVILEGES_UNSUBSCRIBE_SECRET?.trim();
  // A short secret is a guessable one; treat it as absent.
  return value && value.length >= 32 ? value : undefined;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsubscribe:v1:${message}`));
  return Array.prototype.slice
    .call(new Uint8Array(mac))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison of two hex strings of equal length. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signUnsubscribe(identityId: string, secret = unsubscribeSecret()): Promise<string> {
  if (!secret) throw new Error('PRIVILEGES_UNSUBSCRIBE_SECRET is not configured');
  if (!UUID.test(identityId)) throw new Error('not an identity id');
  return hmacHex(secret, identityId.toLowerCase());
}

/** True only for a well-formed id with the signature BoLaGio issued for it. */
export async function verifyUnsubscribe(identityId: unknown, signature: unknown, secret = unsubscribeSecret()): Promise<boolean> {
  if (!secret) return false;
  if (typeof identityId !== 'string' || !UUID.test(identityId)) return false;
  if (typeof signature !== 'string' || !SIGNATURE.test(signature)) return false;
  return safeEqual(await hmacHex(secret, identityId.toLowerCase()), signature.toLowerCase());
}

/**
 * What every marketing email must carry: the visible link, and the RFC 2369 /
 * RFC 8058 headers that let a mail client unsubscribe in one click.
 */
export async function unsubscribeLinks(identityId: string, siteUrl = SITE_URL): Promise<{
  url: string;
  headers: { 'List-Unsubscribe': string; 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}> {
  const sig = await signUnsubscribe(identityId);
  const params = new URLSearchParams({ id: identityId, sig });
  const url = `${siteUrl}/api/guest/privileges/unsubscribe?${params.toString()}`;
  return {
    url,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/**
 * Whether ANY marketing email may be sent from this deployment.
 *
 * Both are required: a working, signed withdrawal mechanism, and the owners'
 * approval of the consent wording that was shown. Without either, the
 * audience query refuses.
 */
export function marketingSendingBlockers(): string[] {
  const blockers: string[] = [];
  if (!unsubscribeSecret()) blockers.push('PRIVILEGES_UNSUBSCRIBE_SECRET is missing or shorter than 32 characters');
  if (!MARKETING_CONSENT_APPROVAL) blockers.push('the marketing consent wording is not approved (lib/legal/messaging.ts)');
  return blockers;
}
