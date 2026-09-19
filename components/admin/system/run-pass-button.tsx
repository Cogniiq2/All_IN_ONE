'use client';

import { useState, useTransition } from 'react';
import { runReconciliationPassAction, type PassResult } from '@/lib/admin/actions';

export function RunPassButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PassResult | null>(null);

  return (
    <div className="grid gap-2">
      <button type="button" className="bc-btn" onClick={() => start(async () => setResult(await runReconciliationPassAction()))} disabled={pending} data-pending={pending ? 'true' : undefined}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
        </svg>
        Run one reconciliation pass
      </button>
      <p className="bc-meta" style={{ fontSize: 12 }}>
        Exactly what the scheduler triggers: drain the verified payment inbox, sweep for stuck bookings, work the queue most-severe first. Bounded to 25 jobs.
      </p>
      {result && (
        <div className="bc-notice" data-tone={result.ok ? 'positive' : result.reason === 'fixture' ? 'caution' : 'critical'} role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <div>
            {result.ok
              ? `Pass complete: ${result.report.paymentEvents} payment events processed, ${result.report.queued} newly queued, ${result.report.scanned} jobs claimed — ${result.report.resolved} resolved, ${result.report.failed} to retry, ${result.report.escalated} escalated.`
              : result.reason === 'fixture'
                ? 'Development fixtures have no reconciliation engine behind them.'
                : result.reason === 'forbidden'
                  ? 'Your role cannot run a pass.'
                  : result.reason === 'unauthenticated'
                    ? 'Your session has ended. Sign in again.'
                    : 'The pass could not complete. See the server log.'}
          </div>
        </div>
      )}
    </div>
  );
}
