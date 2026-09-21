/**
 * POST /api/webhooks/beds24
 *
 * Where a reservation that happened somewhere else arrives.
 *
 *     Booking.com ──┐
 *     Airbnb ───────┼─► Beds24 ─► this endpoint ─► Supabase inventory
 *     Beds24 UI ────┘
 *
 * ── What it does, in order ───────────────────────────────────────────────
 *  1. Verifies the shared secret, in constant time. Nothing else happens
 *     first: an unverified body is not parsed, hashed or stored.
 *  2. Persists the RAW payload, keyed by a hash of the body. A delivery that
 *     has already been stored is acknowledged and dropped, so Beds24 retrying
 *     five times is processed once.
 *  3. Maps the Beds24 room back to a BoLaGio unit through the database. No
 *     Beds24 id is ever hardcoded.
 *  4. Invalidates the affected nights in the cache, and asks for a fresh bulk
 *     sync of that unit so the calendar is right again within seconds.
 *  5. REFRESHES the canonical reservation by asking Beds24 for that booking,
 *     by id. The payload is the signal; the fresh read is the state.
 *  6. QUEUES a reconciliation job when the event concerns a booking of ours.
 *     It does NOT act on what the payload says.
 *
 * ── The change, and why ──────────────────────────────────────────────────
 * This endpoint used to call `releaseIfHeld` directly on `action === 'cancelled'`.
 * The webhook secret is a static shared string, so a forged payload could
 * release a confirmed booking's hold — and even a genuine payload is a claim
 * about the past that may arrive late, twice, or out of order.
 *
 * A webhook is a SIGNAL that something changed, not evidence of what it is
 * now. So the flow is:
 *
 *     webhook → durable event → reconciliation job → FRESH BEDS24 READ → act
 *
 * The inventory resync below is the exception, and safely so: it closes the
 * affected nights immediately and then re-reads the calendar from Beds24. The
 * worst a forged payload achieves is a few nights briefly shown as unavailable
 * until the resync corrects them — the safe direction.
 *
 * ── What it never does ───────────────────────────────────────────────────
 * Return an internal error to the caller. Beds24 sees 200 (accepted) or 401
 * (not you), and nothing else — a webhook endpoint that answers with a
 * database message is a free reconnaissance tool. Processing failures are
 * recorded against the stored event and are visible in the logs, not in the
 * response.
 *
 * Errors after step 2 also still answer 200: the payload is safely persisted,
 * and a 500 would make Beds24 retry a delivery we have already accepted.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { beds24WebhookSecret } from '@/lib/booking/config';
import { requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { payloadHash } from '@/lib/booking/reference';
import {
  findIntentByProviderBookingId,
  findUnitByProviderRoom,
  invalidateInventory,
  markIntegrationEvent,
  recordIntegrationEvent,
} from '@/lib/booking/repository';
import { queueReconciliation } from '@/lib/booking/commands';
import { syncInventory } from '@/lib/booking/service';
import { refreshReservation } from '@/lib/booking/reservation-sync';
import { mayHoldExternalBooking } from '@/lib/booking/states';
import { isIsoDate } from '@/lib/booking/stay-rules';
import type { Beds24WebhookPayload } from '@/lib/integrations/beds24/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Beds24 actions that mean "the calendar just changed". */
const INVENTORY_ACTIONS = new Set(['created', 'modified', 'cancelled', 'new', 'booking']);

/**
 * Actions that mean "a reservation changed", and so warrant a fresh read of
 * it. Deliberately the same set: every one of them can change a stay, and an
 * action this list has not met costs a missed refresh, not a wrong one — the
 * scheduled import still catches it.
 */
const RESERVATION_ACTIONS = INVENTORY_ACTIONS;

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!verifySharedSecret(request, beds24WebhookSecret())) {
    logger.warn('webhook.beds24', { outcome: 'unauthorised' });
    return new Response(null, { status: 401 });
  }

  let eventId = '';
  try {
    requireBackend();

    const raw = await request.text();
    if (raw.length > 256_000) return accepted();

    const hash = await payloadHash(raw);
    let payload: Beds24WebhookPayload;
    try {
      payload = JSON.parse(raw) as Beds24WebhookPayload;
    } catch {
      logger.warn('webhook.beds24', { outcome: 'unparseable' });
      return accepted();
    }

    const booking = payload.booking ?? {};
    const externalId = String(payload.bookingId ?? booking.id ?? '');
    const action = String(payload.action ?? 'unknown').toLowerCase();

    const stored = await recordIntegrationEvent({
      eventType: action,
      externalId: externalId || undefined,
      payload,
      payloadHash: hash,
    });

    if (stored.duplicate) {
      logger.info('webhook.beds24', { eventType: action, externalId, duplicate: true });
      return accepted();
    }
    eventId = stored.id;

    await process(payload, action, externalId, logger);
    await markIntegrationEvent(eventId, 'processed');
    logger.info('webhook.beds24', { eventType: action, externalId, outcome: 'processed' });
  } catch (cause) {
    logger.error('webhook.beds24', cause);
    if (eventId) await markIntegrationEvent(eventId, 'failed', 'processing_error').catch(() => {});
  }

  return accepted();
}

async function process(
  payload: Beds24WebhookPayload,
  action: string,
  externalId: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const booking = payload.booking ?? {};
  const propertyId = String(payload.propertyId ?? booking.propertyId ?? '');
  const roomId = String(payload.roomId ?? booking.roomId ?? '');

  if (propertyId && roomId && INVENTORY_ACTIONS.has(action)) {
    const unitId = await findUnitByProviderRoom(propertyId, roomId);
    if (unitId) {
      const arrival = booking.arrival;
      const departure = booking.departure;
      // The affected nights are closed immediately, then the bulk sync
      // reopens whatever is genuinely still free. Closing first is the safe
      // order: a stale "available" between the event and the sync is how a
      // Booking.com reservation gets sold twice.
      if (isIsoDate(arrival) && isIsoDate(departure)) {
        await invalidateInventory(unitId, arrival, departure);
      }
      const unitSlug = await slugForUnit(unitId);
      if (unitSlug) await syncInventory(logger, unitSlug);
    }
  }

  /*
   * The canonical reservation, refreshed from the provider.
   *
   * This is where a Booking.com reservation becomes visible to BoLaGio within
   * seconds rather than at the next scheduled import. The webhook payload is
   * NOT the source: `refreshReservation` issues a GET for that booking id and
   * writes what Beds24 actually says. A forged delivery therefore costs one
   * wasted read and can change nothing — the worst it can do is make the
   * system re-import a reservation that is already correct.
   *
   * An id on a room no enabled mapping covers is skipped, and a provider that
   * cannot be reached is logged: the scheduled import is the floor under this
   * and will pick the change up on its next pass.
   */
  if (externalId && RESERVATION_ACTIONS.has(action)) {
    try {
      const outcome = await refreshReservation(externalId, logger);
      logger.info('webhook.beds24', { externalId, eventType: action, outcome: outcome ?? 'skipped_unmapped_room' });
    } catch (cause) {
      logger.error('webhook.beds24', cause, { externalId, eventType: action, outcome: 'reservation_refresh_failed' });
    }
  }

  /*
   * A reservation this website created, changed at the provider.
   *
   * The payload says it was cancelled or modified. That is a CLAIM, and this
   * endpoint does not act on claims — it queues a job, and the reconciliation
   * engine reads the booking back from Beds24 before changing anything. A
   * forged 'cancelled' therefore achieves at most one wasted Beds24 read.
   */
  if (externalId && (action === 'cancelled' || action === 'modified')) {
    const intent = await findIntentByProviderBookingId(externalId);
    if (intent && mayHoldExternalBooking(intent.status)) {
      await queueReconciliation(
        intent.id,
        // Deliberately the release-verification job: it re-reads Beds24 and
        // only frees the local range once the nights are provably open.
        'BEDS24_RELEASE_UNVERIFIED',
        2,
        { source: 'beds24_webhook', action }
      );
      logger.info('webhook.beds24', {
        reference: intent.reference,
        externalId,
        eventType: action,
        outcome: 'queued_for_reconciliation',
      });
    }
  }
}

async function slugForUnit(unitId: string): Promise<string | undefined> {
  const { supabaseAdmin } = await import('@/lib/supabase/server');
  const { data } = await supabaseAdmin().from('bolagio_units').select('slug').eq('id', unitId).maybeSingle();
  return (data?.slug as string | undefined) ?? undefined;
}

/** The only success response. Carries nothing. */
function accepted(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
