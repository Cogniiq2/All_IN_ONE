'use client';

import { useState, useTransition } from 'react';
import { requeueDeliveryAction, requeueOutboxAction, type RequeueResult } from '@/lib/admin/actions';

const FAILURE: Record<string, string> = {
  unauthenticated: 'Your session has ended. Sign in again.',
  forbidden: 'Your role cannot requeue automation.',
  preview: 'Preview data is read-only.',
  fixture: 'Development fixtures have no ledger behind them.',
  invalid: 'That identifier is not valid.',
  failed: 'The requeue could not be saved. See the server log.',
};

function Outcome({ result, what }: { result: RequeueResult; what: string }) {
  if (!result.ok) {
    return (
      <span className="bc-meta" role="alert" style={{ color: 'hsl(var(--bc-critical))', fontSize: 12 }}>
        {FAILURE[result.reason] ?? 'Not requeued.'}
      </span>
    );
  }
  return (
    <span className="bc-meta" role="status" style={{ fontSize: 12 }}>
      {result.requeued ? `${what} requeued; the next pump run picks it up.` : `Not requeueable in its current state.`}
    </span>
  );
}

/** Return a failed delivery to the pump. The ledger refuses anything that was sent. */
export function RequeueDeliveryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RequeueResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="bc-btn sm" onClick={() => start(async () => setResult(await requeueDeliveryAction(id)))} disabled={pending} data-pending={pending ? 'true' : undefined}>
        Requeue delivery
      </button>
      {result && <Outcome result={result} what="Delivery" />}
    </div>
  );
}

/** Return a dead-lettered outbox event to pending. Only exhausted events move. */
export function RequeueOutboxButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RequeueResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="bc-btn sm" onClick={() => start(async () => setResult(await requeueOutboxAction(id)))} disabled={pending} data-pending={pending ? 'true' : undefined}>
        Requeue event
      </button>
      {result && <Outcome result={result} what="Event" />}
    </div>
  );
}
