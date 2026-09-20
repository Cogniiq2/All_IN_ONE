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
import { recordSchedulerRun } from '@/lib/booking/commands';
import { runOperationsPass } from '@/lib/booking/operations';
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

    /*
     * Heartbeat around the pass, whatever its outcome. "Is reconciliation
     * running?" is answered from `bolagio_scheduler_status`, and a pass that
     * throws still leaves a row — one that says so.
     */
    const started = new Date();
    let report;
    try {
      report = await runReconciliation(logger, limit);
    } catch (cause) {
      await recordSchedulerRun({ job: 'reconcile', startedAt: started, ok: false, error: describe(cause), worker: logger.correlationId });
      throw cause;
    }
    await recordSchedulerRun({ job: 'reconcile', startedAt: started, ok: true, report: { ...report }, worker: logger.correlationId });

    /*
     * The operations pass rides on the same schedule, AFTER reconciliation:
     * a stay that was just confirmed gets its turnover in the same minute.
     * Its failure is recorded and does not fail the reconciliation answer —
     * the money-and-inventory work above is already done and reported.
     */
    const opsStarted = new Date();
    let operations: Awaited<ReturnType<typeof runOperationsPass>> | null = null;
    try {
      operations = await runOperationsPass(logger);
      await recordSchedulerRun({
        job: 'operations',
        startedAt: opsStarted,
        ok: true,
        report: { ...operations.turnovers, ...prefixed('events_', { ...operations.guestEvents }) },
        worker: logger.correlationId,
      });
    } catch (cause) {
      logger.error('operations.pass', cause);
      await recordSchedulerRun({ job: 'operations', startedAt: opsStarted, ok: false, error: describe(cause), worker: logger.correlationId });
    }

    return bookingJson({ ...report, operations }, logger);
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown';
}

function prefixed(prefix: string, counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) out[`${prefix}${k}`] = v;
  return out;
}
