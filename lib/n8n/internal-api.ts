import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE INTERNAL API n8n IS ALLOWED TO USE.
 *
 * ── What n8n can do ──────────────────────────────────────────────────────
 *   claim durable events                    (so automation survives downtime)
 *   acknowledge one it handled
 *   report one it could not handle
 *   read the context needed to write a message or an invoice
 *
 * ── What n8n cannot do, by construction ──────────────────────────────────
 *   mark a booking paid
 *   mark a booking confirmed
 *   cancel a booking
 *   release inventory
 *   change an amount
 *   move a booking to ANY state
 *
 * There is no endpoint for those, and the database would refuse them anyway:
 * a status change is only accepted from inside `bolagio_booking_transition()`,
 * and the internal API never calls it. Those states come from a verified
 * payment provider event or an authoritative server-side call, and nowhere
 * else.
 *
 * This is not distrust of n8n. It is that a workflow engine is an excellent
 * place to write a "your booking is confirmed" email and a terrible place to
 * decide whether a booking is confirmed — the two failure modes are an
 * unsent email and a guest told they have a room they do not have.
 *
 * ── PII ──────────────────────────────────────────────────────────────────
 * Outbox payloads carry references, never guest details. `bookingContext` is
 * where a name and an email are handed over, once, per booking, on an
 * authenticated request — so guest data is never sitting in a queue table, a
 * webhook log or an n8n execution history.
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  ackOutboxEvent,
  claimOutboxEvents,
  failOutboxEvent,
  type OutboxEventRow,
} from '@/lib/booking/commands';
import type { BookingLogger } from '@/lib/booking/logger';
import { findIntentByReference } from '@/lib/booking/repository';
import { nightsBetween } from '@/lib/booking/stay-rules';

export interface ClaimedEvent {
  id: string;
  type: string;
  version: number;
  reference: string | null;
  occurredAt: string;
  attempt: number;
  payload: Record<string, unknown>;
}

function toClaimed(row: OutboxEventRow): ClaimedEvent {
  return {
    id: row.id,
    type: row.event_type,
    version: row.event_version,
    reference: row.reference,
    occurredAt: row.created_at,
    // Surfaced so a workflow can behave differently on a retry — post a
    // warning on attempt 5 rather than sending a fifth identical email.
    attempt: row.attempts,
    payload: row.payload,
  };
}

/**
 * Claim a batch of events.
 *
 * The claim is a LEASE. A worker that dies mid-batch leaves rows whose lease
 * passes, and the next claim picks them up — so nothing is lost by a crash. At
 * worst an event is delivered twice, which is why the contract requires n8n's
 * workflows to be idempotent. `FOR UPDATE SKIP LOCKED` in the database means
 * two workers claiming simultaneously get disjoint sets.
 */
export async function claimEvents(
  worker: string,
  limit: number,
  logger: BookingLogger
): Promise<ClaimedEvent[]> {
  const rows = await claimOutboxEvents(worker, limit);
  logger.info('outbox.claim', { worker, count: rows.length });
  return rows.map(toClaimed);
}

export async function acknowledgeEvent(
  id: string,
  worker: string,
  logger: BookingLogger
): Promise<boolean> {
  // The database checks that this worker is the one holding the claim, so a
  // second worker cannot acknowledge away an event it is not processing.
  const ok = await ackOutboxEvent(id, worker);
  logger.info('outbox.ack', { worker, jobId: id, outcome: ok ? 'acked' : 'not_claimed' });
  return ok;
}

/**
 * Report an event as failed.
 *
 * Retried with exponential backoff and dead-lettered after eight attempts. A
 * dead-lettered event is not deleted: it stays in `bolagio_ops_queues`,
 * because an event nobody consumed is an operational fact.
 */
export async function failEvent(
  id: string,
  worker: string,
  error: string,
  logger: BookingLogger
): Promise<boolean> {
  const ok = await failOutboxEvent(id, worker, error.slice(0, 400));
  logger.warn('outbox.ack', { worker, jobId: id, outcome: 'failed' });
  return ok;
}

export interface BookingContext {
  reference: string;
  status: string;
  paymentStatus: string;
  unitSlug: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  totalCents: number | null;
  paidAmountCents: number | null;
  confirmedAt: string | null;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    locale: 'de' | 'en';
  } | null;
}

/**
 * Everything a confirmation email or an invoice needs, and nothing else.
 *
 * ── Deliberately absent ──────────────────────────────────────────────────
 * The internal uuid, the Beds24 booking id, the PayPal order and capture ids,
 * the idempotency key, the provider snapshot. A messaging workflow has no use
 * for any of them, and each one is a lever that should not be reachable from
 * an automation platform — a Beds24 booking id in an n8n variable is one
 * badly-written HTTP node away from a cancelled reservation.
 */
export async function bookingContext(reference: string): Promise<BookingContext | null> {
  const intent = await findIntentByReference(reference);
  if (!intent) return null;

  return {
    reference: intent.reference,
    status: intent.status,
    paymentStatus: intent.paymentStatus,
    unitSlug: intent.unitSlug,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    nights: nightsBetween(intent.checkIn, intent.checkOut),
    adults: intent.adults,
    children: intent.children,
    currency: intent.currency,
    totalCents: intent.quotedTotalCents,
    paidAmountCents: intent.paidAmountCents,
    confirmedAt: intent.confirmedAt,
    guest: intent.guest
      ? {
          firstName: intent.guest.firstName,
          lastName: intent.guest.lastName,
          email: intent.guest.email,
          phone: intent.guest.phone,
          locale: intent.guest.locale ?? 'de',
        }
      : null,
  };
}
