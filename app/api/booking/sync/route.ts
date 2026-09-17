/**
 * POST /api/booking/sync
 *
 * The scheduled job: pull the inventory horizon from Beds24 into Supabase, and
 * sweep any holds that ran out without being paid for.
 *
 *   x-bolagio-signature: BOOKING_SYNC_SECRET
 *   { unitSlug? }   // omit to sync every bookable unit
 *
 * ── How it is meant to run ───────────────────────────────────────────────
 * From a Cloudflare Cron Trigger or an n8n schedule, every 15–60 minutes. It
 * is not the only thing keeping the cache fresh — the Beds24 webhook
 * invalidates and resyncs a unit within seconds of a reservation — it is the
 * floor under it, for the deliveries that never arrive.
 *
 * ── The hold sweep, and why it lives here ────────────────────────────────
 * A guest who closes the payment page never tells us. Without this, their
 * fifteen-minute hold would sit at Beds24 until someone noticed, and those
 * nights would be closed on Booking.com and Airbnb too. The sweep releases
 * them, so an abandoned checkout costs nothing.
 *
 * One bulk call per unit, never one per date.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { inventorySyncSecret } from '@/lib/booking/config';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { findExpiredHolds } from '@/lib/booking/repository';
import { expireStaleHolds, syncInventory } from '@/lib/booking/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!verifySharedSecret(request, inventorySyncSecret())) {
    return new Response(null, { status: 401 });
  }

  try {
    requireBackend();

    let unitSlug: string | undefined;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.unitSlug === 'string' && /^[a-z0-9-]{2,64}$/.test(body.unitSlug)) {
        unitSlug = body.unitSlug;
      }
    } catch {
      // An empty body means "everything", which is the normal scheduled case.
    }

    /*
     * Leases first: a hold that has just run out should be back on sale in the
     * same pass that refreshes the calendar, not the next one.
     *
     * `expireStaleHolds` does NOT release on the clock. Each candidate goes
     * through `evaluateLease`, which refuses while any payment evidence exists
     * — a paid-side state, a payment column that is not a definitive no, an
     * uncertain external operation, or a verified webhook still unprocessed.
     * `heldForPayment` counts the ones it refused, which is the number worth
     * watching: a rising count means payments are landing later than the lease.
     */
    const leases = await expireStaleHolds(await findExpiredHolds(), logger);
    const result = await syncInventory(logger, unitSlug);

    return bookingJson(
      { ...result, holdsReleased: leases.released, heldForPayment: leases.heldForPayment },
      logger
    );
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
