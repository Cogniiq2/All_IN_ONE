'use client';

import { useState, useTransition } from 'react';
import { assignTurnoverAction, setTurnoverStatusAction, type TurnoverActionResult } from '@/lib/admin/actions';
import type { TurnoverDto } from '@/lib/admin/dto';

const FAILURE: Record<string, string> = {
  unauthenticated: 'Your session has ended. Sign in again.',
  forbidden: 'Your role cannot change cleaning.',
  preview: 'Preview data is read-only.',
  fixture: 'Development fixtures have no cleaning ledger behind them.',
  invalid: 'That request was not valid.',
  refused: 'The turnover refused that change.',
  failed: 'The change could not be saved. See the server log.',
};

/**
 * The three moves a housekeeper makes and the one an operator makes: start,
 * finish, reopen, and name who is on it. Every click is a server action
 * with its own audit row; nothing is optimistic.
 */
export function TurnoverControls({ turnover }: { turnover: TurnoverDto }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TurnoverActionResult | null>(null);
  const [assignee, setAssignee] = useState(turnover.assignedTo ?? '');
  const open = turnover.status === 'required' || turnover.status === 'in_progress';

  const move = (to: 'required' | 'in_progress' | 'done') => start(async () => setResult(await setTurnoverStatusAction(turnover.id, to)));
  const assign = () => start(async () => setResult(await assignTurnoverAction(turnover.id, assignee)));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {turnover.status === 'required' && (
          <button type="button" className="bc-btn sm" onClick={() => move('in_progress')} disabled={pending} data-pending={pending ? 'true' : undefined}>
            Start
          </button>
        )}
        {open && (
          <button type="button" className="bc-btn sm primary" onClick={() => move('done')} disabled={pending} data-pending={pending ? 'true' : undefined}>
            Mark done
          </button>
        )}
        {turnover.status === 'done' && (
          <button type="button" className="bc-btn sm quiet" onClick={() => move('required')} disabled={pending} data-pending={pending ? 'true' : undefined}>
            Reopen
          </button>
        )}
        {open && (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              assign();
            }}
          >
            <label className="sr-only" htmlFor={`assignee-${turnover.id}`}>
              Assigned to
            </label>
            <input id={`assignee-${turnover.id}`} className="bc-input" style={{ height: 30, fontSize: 12.5, width: 150 }} placeholder="Assign to…" value={assignee} onChange={(e) => setAssignee(e.target.value)} maxLength={80} disabled={pending} />
            <button type="submit" className="bc-btn sm quiet" disabled={pending || assignee.trim() === (turnover.assignedTo ?? '')}>
              Save
            </button>
          </form>
        )}
      </div>
      {result && !result.ok && (
        <p className="bc-meta" role="alert" style={{ color: 'hsl(var(--bc-critical))', fontSize: 12 }}>
          {FAILURE[result.reason] ?? 'Not saved.'}
          {result.code ? ` (${result.code})` : ''}
        </p>
      )}
      {result && result.ok && result.noop && (
        <p className="bc-meta" role="status" style={{ fontSize: 12 }}>
          Already in that state.
        </p>
      )}
    </div>
  );
}
