/**
 * POST /api/booking/reservations/financial-debug — TEMPORARY, STAGING ONLY.
 *
 *   x-bolagio-signature: BOOKING_SYNC_SECRET
 *   { source?: 'booking_com' | 'airbnb', externalBookingId? }
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 * The finance subledger has to know which financial facts Beds24 actually
 * supplies for a channel reservation — whether `price` is gross or net,
 * whether the Booking.com commission is present at all, whether taxes and
 * fees are broken out, what `invoiceItems` looks like. The Beds24
 * documentation is unreachable from the environment this is built in
 * (docs/beds24-contract.md), so the answer has to be read off one real,
 * already-imported reservation. This endpoint reads it and describes its
 * SHAPE.
 *
 * It is a diagnostic, not a feature. It is expected to be deleted once
 * docs/beds24-financial-debug.md records the answers.
 *
 * ── What it is not allowed to do, and does not ───────────────────────────
 *  · It writes nothing. One `GET /bookings?id=…&includeInvoiceItems=true`.
 *  · It touches no finance table, and no finance logic is imported here.
 *  · It touches no booking intent, no hold, no payment; the direct-booking
 *    gate is neither read nor changed.
 *  · It returns NO personal data. Not a name, an email, a phone number, an
 *    address, a note, a card, a channel confirmation number, nor the raw
 *    reservation. `lib/integrations/beds24/financial-probe.ts` holds the
 *    three rules that make that true, and
 *    `tests/reservation-financial-debug.test.ts` proves them against a
 *    fixture whose every field is personal data.
 *
 * ── Why staging only ─────────────────────────────────────────────────────
 * Production holds real guests. A diagnostic that reads a live booking into
 * memory has no business running there, however careful its filter is, so
 * the route does not exist outside `APP_ENV=staging` — 404, not 403, because
 * a temporary endpoint should not advertise itself.
 */

import type { NextRequest } from 'next/server';
import { createLogger } from '@/lib/booking/logger';
import { inventorySyncSecret } from '@/lib/booking/config';
import { appEnvironment } from '@/lib/config/environment';
import { bookingErrorResponse, bookingJson, requireBackend, verifySharedSecret } from '@/lib/booking/http';
import { findReservationForProbe } from '@/lib/booking/reservation-repository';
import { probeBookingFinancials } from '@/lib/integrations/beds24/financial-probe';
import type { ReservationSource } from '@/lib/integrations/beds24/reservations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The channels a probe may target. `direct` is excluded: it is BoLaGio's own. */
const PROBEABLE: readonly ReservationSource[] = ['booking_com', 'airbnb'];

export async function POST(request: NextRequest) {
  const logger = createLogger(request);

  // Authentication first, in constant time, before the body is read and
  // before the environment is disclosed by the shape of the answer.
  if (!verifySharedSecret(request, inventorySyncSecret())) {
    return new Response(null, { status: 401 });
  }

  // Then the environment. Outside staging this route simply is not here.
  if (appEnvironment() !== 'staging') {
    return new Response(null, { status: 404 });
  }

  try {
    requireBackend();

    let source: ReservationSource = 'booking_com';
    let externalBookingId: string | undefined;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.source === 'string' && (PROBEABLE as readonly string[]).includes(body.source)) {
        source = body.source as ReservationSource;
      }
      // Provider ids are digits in every booking seen on this account; the
      // pattern is a validation, not a parser, and an id that does not match
      // is ignored rather than sent on.
      if (typeof body.externalBookingId === 'string' && /^[0-9]{1,32}$/.test(body.externalBookingId)) {
        externalBookingId = body.externalBookingId;
      }
    } catch {
      // No body means "the most recent Booking.com reservation", which is the
      // case this endpoint was asked for.
    }

    const reference = await findReservationForProbe({ source, externalBookingId });
    if (!reference) {
      logger.info('reservation.financial_probe', { provider: 'beds24', outcome: 'no_reservation' });
      return bookingJson(
        { environment: 'staging', source, found: false, reason: 'no_imported_reservation' as const },
        logger,
        404
      );
    }

    const probe = await probeBookingFinancials(reference.externalBookingId);
    logger.info('reservation.financial_probe', {
      provider: 'beds24',
      outcome: probe.found ? 'described' : 'not_found_at_provider',
      status: reference.providerStatus,
    });

    return bookingJson(
      {
        environment: 'staging',
        // The reservation is identified by CHANNEL and STATE, never by its
        // provider id: an id points at one guest's stay, and the shape of the
        // financial payload is what this endpoint was asked for.
        reservation: {
          source: reference.source,
          statusClass: reference.statusClass,
          providerStatus: reference.providerStatus,
          pinned: externalBookingId !== undefined,
        },
        providerQuery: { path: '/bookings', method: 'GET', ...probe.query, id: '[selected]' },
        found: probe.found,
        ...(probe.report ? { financial: probe.report } : {}),
      },
      logger
    );
  } catch (cause) {
    return bookingErrorResponse(cause, logger);
  }
}
