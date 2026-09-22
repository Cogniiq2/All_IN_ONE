/**
 * GET /api/guest/privileges/verify?token=…
 *
 * The link in the verification email. Consumes the token, marks the address
 * verified, creates the grants it earns, and redirects to the guest page.
 *
 * ── GET, and why that is acceptable here ─────────────────────────────────
 * A verification link is followed from a mail client, which only issues GETs.
 * The state it changes is the guest's own and is idempotent — clicking twice
 * succeeds twice — and the token is single-use and expires, so a prefetching
 * mail client costs nothing beyond verifying the address its owner asked to
 * verify.
 *
 * ── The answer says nothing ──────────────────────────────────────────────
 * A bad, expired, already-used or forged token redirects to the same page
 * with the same neutral state. There is no "no such token" to distinguish
 * from "not yours".
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { isVerificationTokenShaped } from '@/lib/privileges/tokens';
import { verifyIdentity } from '@/lib/privileges/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const logger = createLogger(request);
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  let outcome: 'verified' | 'invalid' = 'invalid';
  try {
    // Bounds a brute-force sweep of the token space to something that would
    // take longer than the heat death of the sun even without this.
    rateLimit(clientKey(request, 'privileges-verify'), 20, 60_000);
    requireBackend();
    if (isVerificationTokenShaped(token)) {
      const result = await verifyIdentity(token);
      if (result.ok) outcome = 'verified';
    }
  } catch (cause) {
    logger.error('privileges.verify', cause);
  }

  logger.info('privileges.verify', { outcome });

  // Relative redirect to our own page, built from the request's own origin —
  // never from a parameter, so there is no open redirect to find here.
  const destination = new URL('/guest/privileges', url.origin);
  destination.searchParams.set('state', outcome === 'verified' ? 'verified' : 'link-invalid');
  return NextResponse.redirect(destination, { status: 303, headers: { 'cache-control': 'no-store' } });
}
