'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as actions from '@/lib/finance/actions';
import type { ActionResult } from '@/lib/finance/actions';
import { ResultNotice } from '@/components/admin/finance/controls';

export function PeriodControls({ periodKey, status, readiness, mayReview, mayTax }: { periodKey: string; status: string; readiness: string; mayReview: boolean; mayTax: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const router = useRouter();
  const move = (to: string, note?: string) => start(async () => {
    const fd = new FormData();
    fd.set('period_key', periodKey); fd.set('to', to); if (note) fd.set('note', note);
    const r = await actions.setPeriodStatusAction(fd);
    setResult(r);
    if (r.ok) router.refresh();
  });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-1">
        {mayReview && status === 'open' && readiness === 'ready_for_review' && <button type="button" className="bc-btn sm" disabled={pending} onClick={() => move('review')}>Hand to accountant</button>}
        {mayTax && (status === 'review' || status === 'open') && <button type="button" className="bc-btn sm quiet" disabled={pending} onClick={() => move('accountant_reviewed')}>Mark reviewed</button>}
        {mayTax && status === 'accountant_reviewed' && <button type="button" className="bc-btn sm primary" disabled={pending} onClick={() => { if (window.confirm(`Lock ${periodKey}? Nothing in it can change afterwards.`)) move('locked'); }}>Lock</button>}
        {mayTax && status !== 'open' && <button type="button" className="bc-btn sm quiet" disabled={pending} onClick={() => { const note = window.prompt('Reason for reopening (recorded):'); if (note) move('open', note); }}>Reopen…</button>}
      </div>
      <ResultNotice result={result} success={(r) => `Period is now ${String(r.status).replace('_', ' ')}.`} />
    </div>
  );
}
