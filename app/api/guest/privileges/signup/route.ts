/**
 * POST /api/guest/privileges/signup
 *
 *   { email, campaign?, unit?, locale?, marketingConsent? }
 *
 * A current guest, standing in the apartment, scans the QR code and leaves
 * their email to earn returning-guest benefits on a future direct booking.
 *
 * ── The answer is always the same ────────────────────────────────────────
 * Every well-formed request gets the identical body and the identical status,
 * whether the address is new, already signed up, already verified, or out of
 * verification sends. This endpoint is public and unauthenticated, so any
 * difference in the answer would turn it into an oracle: "is this person a
 * BoLaGio guest?" is not a question a stranger gets to ask.
 *
 * The one thing that differs is whether an email is sent — which only the
 * person holding the mailbox can observe.
 *
 * ── What it cannot do ────────────────────────────────────────────────────
 * Grant anything. Signing up earns nothing until the address is verified by
 * clicking the link, which is both the GDPR double opt-in and the control
 * that stops someone claiming a stranger's benefit by typing their address.
 *
 * No discount, campaign code or eligibility claim is ever accepted from a
 * browser. The benefit is resolved server-side at quote time from the
 * database — see lib/privileges/benefit.ts.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { normalizeEmail } from '@/lib/privileges/benefit';
import { upsertIdentityForSignup } from '@/lib/privileges/repository';
import { emitPrivilegeVerification, resolveSignupContext, MARKETING_CONSENT_VERSION } from '@/lib/privileges/signup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** One body, for every outcome. Constructed once so it cannot drift apart. */
const ACCEPTED = { status: 'check_your_email' as const };

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  try {
    // Per-isolate and explicitly not the security boundary (Cloudflare WAF
    // is), but it stops one client walking an address list through here.
    rateLimit(clientKey(request, 'privileges-signup'), 8, 60_000);
    requireBackend();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    // A malformed address is the ONE case that answers differently, because
    // it tells the sender nothing about anybody else — only about what they
    // typed. Without it a typo looks like success and the guest waits for an
    // email that was never going to arrive.
    if (!email) {
      return json({ status: 'invalid_email' }, 400, logger.correlationId);
    }

    const context = await resolveSignupContext(body);

    const { token, identity } = await upsertIdentityForSignup({
      emailNormalized: email,
      campaignCode: context.campaignCode,
      unitId: context.unitId,
      locale: context.locale,
      // Never defaulted to true, never inferred from the act of signing up.
      marketingConsent: body.marketingConsent === true,
      consentVersion: MARKETING_CONSENT_VERSION,
      consentSource: 'qr_privileges',
    });

    if (token) {
      // The outbox row carries the identity id and NOT the address or the
      // token; the delivery worker resolves the recipient through the
      // internal API, as guest messaging already does.
      await emitPrivilegeVerification({
        identityId: identity.id,
        token,
        locale: context.locale,
        campaignCode: context.campaignCode,
        purpose: identity.verifiedAt ? 'confirm_marketing_consent' : 'verify_address',
      });
    }

    // Counts and ids only. No address, ever, in a log line.
    logger.info('privileges.signup', { outcome: token ? 'verification_sent' : 'no_send', duplicate: !token });
    return json(ACCEPTED, 200, logger.correlationId);
  } catch (cause) {
    if (cause instanceof BookingError && cause.code === 'rate_limited') {
      return json({ status: 'rate_limited' }, 429, logger.correlationId);
    }
    logger.error('privileges.signup', cause);
    // Even a failure answers the neutral body: a 500 here would say "this
    // address did something unusual", which is exactly the oracle above.
    return json(ACCEPTED, 200, logger.correlationId);
  }
}

function json(body: unknown, status: number, correlationId: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0', 'x-correlation-id': correlationId },
  });
}
