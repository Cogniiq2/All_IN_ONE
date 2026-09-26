/**
 * POST /api/booking/finance/backfill
 *
 *   x-bolagio-signature: BOOKING_SYNC_SECRET
 *   { backfill?: boolean = true, limit?: number }
 *     →  { pass: FinancePassReport, pipeline: FinancePipelineStatus | null }
 *
 * Re-runs the finance backfill on demand and drains one batch now.
 *
 * `backfill: true` queues EVERY intent whose expected finance fact (revenue,
 * captured payment, refund) does not exist — including rows a previous pass
 * already marked done or failed — then derives one bounded batch. The rest
 * drains on the reconcile schedule, a batch per pass, so calling this once is
 * enough; calling it again is harmless: every fact is idempotent on its own
 * key, and nothing already in the ledger is written twice.
 *
 * Never writes a booking or payment row. Returns counts only: no guest data.
 * Migration 20260927 already queues the history when it is applied; this is
 * for re-running after a fix, or for draining faster than the schedule.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { inventorySyncSecret } from '@/lib/booking/config';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { runFinanceIngestionPass } from '@/lib/finance/commands';
import { supabaseFinanceSource } from '@/lib/finance/source-supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!verifySharedSecret(request, inventorySyncSecret())) {
    logger.warn('finance.backfill', { outcome: 'unauthorised' });
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();

    let backfill = true;
    let limit: number | undefined;
    try {
      const body = (await request.json()) as { backfill?: unknown; limit?: unknown };
      if (body.backfill === false) backfill = false;
      if (typeof body.limit === 'number' && Number.isInteger(body.limit)) limit = Math.min(100, Math.max(1, body.limit));
    } catch {
      // No body: backfill with the configured batch.
    }

    const pass = await runFinanceIngestionPass({ actor: 'system:finance-backfill', backfill, limit });
    const pipeline = await supabaseFinanceSource().pipelineStatus().catch(() => null);
    logger.info('finance.backfill', {
      outcome: pass.errors.length > 0 ? 'partial' : 'ok',
      count: pass.claimed,
      resolution: `mode=${pass.mode} queued=${pass.enqueued} done=${pass.settled} failed=${pass.failed} remaining=${pipeline?.queue_pending ?? 'unknown'}`,
    });
    // Error strings carry booking references and database messages, never guest data.
    return bookingJson({ pass, pipeline }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
