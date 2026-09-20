'use client';

import * as actions from '@/lib/finance/actions';
import { ActionForm } from '@/components/admin/finance/controls';
import { DOCUMENT_TYPE_LABEL } from '@/lib/finance/presentation';

/** Register a document from the Documents screen (client boundary: the form's success renderer is a function). */
export function RegisterDocumentForm({ counterparties }: { counterparties: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={actions.uploadDocumentAction} submitLabel="Register" success={(r) => (r.duplicate ? 'Already registered (same content). Nothing duplicated.' : 'Registered. Link it from the transaction it evidences, or below.')}>
      <label className="bc-field"><span className="bc-label">File</span><input name="file" type="file" className="bc-input" required accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,.csv,.txt" /></label>
      <div className="row">
        <label className="bc-field"><span className="bc-label">Type</span><select name="document_type" className="bc-select" defaultValue="supplier_invoice">{Object.entries(DOCUMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="bc-field"><span className="bc-label">Document date</span><input name="document_date" type="date" className="bc-input" /></label>
        <label className="bc-field"><span className="bc-label">Counterparty</span><select name="counterparty_id" className="bc-select" defaultValue=""><option value="">—</option>{counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
    </ActionForm>
  );
}
