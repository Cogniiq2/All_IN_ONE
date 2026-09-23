'use client';

import Link from 'next/link';
import * as actions from '@/lib/finance/actions';
import { offeredAdapters } from '@/lib/finance/import/adapters';
import { ActionForm } from '@/components/admin/finance/controls';

export function ImportForm() {
  return (
    <section className="bc-section" aria-labelledby="imp-stage">
      <div className="bc-section-head"><h2 id="imp-stage" className="bc-h2">Stage a file</h2><span className="bc-meta">CSV up to 5 MB</span></div>
      <ActionForm action={actions.stageImportAction} submitLabel="Stage and validate" success={(r) => (r.batchId ? <>Staged: {String(r.summary)} <Link href={`/admin/finance/imports/${String(r.batchId)}`} className="bc-ref">Preview →</Link></> : String(r.summary))}>
        <label className="bc-field"><span className="bc-label">Adapter</span>
          <select name="adapter" className="bc-select" defaultValue="auto">
            <option value="auto">Detect from the file&rsquo;s columns</option>
            {offeredAdapters().map((a) => <option key={a.id} value={a.id}>{a.label} ({a.readiness})</option>)}
          </select>
        </label>
        <label className="bc-field"><span className="bc-label">File</span><input name="file" type="file" className="bc-input" accept=".csv,text/csv" required /></label>
        <p className="bc-meta" style={{ fontSize: 12 }}>Nothing is posted at this step. The batch is hashed (a re-upload of the same file is refused), rows are parsed and validated, and you preview them before importing. A Booking.com finance statement is uploaded exactly as the Extranet exports it; guest names in it are never stored.</p>
      </ActionForm>
    </section>
  );
}
