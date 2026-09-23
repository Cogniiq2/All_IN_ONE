'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import * as actions from '@/lib/finance/actions';
import type { ActionResult } from '@/lib/finance/actions';
import type { ExportKind } from '@/lib/finance/export/builders';

/* ── Result notice ──────────────────────────────────────────────────── */

const REASON_TEXT: Record<string, string> = {
  fixture: 'Development fixtures have no finance engine behind them.',
  preview: 'Preview data is read-only. Finance commands are not reachable from this deployment.',
  forbidden: 'Your role cannot do this.',
  unauthenticated: 'Your session has ended. Sign in again.',
  invalid: 'The input is not valid.',
  refused: 'Refused.',
  failed: 'The command failed. Nothing was changed.',
};

export function ResultNotice({ result, success }: { result: ActionResult<Record<string, unknown>> | null; success: (r: Record<string, unknown>) => ReactNode }) {
  if (!result) return null;
  const tone = result.ok ? 'positive' : result.reason === 'fixture' || result.reason === 'preview' ? 'caution' : 'critical';
  return (
    <div className="bc-notice" data-tone={tone} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
      <div>{result.ok ? success(result as Record<string, unknown>) : `${REASON_TEXT[result.reason] ?? 'Failed.'}${result.detail ? ` ${result.detail}` : ''}`}</div>
    </div>
  );
}

/* ── Generic action button (no form data) ───────────────────────────── */

export function ActionButton({ label, pendingLabel, run, success, className = 'bc-btn', confirm, icon }: { label: string; pendingLabel?: string; run: () => Promise<ActionResult<Record<string, unknown>>>; success: (r: Record<string, unknown>) => ReactNode; className?: string; confirm?: string; icon?: ReactNode }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <button type="button" className={className} disabled={pending} data-pending={pending ? 'true' : undefined} onClick={() => { if (confirm && !window.confirm(confirm)) return; start(async () => { const r = await run(); setResult(r); if (r.ok) router.refresh(); }); }}>
        {icon}
        {pending ? pendingLabel ?? label : label}
      </button>
      <ResultNotice result={result} success={success} />
    </div>
  );
}

/* ── Generic form posting FormData to a server action ───────────────── */

export function ActionForm({ action, children, submitLabel, success, className, resetOnSuccess = true, danger, confirm }: { action: (fd: FormData) => Promise<ActionResult<Record<string, unknown>>>; children: ReactNode; submitLabel: string; success: (r: Record<string, unknown>) => ReactNode; className?: string; resetOnSuccess?: boolean; danger?: boolean; confirm?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={ref}
      className={`bc-fin-form ${className ?? ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          setResult(r);
          if (r.ok) {
            if (resetOnSuccess) ref.current?.reset();
            router.refresh();
          }
        });
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={`bc-btn ${danger ? '' : 'primary'}`} disabled={pending} data-pending={pending ? 'true' : undefined}>{submitLabel}</button>
      </div>
      <ResultNotice result={result} success={success} />
    </form>
  );
}

/* ── Specific controls ──────────────────────────────────────────────── */

export function RunIngestionButton() {
  return <ActionButton label="Ingest booking facts now" pendingLabel="Ingesting…" run={actions.runIngestionAction} success={(r) => { const rep = r.report as { scanned: number; revenuePosted: number; paymentsRecorded: number; refundsPosted: number; matches: number; errors: string[] }; return `Scanned ${rep.scanned} bookings: ${rep.revenuePosted} revenue, ${rep.paymentsRecorded} payments, ${rep.refundsPosted} refunds posted; ${rep.matches} matches recorded${rep.errors.length ? `; ${rep.errors.length} errors (see log)` : ''}.`; }} />;
}

export function RunReconciliationButton() {
  return <ActionButton label="Run reconciliation" pendingLabel="Matching…" run={actions.runReconciliationAction} success={(r) => { const rep = r.report as { proposals: number; autoMatched: number; forReview: number }; return `${rep.proposals} proposals: ${rep.autoMatched} matched automatically, ${rep.forReview} sent to the inbox.`; }} />;
}

export function RunTaxEstimatesButton() {
  return <ActionButton label="Recompute system estimates" pendingLabel="Computing…" run={actions.runTaxEstimatesAction} success={(r) => { const rep = r.report as { vatPeriods: string[]; companyYear: number }; return `Recorded system estimates for VAT ${rep.vatPeriods.join(', ')} and company taxes ${rep.companyYear}. Filed and assessed periods were not touched.`; }} />;
}

export function ConfirmMatchButtons({ transactionId, paymentId, amountCents }: { transactionId: string; paymentId: string; amountCents: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="bc-btn sm primary" disabled={pending} onClick={() => start(async () => { const r = await actions.confirmMatchAction(transactionId, paymentId, amountCents); setResult(r); if (r.ok) router.refresh(); })}>Confirm match</button>
        <button type="button" className="bc-btn sm quiet" disabled={pending} onClick={() => { const reason = window.prompt('Why is this not a match?'); if (!reason) return; start(async () => { const r = await actions.rejectMatchAction(transactionId, paymentId, reason); setResult(r); if (r.ok) router.refresh(); }); }}>Reject…</button>
      </div>
      <ResultNotice result={result} success={() => 'Recorded.'} />
    </div>
  );
}

export function ExportButton({ kind, from, to, label }: { kind: ExportKind; from: string; to: string; label: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  return (
    <div className="grid gap-1">
      <button type="button" className="bc-btn sm" disabled={pending} data-pending={pending ? 'true' : undefined} onClick={() => start(async () => {
        const r = await actions.exportAction(kind, from, to);
        setResult(r);
        if (r.ok) {
          const blob = new Blob([r.text as string], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = r.filename as string; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      })}>
        {label}
      </button>
      <ResultNotice result={result} success={(r) => `Downloaded. Recorded in the export audit (sha256 ${String(r.sha256).slice(0, 12)}…).`} />
    </div>
  );
}

export function PrintButton() {
  return <button type="button" className="bc-btn sm quiet" onClick={() => window.print()}>Print / PDF</button>;
}

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  return <ActionButton label="Issue invoice (draws the next number)" pendingLabel="Issuing…" className="bc-btn primary" confirm="Issue this invoice? The number is drawn gaplessly and the invoice becomes immutable. Nothing is sent." run={() => actions.issueInvoiceAction(invoiceId)} success={(r) => `Issued as ${r.number}. The invoice is frozen; corrections need a credit note.`} />;
}

export function CreateDraftButton({ intentId, reference }: { intentId: string; reference: string }) {
  return <ActionButton label={`Draft invoice for ${reference}`} className="bc-btn sm" run={() => actions.createInvoiceDraftAction(intentId)} success={() => 'Draft created. Open it to check the § 14 requirements.'} />;
}

export function CommitImportButton({ batchId }: { batchId: string }) {
  return <ActionButton label="Import valid rows" pendingLabel="Importing…" className="bc-btn primary" confirm="Post the valid rows into the ledger? Each row is idempotent on its own reference." run={() => actions.commitImportAction(batchId)} success={(r) => `${r.posted} rows posted${Number(r.alreadyImported) ? `; ${r.alreadyImported} already imported earlier (nothing written)` : ''}${Number(r.amendments) ? `; ${r.amendments} amended by Booking.com, held for review` : ''}${(r.errors as string[]).length ? `; ${(r.errors as string[]).length} errors` : ''}. Reconciliation ran afterwards.`} />;
}

export function RematchSettlementsButton() {
  return <ActionButton label="Re-match reservations" pendingLabel="Matching…" className="bc-btn sm" run={actions.rematchSettlementsAction} success={(r) => { const rep = r.report as { scanned: number; changed: number; matched: number; unmatched: number; ambiguous: number; ledgerPosted: number; errors: string[] }; return `${rep.scanned} lines: ${rep.matched} matched, ${rep.unmatched} unmatched, ${rep.ambiguous} ambiguous; ${rep.changed} changed${rep.ledgerPosted ? `, ${rep.ledgerPosted} pending lines posted` : ''}${rep.errors.length ? `; ${rep.errors.length} errors` : ''}. No reservation was written.`; }} />;
}

export function AcceptAmendmentButton({ settlementId }: { settlementId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const router = useRouter();
  return (
    <div className="grid gap-1">
      <button type="button" className="bc-btn sm" disabled={pending} data-pending={pending ? 'true' : undefined} onClick={() => {
        const reason = window.prompt('Why accept Booking.com’s amended figures? The original line’s ledger postings are reversed (recorded with this reason) and the amended ones posted.');
        if (!reason) return;
        start(async () => { const r = await actions.acceptSettlementAmendmentAction(settlementId, reason); setResult(r); if (r.ok) router.refresh(); });
      }}>Accept amendment…</button>
      <ResultNotice result={result} success={() => 'Accepted: original reversed, amendment posted.'} />
    </div>
  );
}

export function NoticeStatusButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<ActionResult<Record<string, unknown>> | null>(null);
  const move = (to: string) => start(async () => { const r = await actions.setNoticeStatusAction(id, to); setResult(r); if (r.ok) router.refresh(); });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-1">
        {status === 'received' && <button type="button" className="bc-btn sm" disabled={pending} onClick={() => move('reviewed')}>Mark reviewed</button>}
        {status !== 'paid' && status !== 'superseded' && <button type="button" className="bc-btn sm quiet" disabled={pending} onClick={() => move('paid')}>Mark paid</button>}
        {status !== 'disputed' && status !== 'paid' && <button type="button" className="bc-btn sm quiet" disabled={pending} onClick={() => move('disputed')}>Disputed</button>}
      </div>
      <ResultNotice result={result} success={() => 'Updated.'} />
    </div>
  );
}

export function LinkDocumentButton({ documentId, targetType, targetId }: { documentId: string; targetType: string; targetId: string }) {
  return <ActionButton label="Link" className="bc-btn sm quiet" run={() => actions.linkDocumentAction(documentId, targetType, targetId)} success={() => 'Linked.'} />;
}
