'use client';

import { useState, useTransition } from 'react';
import { cancelBookingAction, type CancelBookingActionResult } from '@/lib/admin/actions';
import { bookingStatePresentation, codeTitle } from '@/lib/admin/presentation';

export type CancelPanelMode =
  /** No payment evidence: the release the sweep already performs. */
  | 'unpaid'
  /** Payment evidence but no settled capture: authorisation, no refund decision. */
  | 'evidence'
  /** Settled capture: authorisation plus an explicit refund decision. */
  | 'paid';

const FAILURE: Record<string, string> = {
  unauthenticated: 'Your session has ended. Sign in again.',
  forbidden: 'Your role cannot cancel this booking.',
  preview: 'Preview data is read-only.',
  invalid_reference: 'That is not a booking reference.',
  not_found: 'This booking no longer exists.',
  fixture: 'Development fixtures have no booking core behind them.',
  failed: 'The cancellation could not be processed. See the server log.',
  confirmation_mismatch: 'Type the booking reference exactly to confirm.',
  invalid_refund: 'The refund amount must be a whole number of cents between zero and the captured amount.',
  paid_cancellation_disabled: 'Cancelling a paid booking from Control is switched off on this deployment (OPERATOR_PAID_CANCELLATION_ENABLED).',
  in_progress: 'The booking is mid-transition. Wait for the lease to lapse or reconcile first.',
  manual_review: 'This booking is under manual review. Reconcile or resolve the review before cancelling.',
};

/**
 * Cancel a booking, with the friction the case deserves. An unpaid hold
 * needs a typed reference. A booking with money behind it needs an
 * administrator, a configuration switch, a typed reference and an explicit
 * refund decision — and even then no money moves from here.
 */
export function CancelPanel({ reference, mode, paidAmountCents, currency, allowed, disabledReason }: { reference: string; mode: CancelPanelMode; paidAmountCents: number | null; currency: string; allowed: boolean; disabledReason: string | null }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(mode === 'paid' ? 'none' : 'none');
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<CancelBookingActionResult | null>(null);

  const refundCents = mode !== 'paid' ? null : refund === 'full' ? (paidAmountCents ?? 0) : refund === 'partial' ? Math.round(Number(partial.replace(',', '.')) * 100) : 0;

  const submit = () =>
    start(async () => {
      setResult(await cancelBookingAction(reference, { reason, confirmReference: confirm, refundCents }));
    });

  if (!allowed) {
    return <p className="bc-meta">{disabledReason}</p>;
  }

  if (!open) {
    return (
      <div className="grid gap-2">
        <button type="button" className="bc-btn" onClick={() => setOpen(true)}>
          Cancel booking…
        </button>
        <p className="bc-meta" style={{ fontSize: 12 }}>
          {mode === 'unpaid'
            ? 'Releases the hold at the channel manager and verifies the nights are open — the same release the stale-hold sweep performs. Nothing is refunded because nothing was paid.'
            : mode === 'evidence'
              ? 'Payment evidence exists without a settled capture. You take responsibility for ending it; the release is verified before the booking is closed.'
              : 'The guest has paid. You take responsibility for ending the booking and record the refund decision. No money is moved from here: the refund is a separate command.'}
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="bc-field">
        <label htmlFor="cancel-reason">Reason (kept on the booking)</label>
        <input id="cancel-reason" className="bc-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} placeholder="Guest asked to cancel by email" disabled={pending} />
      </div>

      {mode === 'paid' && (
        <fieldset className="bc-field" disabled={pending}>
          <legend className="bc-label">Refund decision</legend>
          <div className="grid gap-1.5" style={{ fontSize: 13 }}>
            <label className="flex items-center gap-2">
              <input type="radio" name="refund" checked={refund === 'none'} onChange={() => setRefund('none')} /> No refund
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="refund" checked={refund === 'full'} onChange={() => setRefund('full')} /> Full refund of the captured amount
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="refund" checked={refund === 'partial'} onChange={() => setRefund('partial')} /> Partial refund
              <input className="bc-input" style={{ height: 30, width: 110, fontSize: 12.5 }} inputMode="decimal" placeholder={`0.00 ${currency}`} value={partial} onChange={(e) => setPartial(e.target.value)} disabled={refund !== 'partial'} aria-label="Partial refund amount" />
            </label>
          </div>
          <p className="bc-meta" style={{ fontSize: 12 }}>
            Recorded as a decision. The refund itself runs only where refund execution is enabled and is otherwise done at the provider and recorded here.
          </p>
        </fieldset>
      )}

      <div className="bc-field">
        <label htmlFor="cancel-confirm">Type the reference to confirm</label>
        <input id="cancel-confirm" className="bc-input bc-mono" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder={reference} autoComplete="off" spellCheck={false} disabled={pending} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bc-btn primary" disabled={pending || confirm.trim() !== reference} data-pending={pending ? 'true' : undefined}>
          {mode === 'unpaid' ? 'Cancel and release' : 'Authorise cancellation'}
        </button>
        <button type="button" className="bc-btn quiet" onClick={() => setOpen(false)} disabled={pending}>
          Keep booking
        </button>
      </div>

      {result && <Outcome result={result} />}
    </form>
  );
}

function Outcome({ result }: { result: CancelBookingActionResult }) {
  if (!result.ok) {
    const text = result.reason === 'refused' ? `Refused by the booking core: ${codeTitle(result.code)} (${result.code}).` : (FAILURE[result.reason] ?? 'Not cancelled.');
    return (
      <div className="bc-notice" data-tone="critical" role="alert" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div>{text}</div>
      </div>
    );
  }
  if (result.outcome === 'already_cancelled') {
    return (
      <div className="bc-notice" data-tone="neutral" role="status" aria-live="polite">
        <div>This booking was already cancelled.</div>
      </div>
    );
  }
  if (result.outcome === 'release_pending') {
    return (
      <div className="bc-notice" data-tone="caution" role="status" aria-live="polite">
        <div>
          Cancellation recorded; the release could not be verified ({codeTitle(result.code)}). The nights stay protected locally and reconciliation keeps re-checking. Booking is now <strong>{bookingStatePresentation(result.status).label}</strong>.
        </div>
      </div>
    );
  }
  return (
    <div className="bc-notice" data-tone="positive" role="status" aria-live="polite">
      <div>
        Cancelled. Refund state: <strong>{result.refundState.replace(/_/g, ' ')}</strong>.
      </div>
    </div>
  );
}
