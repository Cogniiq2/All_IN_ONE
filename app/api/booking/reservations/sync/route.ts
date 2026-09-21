/**
 * POST /api/booking/reservations/sync
 *
 * Import what is actually booked at Beds24 into `bolagio_reservations`.
 *
 *   x-bolagio-signature: BOOKING_SYNC_SECRET
 *   { unitSlug?, from?, to? }   // omit everything for the scheduled case
 *
 * ── Read-only ────────────────────────────────────────────────────────────
 * Every provider call behind this route is a GET. Nothing is created,
 * modified, cancelled, confirmed or acknowledged at Beds24. A forged call
 * therefore achieves exactly one thing: the system does its ordinary
 * maintenance read, which is why a plain shared secret is the right
 * protection here — the same one `/api/booking/sync` already uses.
 *
 * ── What comes back ──────────────────────────────────────────────────────
 * Counts and the window. No guest name, no email, no phone, no reservation
 * contents, no provider body. `tests/reservation-sync-route.test.ts` asserts
 * this on a payload full of personal data, because a summary endpoint that
 * grows a "sample" field one day is exactly how a PII leak happens.
 *
 * ── How it is meant to run ───────────────────────────────────────────────
 * From the same pg_cron schedule as the other jobs, every 15–30 minutes. The
 * Beds24 webhook refreshes an individual reservation within seconds of a
 * change; this is the floor under it, and the only thing that performs the
 * initial backfill. See docs/beds24-reservations.md §Scheduling.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { inventorySyncSecret } from '@/lib/booking/config';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { recordSchedulerRun } from '@/lib/booking/commands';
import { syncReservations } from '@/lib/booking/reservation-sync';
import { isIsoDate } from '@/lib/booking/stay-rules';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  // Before anything else, and in constant time. An unverified request is not
  // parsed, and an unset secret is a refusal rather than an open door.
  if (!verifySharedSecret(request, inventorySyncSecret())) {
    return new Response(null, { status: 401 });
  }

  const started = new Date();
  try {
    requireBackend();

    let unitSlug: string | undefined;
    let from: string | undefined;
    let to: string | undefined;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.unitSlug === 'string' && /^[a-z0-9-]{2,64}$/.test(body.unitSlug)) unitSlug = body.unitSlug;
      if (isIsoDate(body.from)) from = body.from;
      if (isIsoDate(body.to)) to = body.to;
    } catch {
      // An empty body means "the default horizon, every mapped unit", which
      // is the normal scheduled case.
    }
    // A caller may widen or move the window but never invert it; a reversed
    // range would read nothing and report a healthy zero.
    if (from && to && to <= from) {
      from = undefined;
      to = undefined;
    }

    try {
      const report = await syncReservations(logger, { unitSlug, from, to });
      await recordSchedulerRun({
        job: 'reservation_sync',
        startedAt: started,
        ok: report.failed === 0,
        // Counts only. This is written to the heartbeat table and read by the
        // System page; it must stay free of anything guest-shaped.
        report: {
          fetched: report.fetched,
          inserted: report.inserted,
          updated: report.updated,
          skipped: report.skipped,
          malformed: report.malformed,
          failed: report.failed,
          units: report.units,
          requests: report.requests,
          truncated: report.truncated,
        },
        worker: logger.correlationId,
      });
      return bookingJson(report, logger);
    } catch (cause) {
      await recordSchedulerRun({
        job: 'reservation_sync',
        startedAt: started,
        ok: false,
        error: cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown',
        worker: logger.correlationId,
      });
      throw cause;
    }
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
