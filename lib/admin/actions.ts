'use server';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE OPERATOR'S COMMANDS — all of them.
 *
 * Sign in, sign out, reconcile one booking, run one reconciliation pass —
 * and, since the platform-completion phase, cancel a booking (through the
 * cancellation saga), move a turnover, name its cleaner, and requeue a
 * failed guest message or a dead-lettered automation event. Every one
 * follows the same shape:
 *
 *   1. resolve the operator from the signed cookie and the allowlist
 *   2. check the capability server-side
 *   3. validate the input
 *   4. call the booking domain's OWN command — never a table write
 *   5. write an audit row
 *   6. revalidate the screens that changed
 *   7. answer with a structured result the UI can render honestly
 *
 * There is no action that sets a booking status directly, releases a hold
 * outside the saga, sends money back, changes dates or edits a mapping.
 * Those are not omissions: a refund is a separate, configuration-gated
 * command that no screen triggers yet.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  audit,
  authenticate,
  authenticatePreview,
  clearSession,
  currentOperator,
  establishPreviewSession,
  establishSession,
  operatorFor,
} from '@/lib/admin/auth';
import { adminMode } from '@/lib/admin/config';
import { createLogger } from '@/lib/booking/logger';
import { clientKey, rateLimit } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';
import { findIntentByReference } from '@/lib/booking/repository';
import { assignTurnover, queueReconciliation, requeueMessageDelivery, requeueOutboxEvent, setTurnoverStatus } from '@/lib/booking/commands';
import { reconciliationReasonFor, runReconciliation, type ReconciliationReport } from '@/lib/booking/reconciliation';
import { cancelBooking, classifyCancellation } from '@/lib/booking/cancellation';
import { operatorPaidCancellationEnabled } from '@/lib/booking/config';

/* ── Sign in / out ─────────────────────────────────────────────────────── */

export interface SignInState {
  error: string | null;
}

const SIGN_IN_MESSAGE: Record<string, string> = {
  invalid_credentials: 'Sign-in failed. Check the email address and password.',
  not_allowlisted: 'Sign-in failed. Check the email address and password.',
  inactive: 'Sign-in failed. Check the email address and password.',
  identity_mismatch: 'Sign-in failed. Check the email address and password.',
  unconfigured: 'BoLaGio Control is not configured on this deployment. See docs/admin-control.md.',
  unavailable: 'The identity service could not be reached. Try again in a moment.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
};

export async function signInAction(formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254);
  const password = String(formData.get('password') ?? '').slice(0, 1024);
  const nextRaw = String(formData.get('next') ?? '');
  const next = nextRaw.startsWith('/admin') && !nextRaw.startsWith('//') ? nextRaw : '/admin';

  try {
    rateLimit(clientKey(new Request('http://local', { headers: headers() }), 'admin-sign-in'), 8, 60_000);
  } catch (cause) {
    if (cause instanceof BookingError && cause.code === 'rate_limited') return { error: SIGN_IN_MESSAGE.rate_limited };
  }

  // Two sign-in paths that never meet. A preview-demo deployment runs the
  // demo one and nothing else; every other deployment runs the operator one
  // and nothing else. Neither can be reached from the other's environment.
  const preview = adminMode() === 'preview';

  const result = preview ? await authenticatePreview(email, password) : await authenticate(email, password);
  if (!result.ok) {
    // Refusals are audited by reason, never by password. The email is the
    // operator's own business identity, not guest data. (In preview the
    // audit is a no-op: there is no database to write to.)
    await audit({ operator: null, action: 'auth.sign_in', outcome: `denied:${result.reason}`, detail: { email } });
    return { error: SIGN_IN_MESSAGE[result.reason] ?? SIGN_IN_MESSAGE.invalid_credentials };
  }

  if (preview) {
    await establishPreviewSession(result.operator);
  } else {
    await establishSession(result.operator);
    await audit({ operator: result.operator, action: 'auth.sign_in', outcome: 'ok' });
  }
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const operator = await currentOperator();
  clearSession();
  await audit({ operator, action: 'auth.sign_out', outcome: 'ok' });
  redirect('/admin/login');
}

/* ── Reconciliation ────────────────────────────────────────────────────── */

export type ReconcileResult =
  | { ok: true; outcome: 'ran'; report: ReconciliationReport; before: string; after: string }
  | { ok: true; outcome: 'nothing_to_do'; status: string }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'invalid_reference' | 'not_found' | 'fixture' | 'failed' };

/**
 * Reconcile one booking, now.
 *
 * Queues EXACTLY the job the scheduled sweep would queue for this booking's
 * state (`reconciliationReasonFor`) and runs one bounded pass of the same
 * engine. The engine reads the provider before it writes anything, never
 * retries an unknown outcome blind, and never releases or refunds a booking
 * with payment evidence. This action adds no semantics to that.
 */
export async function reconcileBookingAction(reference: string): Promise<ReconcileResult> {
  // A preview-demo session is refused here, before anything else: the gate
  // returns `preview` for every capability except `view`.
  const gate = await operatorFor('reconcile_booking');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isBookingReference(reference)) return { ok: false, reason: 'invalid_reference' };

  if (adminMode() !== 'supabase') {
    // Fixtures have no engine behind them. Say so rather than pretend.
    return { ok: false, reason: 'fixture' };
  }

  const logger = createLogger();
  try {
    const before = await findIntentByReference(reference);
    if (!before) return { ok: false, reason: 'not_found' };

    const reason = reconciliationReasonFor(before.status, before.paymentStatus);
    if (!reason) {
      await audit({ operator: gate.operator, action: 'booking.reconcile', targetType: 'booking', targetRef: reference, outcome: 'nothing_to_do', detail: { status: before.status }, correlationId: logger.correlationId });
      return { ok: true, outcome: 'nothing_to_do', status: before.status };
    }

    await queueReconciliation(before.id, reason.code, reason.severity, { requestedBy: 'operator' });
    const report = await runReconciliation(logger, 10);
    const after = (await findIntentByReference(reference))?.status ?? before.status;

    await audit({
      operator: gate.operator,
      action: 'booking.reconcile',
      targetType: 'booking',
      targetRef: reference,
      outcome: after === before.status ? 'unchanged' : 'moved',
      detail: { reason: reason.code, before: before.status, after, resolved: report.resolved, failed: report.failed, escalated: report.escalated },
      correlationId: logger.correlationId,
    });

    revalidatePath('/admin');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/bookings');
    revalidatePath(`/admin/bookings/${reference}`);
    return { ok: true, outcome: 'ran', report, before: before.status, after };
  } catch (cause) {
    logger.error('reconcile.resolve', cause, { reference, outcome: 'operator_run_failed' });
    await audit({ operator: gate.operator, action: 'booking.reconcile', targetType: 'booking', targetRef: reference, outcome: 'error', correlationId: logger.correlationId });
    return { ok: false, reason: 'failed' };
  }
}

export type PassResult =
  | { ok: true; report: ReconciliationReport }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'fixture' | 'failed' };

/** One full pass — identical to what the scheduler triggers. */
export async function runReconciliationPassAction(): Promise<PassResult> {
  const gate = await operatorFor('run_reconciliation_pass');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };

  const logger = createLogger();
  try {
    const report = await runReconciliation(logger, 25);
    await audit({
      operator: gate.operator,
      action: 'reconciliation.pass',
      outcome: 'ok',
      detail: { scanned: report.scanned, resolved: report.resolved, failed: report.failed, escalated: report.escalated, paymentEvents: report.paymentEvents, queued: report.queued },
      correlationId: logger.correlationId,
    });
    revalidatePath('/admin');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/system');
    revalidatePath('/admin/bookings');
    return { ok: true, report };
  } catch (cause) {
    logger.error('reconcile.resolve', cause, { outcome: 'operator_pass_failed' });
    await audit({ operator: gate.operator, action: 'reconciliation.pass', outcome: 'error', correlationId: logger.correlationId });
    return { ok: false, reason: 'failed' };
  }
}

/* ── Search (read-only) ────────────────────────────────────────────────── */

/** The command palette's lookup. Reads only; refused without a session. */
export async function searchBookingsAction(
  query: string
): Promise<{ ok: true; items: import('@/lib/admin/dto').BookingSummaryDto[] } | { ok: false }> {
  const gate = await operatorFor('view');
  if (!gate.ok) return { ok: false };
  const q = String(query ?? '').trim().slice(0, 80);
  if (q.length < 2) return { ok: true, items: [] };
  const { searchBookings } = await import('@/lib/admin/queries');
  const result = await searchBookings(q, 8);
  return result.ok ? { ok: true, items: result.data } : { ok: false };
}

/* ── Cancellation ──────────────────────────────────────────────────────── */

export type CancelBookingActionResult =
  | { ok: true; outcome: 'cancelled'; status: string; refundState: string }
  | { ok: true; outcome: 'already_cancelled' }
  | { ok: true; outcome: 'release_pending'; code: string; status: string }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'invalid_reference' | 'not_found' | 'fixture' | 'failed' | 'confirmation_mismatch' | 'invalid_refund' | 'paid_cancellation_disabled' | 'in_progress' | 'manual_review' }
  | { ok: false; reason: 'refused'; code: string };

export interface CancelBookingActionInput {
  reason: string;
  /** Typed back by the operator; refused when it does not match. */
  confirmReference: string;
  /**
   * The refund DECISION for a booking with payment evidence, in minor units.
   * 0 records "no refund"; a positive amount records "refund required" and
   * nothing more. Ignored for a booking without payment evidence.
   */
  refundCents?: number | null;
}

/**
 * Cancel one booking through the saga.
 *
 * A booking WITHOUT payment evidence is released exactly as the stale-hold
 * sweep would release it; any operator may do that. A booking WITH payment
 * evidence needs an administrator, an explicit configuration switch
 * (`OPERATOR_PAID_CANCELLATION_ENABLED`) and a refund decision, and even then
 * the money is not touched: the decision is recorded for the separate,
 * gated refund command. The database trigger enforces the same rule.
 */
export async function cancelBookingAction(reference: string, input: CancelBookingActionInput): Promise<CancelBookingActionResult> {
  const viewer = await operatorFor('cancel_unpaid_booking');
  if (!viewer.ok) return { ok: false, reason: viewer.reason };
  if (!isBookingReference(reference)) return { ok: false, reason: 'invalid_reference' };
  if (String(input?.confirmReference ?? '').trim().toUpperCase() !== reference) return { ok: false, reason: 'confirmation_mismatch' };
  const reason = String(input?.reason ?? '').trim().slice(0, 400);
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };

  const logger = createLogger();
  try {
    const intent = await findIntentByReference(reference);
    if (!intent) return { ok: false, reason: 'not_found' };

    const klass = classifyCancellation(intent);
    if (klass.kind === 'terminal') return { ok: true, outcome: 'already_cancelled' };
    if (klass.kind === 'in_progress') return { ok: false, reason: 'in_progress' };
    if (klass.kind === 'manual_review') return { ok: false, reason: 'manual_review' };

    const paidPath = klass.kind === 'paid' || klass.kind === 'payment_evidence';
    let refundCents: number | null = null;
    if (paidPath) {
      const admin = await operatorFor('cancel_paid_booking');
      if (!admin.ok) {
        await audit({ operator: viewer.operator, action: 'booking.cancel', targetType: 'booking', targetRef: reference, outcome: `denied:${admin.reason}`, detail: { class: klass.kind }, correlationId: logger.correlationId });
        return { ok: false, reason: admin.reason };
      }
      if (!operatorPaidCancellationEnabled()) {
        await audit({ operator: viewer.operator, action: 'booking.cancel', targetType: 'booking', targetRef: reference, outcome: 'denied:paid_cancellation_disabled', detail: { class: klass.kind }, correlationId: logger.correlationId });
        return { ok: false, reason: 'paid_cancellation_disabled' };
      }
      if (klass.kind === 'paid') {
        const requested = input?.refundCents;
        if (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 0 || (intent.paidAmountCents !== null && requested > intent.paidAmountCents)) {
          return { ok: false, reason: 'invalid_refund' };
        }
        refundCents = requested;
      } else {
        refundCents = 0;
      }
    }

    const result = await cancelBooking(intent, { actor: viewer.operator.email, reason: reason || undefined, authorized: paidPath, refundCents }, logger);

    await audit({
      operator: viewer.operator,
      action: 'booking.cancel',
      targetType: 'booking',
      targetRef: reference,
      outcome: result.outcome === 'refused' ? `refused:${result.code}` : result.outcome,
      detail: { class: klass.kind, before: intent.status, after: result.intent.status, refundCents, code: result.outcome === 'release_pending' ? result.code : null },
      correlationId: logger.correlationId,
    });

    revalidatePath('/admin');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/calendar');
    revalidatePath('/admin/cleaning');
    revalidatePath(`/admin/bookings/${reference}`);

    switch (result.outcome) {
      case 'cancelled':
        return { ok: true, outcome: 'cancelled', status: result.intent.status, refundState: result.refundState };
      case 'already_cancelled':
        return { ok: true, outcome: 'already_cancelled' };
      case 'release_pending':
        return { ok: true, outcome: 'release_pending', code: result.code, status: result.intent.status };
      case 'refused':
        return { ok: false, reason: 'refused', code: result.code };
    }
  } catch (cause) {
    logger.error('booking.cancel', cause, { reference, outcome: 'operator_cancel_failed' });
    await audit({ operator: viewer.operator, action: 'booking.cancel', targetType: 'booking', targetRef: reference, outcome: 'error', correlationId: logger.correlationId });
    return { ok: false, reason: 'failed' };
  }
}

/* ── Cleaning ──────────────────────────────────────────────────────────── */

export type TurnoverActionResult =
  | { ok: true; noop?: boolean }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'fixture' | 'invalid' | 'failed' | 'refused'; code?: string };

const TURNOVER_TARGETS = ['required', 'in_progress', 'done'] as const;
type TurnoverTarget = (typeof TURNOVER_TARGETS)[number];

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Move a turnover between required, in progress and done. `void` is not an
 * operator target: a turnover is voided only by the sync when the departure
 * it was derived from no longer exists.
 */
export async function setTurnoverStatusAction(turnoverId: string, to: string, note?: string): Promise<TurnoverActionResult> {
  const gate = await operatorFor('manage_cleaning');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isUuid(turnoverId) || !(TURNOVER_TARGETS as readonly string[]).includes(to)) return { ok: false, reason: 'invalid' };
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };
  const trimmed = String(note ?? '').trim().slice(0, 300);
  try {
    const result = await setTurnoverStatus(turnoverId, to as TurnoverTarget, gate.operator.email, trimmed || undefined);
    await audit({ operator: gate.operator, action: 'turnover.status', targetType: 'turnover', targetRef: turnoverId, outcome: result.ok ? (result.noop ? 'unchanged' : 'moved') : `refused:${result.code ?? 'unknown'}`, detail: { from: result.from ?? null, to } });
    revalidatePath('/admin/cleaning');
    revalidatePath('/admin');
    if (!result.ok) return { ok: false, reason: 'refused', code: result.code };
    return { ok: true, noop: result.noop };
  } catch (cause) {
    createLogger().error('turnover.status', cause, { outcome: 'operator_turnover_failed' });
    await audit({ operator: gate.operator, action: 'turnover.status', targetType: 'turnover', targetRef: turnoverId, outcome: 'error' });
    return { ok: false, reason: 'failed' };
  }
}

/** Name the person responsible; an empty name clears the assignment. */
export async function assignTurnoverAction(turnoverId: string, assignee: string): Promise<TurnoverActionResult> {
  const gate = await operatorFor('manage_cleaning');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isUuid(turnoverId)) return { ok: false, reason: 'invalid' };
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };
  const name = String(assignee ?? '').trim().slice(0, 80);
  try {
    const found = await assignTurnover(turnoverId, name || null, gate.operator.email);
    await audit({ operator: gate.operator, action: 'turnover.assign', targetType: 'turnover', targetRef: turnoverId, outcome: found ? 'ok' : 'not_found', detail: { assigned: name ? true : false } });
    revalidatePath('/admin/cleaning');
    if (!found) return { ok: false, reason: 'refused', code: 'NOT_FOUND' };
    return { ok: true };
  } catch (cause) {
    createLogger().error('turnover.assign', cause, { outcome: 'operator_assign_failed' });
    await audit({ operator: gate.operator, action: 'turnover.assign', targetType: 'turnover', targetRef: turnoverId, outcome: 'error' });
    return { ok: false, reason: 'failed' };
  }
}

/* ── Automations ───────────────────────────────────────────────────────── */

export type RequeueResult =
  | { ok: true; requeued: boolean }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'preview' | 'fixture' | 'invalid' | 'failed' };

/**
 * Put a failed guest-message delivery back in the pump's path. The ledger
 * decides whether the row is in a state that can be requeued (failed only);
 * a sent message is never sent again from here.
 */
export async function requeueDeliveryAction(deliveryId: string): Promise<RequeueResult> {
  const gate = await operatorFor('requeue_automation');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isUuid(deliveryId)) return { ok: false, reason: 'invalid' };
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };
  try {
    const requeued = await requeueMessageDelivery(deliveryId, gate.operator.email);
    await audit({ operator: gate.operator, action: 'delivery.requeue', targetType: 'message_delivery', targetRef: deliveryId, outcome: requeued ? 'ok' : 'not_requeueable' });
    revalidatePath('/admin/automations');
    return { ok: true, requeued };
  } catch (cause) {
    createLogger().error('delivery.requeue', cause, { outcome: 'operator_requeue_failed' });
    await audit({ operator: gate.operator, action: 'delivery.requeue', targetType: 'message_delivery', targetRef: deliveryId, outcome: 'error' });
    return { ok: false, reason: 'failed' };
  }
}

/** Return a dead-lettered outbox event to pending. Only `exhausted` rows move; the database refuses anything else. */
export async function requeueOutboxAction(eventId: string): Promise<RequeueResult> {
  const gate = await operatorFor('requeue_automation');
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isUuid(eventId)) return { ok: false, reason: 'invalid' };
  if (adminMode() !== 'supabase') return { ok: false, reason: 'fixture' };
  try {
    const requeued = await requeueOutboxEvent(eventId, gate.operator.email);
    await audit({ operator: gate.operator, action: 'outbox.requeue', targetType: 'outbox_event', targetRef: eventId, outcome: requeued ? 'ok' : 'not_requeueable' });
    revalidatePath('/admin/automations');
    revalidatePath('/admin/system');
    return { ok: true, requeued };
  } catch (cause) {
    createLogger().error('outbox.requeue', cause, { outcome: 'operator_requeue_failed' });
    await audit({ operator: gate.operator, action: 'outbox.requeue', targetType: 'outbox_event', targetRef: eventId, outcome: 'error' });
    return { ok: false, reason: 'failed' };
  }
}
