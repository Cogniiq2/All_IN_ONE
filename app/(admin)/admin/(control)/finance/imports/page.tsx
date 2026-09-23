import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadImports } from '@/lib/finance/queries';
import { ADAPTERS } from '@/lib/finance/import/adapters';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { StateBadge } from '@/components/admin/finance/primitives';
import { ImportForm } from '@/components/admin/finance/import-form';

export const metadata: Metadata = { title: 'Imports' };

export default async function ImportsPage() {
  const [result, operator] = await Promise.all([loadImports(), currentOperator()]);
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  return (
    <>
      <PageHeader eyebrow="Finance · banking foundation" title="Imports" description="Statements come in as files: staged, validated row by row, previewed, then posted through the same commands as everything else. The same bytes are never imported twice. A future Open-Banking feed plugs into the same contract." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          {!result.ok ? <ErrorNotice title="Imports could not be loaded.">{result.error}</ErrorNotice> : (
            <Section title="Batches" id="batches">
              {result.data.batches.length === 0 ? <p className="bc-meta mt-3">No import yet.</p> : (
                <div className="bc-rows">
                  {result.data.batches.map((b) => (
                    <Link key={b.id} href={`/admin/finance/imports/${b.id}`} className="bc-row bc-row-link" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                      <span className="min-w-0"><div className="truncate" style={{ fontWeight: 500 }}>{b.filename}</div><div className="bc-meta">{ADAPTERS.find((a) => a.id === b.adapter)?.label ?? b.adapter} v{b.adapter_version} · {b.row_count} rows · {b.valid_rows} valid · {b.error_rows} errors · {b.duplicate_rows} duplicates{b.error ? ` · ${b.error}` : ''}</div></span>
                      <StateBadge table="batch" value={b.status} />
                      <span className="bc-meta whitespace-nowrap"><When value={b.created_at} relative /></span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          )}
          <Section title="Adapters" meta="production-readiness is declared per adapter and shown everywhere" id="adapters">
            <table className="bc-mini-table mt-2">
              <thead><tr><th>Adapter</th><th>Readiness</th><th>Required columns</th></tr></thead>
              <tbody>{ADAPTERS.map((a) => <tr key={a.id}><td>{a.label}<div className="bc-meta">{a.description}</div></td><td><span className="bc-badge" data-tone={a.readiness === 'validated' ? 'positive' : a.readiness === 'retired' ? 'muted' : 'caution'}>{a.readiness}</span></td><td className="bc-mono bc-meta">{a.requiredHeaders.join(' · ')}</td></tr>)}</tbody>
            </table>
            <p className="bc-meta mt-2" style={{ fontSize: 12 }}>Experimental adapters were built from documented column names and not validated against a live export. Preview every row before importing; the header check is strict and refuses a file that is not the format. Retired adapters accept no new upload; they remain listed so batches staged with them stay readable.</p>
          </Section>
        </div>
        <div>
          {mayEdit ? <ImportForm /> : <Notice tone="neutral">Imports are staged by operators. Your session is read-only here.</Notice>}
        </div>
      </div>
    </>
  );
}
