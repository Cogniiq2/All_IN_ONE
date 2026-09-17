/**
 * POST /api/booking/reconcile
 *
 *   x-bolagio-signature: BOOKING_SYNC_SECRET
 *   { limit? }  →  { scanned, resolved, failed, escalated, paymentEvents, queued }
 *
 * The recovery pass. Drains the verified payment inbox, sweeps for bookings
 * stuck in a reserving state, and works the reconciliation queue most-severe
 * first.
 *
 * ── How it should run ────────────────────────────────────────────────────
 * Every 2–5 minutes, from whichever scheduler the deployment has: Supabase
 * Cron (`pg_cron` + `pg_net`), a Cloudflare Cron Trigger, or an n8n Schedule
 * node. It does not depend on a browser and it does not depend on n8n — n8n
 * calling it is a convenience, and any one of the three is sufficient on its
 * own. `docs/booking-reconciliation.md` has the SQL for the Supabase option.
 *
 * ── Why the payment inbox is drained here ────────────────────────────────
 * The webhook stores and returns a 2xx in milliseconds so PayPal never
 * retries because Beds24 was slow. The Beds24 finalization that a completed
 * capture triggers therefore has to happen somewhere else, and this is it. A
 * capture sitting unprocessed for two minutes is fine; PayPal retrying a
 * delivery for three days because we held its connection open is not.
 *
 * Bounded by `limit` so one invocation cannot run for an unbounded time on a
 * platform with a request deadline. A backlog drains over several passes.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { inventorySyncSecret } from '@/lib/booking/config';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { runReconciliation } from '@/lib/booking/reconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!verifySharedSecret(request, inventorySyncSecret())) {
    logger.warn('reconcile.claim', { outcome: 'unauthorised' });
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();

    let limit = 25;
    try {
      const body = (await request.json()) as { limit?: unknown };
      if (typeof body.limit === 'number') limit = Math.min(100, Math.max(1, body.limit));
    } catch {
      // No body is fine — a cron trigger rarely sends one.
    }

    const report = await runReconciliation(logger, limit);
    return bookingJson(report, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
