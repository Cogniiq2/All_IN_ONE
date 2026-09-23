import 'server-only';

/**
 * Signup context and the verification hand-off.
 *
 * Kept out of the route so the route stays a boundary: parse, authorise,
 * delegate, answer.
 */

import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * The wording version a guest agreed to, recorded with every consent.
 *
 * Bump this whenever the consent sentence on the QR page changes. "What did
 * this person actually agree to" then stays a query rather than an argument,
 * which is the whole point of recording consent as evidence.
 */
export const MARKETING_CONSENT_VERSION = '2026-09-25.1';
// History — the sentence each version showed is in git, at the commit that
// introduced it (app/(site)/guest/privileges/privileges-client.tsx):
//   2026-09-24.1  first wording ("Ich möchte gelegentlich Nachrichten …")
//   2026-09-25.1  names the sender, the channel, the double opt-in and both
//                 ways to withdraw

export interface SignupContext {
  campaignCode?: string;
  unitId: string | null;
  locale: 'de' | 'en';
}

/**
 * Read the campaign and unit a QR code named.
 *
 * Both are looked up rather than trusted: a QR code is printed on a wall
 * where anyone can photograph it, so its parameters are a HINT about which
 * apartment the guest is standing in, never an authority. An unknown slug or
 * code resolves to nothing and the signup still works — it simply earns the
 * unscoped campaigns.
 */
export async function resolveSignupContext(body: Record<string, unknown>): Promise<SignupContext> {
  const campaignCode = typeof body.campaign === 'string' && /^[a-z0-9][a-z0-9-]{1,48}$/.test(body.campaign) ? body.campaign : undefined;
  const unitSlug = typeof body.unit === 'string' && /^[a-z0-9-]{2,64}$/.test(body.unit) ? body.unit : undefined;
  const locale: 'de' | 'en' = body.locale === 'en' ? 'en' : 'de';

  let unitId: string | null = null;
  if (unitSlug) {
    const { data } = await supabaseAdmin().from('bolagio_units').select('id').eq('slug', unitSlug).maybeSingle();
    unitId = (data as { id?: string } | null)?.id ?? null;
  }

  return { campaignCode, unitId, locale };
}

/**
 * Hand the verification email to the outbox.
 *
 * ── What is NOT in the payload ───────────────────────────────────────────
 * The email address. `bolagio_outbox_events` is documented as carrying
 * references and never guest PII, and this feature does not become the
 * exception that quietly makes that comment false. The delivery worker
 * resolves the recipient from the identity id through the internal API,
 * exactly as guest messaging already does.
 *
 * The TOKEN is in the payload, because the worker has to put it in the link
 * and there is nowhere else it can come from — the database holds only its
 * hash, on purpose. The outbox is service-role-only and rows are processed
 * and retained under the same access rules as the rest of the booking core;
 * the token is single-use and expires in 72 hours.
 */
export async function emitPrivilegeVerification(input: {
  identityId: string;
  token: string;
  locale: 'de' | 'en';
  campaignCode?: string;
  /**
   * What the click will confirm. `verify_address` for a first signup (and
   * any consent ticked with it); `confirm_marketing_consent` for an already
   * verified address whose owner ticked the box later. Either way the email
   * is TRANSACTIONAL: it asks for a click and contains no advertising — a
   * confirmation email that advertises is itself unsolicited advertising.
   */
  purpose: 'verify_address' | 'confirm_marketing_consent';
}): Promise<void> {
  const { error } = await supabaseAdmin().from('bolagio_outbox_events').insert({
    event_type: 'guest_privileges_verify',
    event_version: 1,
    aggregate_type: 'guest_identity',
    aggregate_id: input.identityId,
    payload: {
      token: input.token,
      locale: input.locale,
      purpose: input.purpose,
      ...(input.campaignCode ? { campaign: input.campaignCode } : {}),
    },
  });
  if (error) throw error;
}
