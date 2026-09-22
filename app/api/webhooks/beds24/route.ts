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
 *
 * ── How the secret travels ───────────────────────────────────────────────
 * `x-bolagio-signature: <BEDS24_WEBHOOK_SECRET>` is the preferred transport
 * and is tried first. Beds24's webhook configuration does not offer a custom
 * header on every account and every property, and the documentation cannot be
 * reached from the environment this is built in (docs/beds24-contract.md), so
 * the same secret is also accepted as the `token` query parameter:
 *
 *     https://<domain>/api/webhooks/beds24?token=<BEDS24_WEBHOOK_SECRET>
 *
 * Both are compared in constant time and an unset secret refuses everything,
 * so the fallback widens the transport, never the trust. It is a fallback and
 * not the default for a reason: a secret in a URL is written to access logs,
 * proxy logs and browser history in a way a header is not. Use the header
 * where Beds24 offers one, and rotate the secret if a URL leaks.
 * See docs/beds24-webhook.md.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { beds24WebhookSecret } from '@/lib/booking/config';
import { requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { payloadHash, timingSafeEqual } from '@/lib/booking/reference';
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

/*
 * ── Why the reservation refresh is NOT gated on the action ───────────────
 *
 * There used to be a `RESERVATION_ACTIONS` set here, and a delivery whose
 * action was not in it was not refreshed. That gate was a liability: Beds24's
 * webhook action vocabulary is not established for this account — the
 * documentation is unreachable from the environment this is built in — so a
 * provider that says `BOOKING_MODIFIED`, `booking_changed`, or nothing at all
 * would have silently skipped the very read this endpoint exists to perform.
 * A missed cancellation then waits for the next scheduled pass, which is
 * exactly the delay real-time sync is meant to remove.
 *
 * So: any delivery carrying a provider booking id gets a fresh read. It costs
 * one GET, it cannot write anything anywhere, the provider's answer is
 * authoritative regardless of what the payload claimed, and an action this
 * code has never seen is handled correctly by construction rather than by
 * having been listed. `INVENTORY_ACTIONS` keeps its gate because closing
 * nights is a state change, not a read.
 */

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  if (!authenticated(request)) {
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
    // Validated, not merely stringified: an id is what goes into the provider
    // query, and `String({})` is `"[object Object]"`, which would be sent to
    // Beds24 verbatim. A delivery whose id is not a provider id carries no id
    // at all, and the reservation refresh below is simply not attempted.
    const externalId = providerBookingId(payload.bookingId) ?? providerBookingId(booking.id) ?? '';
    const action = String(payload.action ?? 'unknown').toLowerCase().slice(0, 32);

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
  if (externalId) {
    try {
      const outcome = await refreshReservation(externalId, logger);
      logger.info('webhook.beds24', { externalId, eventType: action, outcome });
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

/**
 * The shared secret, from the header or — as a documented fallback — the
 * `token` query parameter. Constant time in both cases, and an unset
 * `BEDS24_WEBHOOK_SECRET` refuses everything rather than opening the door.
 */
function authenticated(request: NextRequest): boolean {
  const expected = beds24WebhookSecret();
  if (!expected) return false;
  if (verifySharedSecret(request, expected)) return true;
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return token !== '' && timingSafeEqual(token, expected);
}

/**
 * A Beds24 booking id, or nothing.
 *
 * Digits, because that is what every booking id on this account is, and
 * because this value is interpolated into a provider query. A number arrives
 * as a number on some deliveries and as a string on others; both are read,
 * and anything else — an object, an array, a null, an injection attempt — is
 * not an id and is dropped rather than coerced.
 */
function providerBookingId(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? String(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^[0-9]{1,32}$/.test(trimmed) ? trimmed : undefined;
}

/** The only success response. Carries nothing. */
function accepted(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
