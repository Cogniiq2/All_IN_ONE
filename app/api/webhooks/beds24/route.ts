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
 *  5. Reconciles a BoLaGio booking if the event concerns one — a cancellation
 *     made in Beds24 must not leave a stay showing as confirmed here.
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
import { releaseIfHeld, syncInventory } from '@/lib/booking/service';
import { isIsoDate } from '@/lib/booking/stay-rules';
import type { Beds24WebhookPayload } from '@/lib/integrations/beds24/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Beds24 actions that mean "the calendar just changed". */
const INVENTORY_ACTIONS = new Set(['created', 'modified', 'cancelled', 'new', 'booking']);

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

  // A reservation this website created, changed at the provider. A
  // cancellation in Beds24 releases whatever BoLaGio still thinks it holds.
  if (externalId && (action === 'cancelled' || action === 'modified')) {
    const intent = await findIntentByProviderBookingId(externalId);
    if (intent && action === 'cancelled') {
      await releaseIfHeld(intent, 'provider_cancelled', logger);
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
