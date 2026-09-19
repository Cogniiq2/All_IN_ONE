'use client';

import { useState, useTransition } from 'react';
import { reconcileBookingAction, type ReconcileResult } from '@/lib/admin/actions';
import { bookingStatePresentation } from '@/lib/admin/presentation';

/**
 * "Reconcile now" — the one write on the booking page.
 *
 * Pending → result, never optimistic: the outcome of a read of the provider
 * cannot be guessed. The result stays on screen until the next click, and
 * says what the engine did in its own terms.
 */
export function ReconcileButton({ reference }: { reference: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const run = () => {
    start(async () => {
      setResult(await reconcileBookingAction(reference));
    });
  };

  return (
    <div className="grid gap-2">
      <button type="button" className="bc-btn" onClick={run} disabled={pending} data-pending={pending ? 'true' : undefined} aria-describedby="reconcile-help">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
        </svg>
        Reconcile now
      </button>
      <p id="reconcile-help" className="bc-meta" style={{ fontSize: 12 }}>
        Queues the same job the scheduled sweep would and runs one pass. Reads the provider first; never retries an unknown outcome, never releases or refunds.
      </p>
      {result && <Outcome result={result} />}
    </div>
  );
}

function Outcome({ result }: { result: ReconcileResult }) {
  if (!result.ok) {
    const text: Record<string, string> = {
      unauthenticated: 'Your session has ended. Sign in again.',
      forbidden: 'Your role cannot run reconciliation.',
      preview: 'Preview data is read-only. The reconciliation engine is not reachable from this deployment.',
      invalid_reference: 'That is not a booking reference.',
      not_found: 'This booking no longer exists.',
      fixture: 'Development fixtures have no reconciliation engine behind them.',
      failed: 'The pass could not complete. The error is in the server log under this correlation.',
    };
    return (
      <div className="bc-notice" data-tone={result.reason === 'fixture' || result.reason === 'preview' ? 'caution' : 'critical'} role="alert" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div>{text[result.reason] ?? 'Not run.'}</div>
      </div>
    );
  }
  if (result.outcome === 'nothing_to_do') {
    return (
      <div className="bc-notice" data-tone="neutral" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <div>
          Nothing to reconcile: a booking in <strong>{bookingStatePresentation(result.status).label}</strong> is not something the sweep acts on.
        </div>
      </div>
    );
  }
  const moved = result.before !== result.after;
  return (
    <div className="bc-notice" data-tone={moved ? 'positive' : 'neutral'} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        {moved ? <path d="m8.5 12 2.5 2.5 4.5-5" /> : <path d="M12 11v5M12 8h.01" />}
      </svg>
      <div>
        {moved ? (
          <>
            Moved from <strong>{bookingStatePresentation(result.before).label}</strong> to <strong>{bookingStatePresentation(result.after).label}</strong>.
          </>
        ) : (
          <>
            Still <strong>{bookingStatePresentation(result.after).label}</strong>. Not yet resolvable; the job stays queued.
          </>
        )}{' '}
        <span className="bc-meta">
          Pass: {result.report.resolved} resolved, {result.report.failed} retry, {result.report.escalated} escalated, {result.report.paymentEvents} payment events.
        </span>
      </div>
    </div>
  );
}
