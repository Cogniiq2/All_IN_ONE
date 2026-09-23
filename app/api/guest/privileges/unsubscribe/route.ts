/**
 * /api/guest/privileges/unsubscribe?id=…&sig=…
 *
 * Withdrawal of marketing consent — as easy as giving it (Art. 7 Abs. 3 GDPR),
 * and in place BEFORE any marketing email can be sent: the audience query in
 * lib/privileges/repository.ts refuses while this mechanism is unconfigured.
 *
 * ── GET does not unsubscribe ─────────────────────────────────────────────
 * Mail security scanners and link previewers follow every link in an email.
 * A GET that withdrew consent would withdraw it for guests who never clicked,
 * and RFC 8058 forbids exactly that. GET redirects to a page with one button;
 * the button POSTs.
 *
 * ── POST unsubscribes ────────────────────────────────────────────────────
 * From that page (JSON body), or directly from a mail client's one-click
 * button (RFC 8058: form body `List-Unsubscribe=One-Click`, the id and
 * signature in the query string of the URL from the List-Unsubscribe header).
 *
 * ── The answer is always the same ────────────────────────────────────────
 * A valid link, a forged one, an identity that never consented, one already
 * withdrawn, and an internal failure all answer 200 `{ status: 'unsubscribed' }`.
 * The link carries a uuid and an HMAC, never an address, so there is nothing
 * to enumerate — and the neutral answer keeps it that way.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { clientKey, rateLimit, requireBackend } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { verifyUnsubscribe } from '@/lib/privileges/marketing';
import { withdrawMarketingConsent } from '@/lib/privileges/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DONE = { status: 'unsubscribed' as const };

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Same-origin page; only the two parameters are carried, re-validated there.
  const destination = new URL('/guest/privileges/unsubscribe', url.origin);
  const id = url.searchParams.get('id');
  const sig = url.searchParams.get('sig');
  if (id && /^[0-9a-fA-F-]{36}$/.test(id)) destination.searchParams.set('id', id);
  if (sig && /^[0-9a-fA-F]{64}$/.test(sig)) destination.searchParams.set('sig', sig);
  return NextResponse.redirect(destination, { status: 303, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const logger = createLogger(request);
  const url = new URL(request.url);

  try {
    rateLimit(clientKey(request, 'privileges-unsubscribe'), 20, 60_000);
    requireBackend();

    const { id, sig, oneClick } = await readParams(request, url);
    if (await verifyUnsubscribe(id, sig)) {
      const result = await withdrawMarketingConsent(id as string, oneClick ? 'one_click' : 'unsubscribe_link');
      logger.info('privileges.unsubscribe', { outcome: result.changed ? 'withdrawn' : 'no_change' });
    } else {
      logger.info('privileges.unsubscribe', { outcome: 'invalid' });
    }
  } catch (cause) {
    if (cause instanceof BookingError && cause.code === 'rate_limited') {
      return json({ status: 'rate_limited' }, 429, logger.correlationId);
    }
    // A failure is logged for an operator and answered neutrally. The guest
    // can always withdraw by replying to any email or writing to us, which
    // the page says.
    logger.error('privileges.unsubscribe', cause);
  }
  return json(DONE, 200, logger.correlationId);
}

async function readParams(request: NextRequest, url: URL): Promise<{ id: unknown; sig: unknown; oneClick: boolean }> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { id: body.id, sig: body.sig, oneClick: false };
  }
  // RFC 8058 one-click: form-encoded `List-Unsubscribe=One-Click`, with the
  // parameters in the URL the List-Unsubscribe header carried.
  const text = await request.text().catch(() => '');
  const form = new URLSearchParams(text);
  return {
    id: url.searchParams.get('id') ?? form.get('id'),
    sig: url.searchParams.get('sig') ?? form.get('sig'),
    oneClick: form.get('List-Unsubscribe') === 'One-Click',
  };
}

function json(body: unknown, status: number, correlationId: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0', 'x-correlation-id': correlationId },
  });
}
