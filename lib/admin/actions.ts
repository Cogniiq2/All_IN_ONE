'use server';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE OPERATOR'S COMMANDS — all of them.
 *
 * Four server actions: sign in, sign out, reconcile one booking, run one
 * reconciliation pass. Every one follows the same shape:
 *
 *   1. resolve the operator from the signed cookie and the allowlist
 *   2. check the capability server-side
 *   3. validate the input
 *   4. call the booking domain's OWN command — never a table write
 *   5. write an audit row
 *   6. revalidate the screens that changed
 *   7. answer with a structured result the UI can render honestly
 *
 * There is no action that sets a booking status, releases a hold, refunds a
 * payment or edits a mapping. Those are not omissions.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit, authenticate, clearSession, currentOperator, establishSession, operatorFor } from '@/lib/admin/auth';
import { adminMode } from '@/lib/admin/config';
import { createLogger } from '@/lib/booking/logger';
import { clientKey, rateLimit } from '@/lib/booking/http';
import { BookingError } from '@/lib/booking/service';
import { isBookingReference } from '@/lib/booking/reference';
import { findIntentByReference } from '@/lib/booking/repository';
import { queueReconciliation } from '@/lib/booking/commands';
import { reconciliationReasonFor, runReconciliation, type ReconciliationReport } from '@/lib/booking/reconciliation';

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

  const result = await authenticate(email, password);
  if (!result.ok) {
    // Refusals are audited by reason, never by password. The email is the
    // operator's own business identity, not guest data.
    await audit({ operator: null, action: 'auth.sign_in', outcome: `denied:${result.reason}`, detail: { email } });
    return { error: SIGN_IN_MESSAGE[result.reason] ?? SIGN_IN_MESSAGE.invalid_credentials };
  }

  await establishSession(result.operator);
  await audit({ operator: result.operator, action: 'auth.sign_in', outcome: 'ok' });
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
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'invalid_reference' | 'not_found' | 'fixture' | 'failed' };

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
  | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'fixture' | 'failed' };

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
