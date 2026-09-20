'use client';

import { useState } from 'react';
import * as actions from '@/lib/finance/actions';
import type { CategoryRow, LineRow, TaxCodeRow, TransactionRow } from '@/lib/finance/rows';
import type { UnitLookup } from '@/lib/finance/queries';
import { ActionForm } from '@/components/admin/finance/controls';
import { ALLOCATION_LABEL, INPUT_VAT_LABEL } from '@/lib/finance/presentation';

/**
 * The per-record work surface: reclassify one line (with a reason), mark
 * document / payment state, upload a document, reverse (with a reason).
 * Nothing here bulk-edits. The accountant lock is a separate, admin-only
 * toggle on the same form so the audit trail shows who locked what.
 */
export function TransactionActions({ transaction: t, lines, units, categories, taxCodes, locked, mayReview, mayEdit, mayTax }: { transaction: TransactionRow; lines: LineRow[]; units: UnitLookup; categories: CategoryRow[]; taxCodes: TaxCodeRow[]; locked: boolean; mayReview: boolean; mayEdit: boolean; mayTax: boolean }) {
  const [tab, setTab] = useState<'classify' | 'state' | 'document' | 'reverse'>(locked ? 'reverse' : lines.some((l) => ['needs_review', 'suggested'].includes(l.classification)) ? 'classify' : t.document_state === 'missing' ? 'document' : 'state');
  const isRevenue = ['revenue', 'refund', 'credit_note'].includes(t.kind);
  return (
    <div className="pt-3 grid gap-4">
      <div className="bc-seg" role="tablist">
        {!locked && mayReview && <button type="button" role="tab" aria-selected={tab === 'classify'} onClick={() => setTab('classify')}>Classify a line</button>}
        {!locked && mayEdit && <button type="button" role="tab" aria-selected={tab === 'state'} onClick={() => setTab('state')}>Document / payment state</button>}
        {mayEdit && <button type="button" role="tab" aria-selected={tab === 'document'} onClick={() => setTab('document')}>Upload document</button>}
        {mayReview && <button type="button" role="tab" aria-selected={tab === 'reverse'} onClick={() => setTab('reverse')}>Reverse</button>}
      </div>

      {tab === 'classify' && !locked && mayReview && (
        <ActionForm action={actions.reclassifyLineAction} submitLabel="Apply with reason" resetOnSuccess={false} success={(r) => `Reclassified (${r.changed} field${r.changed === 1 ? '' : 's'} changed). Recorded in the change history.`}>
          <input type="hidden" name="transaction_id" value={t.id} />
          <div className="row">
            <label className="bc-field"><span className="bc-label">Line</span><select name="line_id" className="bc-select" required defaultValue={lines.find((l) => ['needs_review', 'suggested'].includes(l.classification))?.id ?? lines[0]?.id}>{lines.map((l) => <option key={l.id} value={l.id}>#{l.line_no} · {l.description ?? l.category} · {(l.gross_cents / 100).toFixed(2)} €</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Category</span><select name="category" className="bc-select" defaultValue=""><option value="">— keep —</option>{categories.filter((c) => c.active && (isRevenue ? c.kind === 'revenue' : c.kind !== 'revenue')).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Tax code (same rate only)</span><select name="tax_code" className="bc-select" defaultValue=""><option value="">— keep —</option>{taxCodes.filter((c) => c.active && (isRevenue ? c.side !== 'input' : c.side !== 'output')).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            {!isRevenue && <label className="bc-field"><span className="bc-label">Input VAT</span><select name="input_vat_treatment" className="bc-select" defaultValue=""><option value="">— keep —</option>{Object.entries(INPUT_VAT_LABEL).filter(([k]) => k !== 'not_applicable' || true).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
            {!isRevenue && <label className="bc-field"><span className="bc-label">Deductible share (bp, 10000 = 100 %)</span><input name="deductible_bp" type="number" min={0} max={10000} className="bc-input" placeholder="keep" /></label>}
            <label className="bc-field"><span className="bc-label">Unit</span><select name="unit_id" className="bc-select" defaultValue=""><option value="">— keep —</option><option value="none">Not allocated</option>{units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Allocation method</span><select name="allocation_method" className="bc-select" defaultValue=""><option value="">— keep —</option>{Object.entries(ALLOCATION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {!isRevenue && <label className="bc-field"><span className="bc-label">Asset</span><select name="asset_state" className="bc-select" defaultValue=""><option value="">— keep —</option><option value="candidate">Asset candidate</option><option value="confirmed_asset">Confirmed fixed asset</option><option value="not_asset">Not an asset (expense)</option></select></label>}
          </div>
          <label className="bc-field"><span className="bc-label">Reason (required, recorded)</span><input name="reason" className="bc-input" required minLength={3} placeholder="e.g. invoice shows 7 % — food items" /></label>
          {mayTax && <label className="flex items-center gap-2 bc-meta"><input type="checkbox" name="as_accountant" value="true" /> Lock as accountant (automation and operators cannot change the line afterwards)</label>}
          <p className="bc-meta" style={{ fontSize: 12 }}>Money is immutable: a tax code with a different rate is refused here. Reverse the transaction and post it again with the correct split instead.</p>
        </ActionForm>
      )}

      {tab === 'state' && !locked && mayEdit && (
        <ActionForm action={actions.setTransactionStateAction} submitLabel="Update state" resetOnSuccess={false} success={() => 'Updated.'}>
          <input type="hidden" name="transaction_id" value={t.id} />
          <div className="row">
            <label className="bc-field"><span className="bc-label">Document state</span><select name="document_state" className="bc-select" defaultValue=""><option value="">— keep —</option><option value="complete">Complete</option><option value="missing">Missing</option><option value="pending">Pending</option><option value="not_required">Not required (reason below)</option></select></label>
            <label className="bc-field"><span className="bc-label">Payment state</span><select name="payment_state" className="bc-select" defaultValue=""><option value="">— keep —</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="not_applicable">No payment expected</option></select></label>
            <label className="bc-field"><span className="bc-label">Supplier invoice no.</span><input name="supplier_invoice_no" className="bc-input" defaultValue={t.supplier_invoice_no ?? ''} /></label>
            <label className="bc-field"><span className="bc-label">Due on</span><input name="due_on" type="date" className="bc-input" defaultValue={t.due_on ?? ''} /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Note / reason</span><input name="reason" className="bc-input" placeholder="why (required for “not required”)" /></label>
          <label className="bc-field"><span className="bc-label">Record note</span><input name="note" className="bc-input" defaultValue={t.note ?? ''} /></label>
        </ActionForm>
      )}

      {tab === 'document' && mayEdit && (
        <ActionForm action={actions.uploadDocumentAction} submitLabel="Upload and link" success={(r) => (r.duplicate ? 'This exact file was already registered; it has been linked.' : 'Registered, hashed and linked. The document state is now complete.')}>
          <input type="hidden" name="target_type" value="transaction" />
          <input type="hidden" name="target_id" value={t.id} />
          <div className="row">
            <label className="bc-field"><span className="bc-label">File (PDF, image, XML)</span><input name="file" type="file" className="bc-input" required accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,.csv,.txt" /></label>
            <label className="bc-field"><span className="bc-label">Type</span><select name="document_type" className="bc-select" defaultValue={isRevenue ? 'guest_invoice' : t.kind === 'commission' ? 'booking_com_commission_invoice' : 'supplier_invoice'}>{['supplier_invoice', 'receipt', 'booking_com_commission_invoice', 'booking_com_payout_statement', 'paypal_statement', 'bank_statement', 'credit_note', 'e_invoice', 'contract', 'other'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Document date</span><input name="document_date" type="date" className="bc-input" defaultValue={t.invoice_date ?? t.booked_on} /></label>
          </div>
          <p className="bc-meta" style={{ fontSize: 12 }}>The original is hashed (SHA-256) and never overwritten. A second upload of the same bytes is detected. Bytes are stored in the private finance bucket when configured; the registry row is written either way.</p>
        </ActionForm>
      )}

      {tab === 'reverse' && mayReview && (
        <ActionForm action={actions.reverseTransactionAction} submitLabel="Reverse with reason" danger confirm="Post a mirror-image reversal? The original stays visible and frozen; both point at each other." success={(r) => `Reversed. Correction ${String(r.reversalId).slice(0, 8)}… posted; open it from “Related facts”.`}>
          <input type="hidden" name="transaction_id" value={t.id} />
          <div className="row">
            <label className="bc-field"><span className="bc-label">Correction date (open period; defaults to today or the original date)</span><input name="booked_on" type="date" className="bc-input" /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Reason (required, recorded)</span><input name="reason" className="bc-input" required minLength={3} placeholder="e.g. duplicate of RE-2026-0455" /></label>
          <p className="bc-meta" style={{ fontSize: 12 }}>A reversal never deletes. Original + reversal net to zero in every aggregate and both remain in the ledger for the trail.</p>
        </ActionForm>
      )}
    </div>
  );
}
