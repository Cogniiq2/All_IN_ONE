import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE OPERATIONS PASS — what a confirmed stay implies, derived on a schedule.
 *
 * Two things, both decided in the database and both idempotent:
 *
 *   turnovers      every confirmed departure needs the unit turned over. One
 *                  row per stay, updated in place if the dates move, voided
 *                  if the stay leaves `confirmed`. A new one emits
 *                  `cleaning.required` to the outbox, once.
 *   guest events   `guest.prearrival_ready`, `guest.checkin_ready` and
 *                  `review.requested`, each driven by TIME relative to a
 *                  confirmed stay in the property's own timezone, each
 *                  emitted at most once per booking.
 *
 * ── What this pass is not ────────────────────────────────────────────────
 * It sends nothing. It knows no access code, no cleaner, no review platform.
 * It turns a confirmed reservation into durable outbox facts that n8n
 * consumes, and it does so OUTSIDE the transactional booking path: a guest
 * message can never delay or fail a payment, because the two never share a
 * request.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { guestOperationsTiming } from '@/lib/booking/property-config';
import { emitGuestEvents, syncTurnovers, type GuestEventReport, type TurnoverSyncReport } from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';

export interface OperationsReport {
  turnovers: TurnoverSyncReport;
  guestEvents: GuestEventReport;
}

export async function runOperationsPass(logger: BookingLogger): Promise<OperationsReport> {
  const turnovers = await syncTurnovers();
  const guestEvents = await emitGuestEvents(guestOperationsTiming());
  logger.info('operations.pass', {
    count: turnovers.created + turnovers.updated + turnovers.voided,
    resolution: `turnovers created=${turnovers.created} updated=${turnovers.updated} voided=${turnovers.voided}; ` +
      `events prearrival=${guestEvents.prearrival} checkin=${guestEvents.checkin} review=${guestEvents.review}`,
  });
  return { turnovers, guestEvents };
}
