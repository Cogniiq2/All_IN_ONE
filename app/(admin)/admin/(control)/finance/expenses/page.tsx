import type { Metadata } from 'next';
import Link from 'next/link';
import { loadExpenses, unitNamer } from '@/lib/finance/queries';
import { presetsFor, rangeOf, type Params } from '@/lib/finance/params';
import { categoryLabel } from '@/lib/finance/categories';
import { INPUT_VAT_LABEL } from '@/lib/finance/presentation';
import { PageHeader, Section, ErrorNotice, EmptyState } from '@/components/admin/primitives';
import { Money, RangeForm, PlainFigure, StateBadge, DateCell } from '@/components/admin/finance/primitives';
import { ExportButton } from '@/components/admin/finance/controls';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'mtd');
  const result = await loadExpenses(range);
  return (
    <>
      <PageHeader eyebrow="Finance" title="Expenses" description="What was spent, net, by service date. Input VAT counts only where its deductibility is decided; a document is expected on every supplier invoice." actions={<span className="flex flex-wrap gap-2"><Link href="/admin/finance/expenses/new" className="bc-btn sm primary">Post an expense</Link><ExportButton kind="expense_ledger" from={range.from} to={range.to} label="Export" /></span>} />
      <RangeForm action="/admin/finance/expenses" from={range.from} to={range.to} presets={presetsFor()} />
      {!result.ok ? <ErrorNotice title="Expenses could not be loaded.">{result.error}</ErrorNotice> : (
        <>
          <div className="bc-figures" style={{ ['--cols' as string]: 5 }}>
            <PlainFigure label="Expenses net" cents={result.data.totals.netCents} provenance="actual" note={`${result.data.lines.length} lines`} />
            <PlainFigure label="Input VAT deductible" cents={result.data.totals.deductibleVatCents} provenance="estimated" note={`of ${(result.data.totals.vatCents / 100).toFixed(2)} € VAT`} href="/admin/finance/vat" />
            <PlainFigure label="Unpaid" cents={result.data.totals.unpaidCents} provenance="calculated" href={`/admin/finance/transactions?payment=unpaid&from=${range.from}&to=${range.to}`} />
            <PlainFigure label="Missing documents" value={String(result.data.totals.missingDocs)} provenance="actual" href={`/admin/finance/transactions?document=missing&from=${range.from}&to=${range.to}`} />
            <PlainFigure label="Lines needing review" value={String(result.data.totals.needsReview)} provenance="actual" href={`/admin/finance/transactions?review=needs_review&from=${range.from}&to=${range.to}`} />
          </div>

          <div className="grid gap-8 lg:grid-cols-3 mt-2">
            <Section title="By category" id="cat">
              <div className="bc-ledger">{result.data.byCategory.map((c) => <Link key={c.category} href={`/admin/finance/transactions?category=${c.category}&from=${range.from}&to=${range.to}`} className="bc-ledger-row link-quiet"><span>{categoryLabel(c.category)} <span className="bc-meta">· {c.count}{c.missingDocs ? ` · ${c.missingDocs} w/o doc` : ''}</span></span><Money cents={c.netCents} /></Link>)}</div>
            </Section>
            <Section title="By supplier" id="sup">
              <div className="bc-ledger">{result.data.bySupplier.slice(0, 15).map((s) => <Link key={s.counterpartyId ?? s.label} href={`/admin/finance/transactions?${s.counterpartyId ? `counterparty=${s.counterpartyId}` : `q=${encodeURIComponent(s.label)}`}&from=${range.from}&to=${range.to}`} className="bc-ledger-row link-quiet"><span className="truncate">{s.label} <span className="bc-meta">· {s.count}</span></span><Money cents={s.netCents} /></Link>)}</div>
            </Section>
            <Section title="Cleaning" meta="expected vs invoiced" id="cleaning">
              <dl className="bc-kv">
                <div className="contents"><dt>Invoiced cleaning</dt><dd><Money cents={result.data.cleaning.netCents} /></dd></div>
                <div className="contents"><dt>Stays ended</dt><dd>{result.data.cleaning.stays}</dd></div>
                <div className="contents"><dt>Per stay</dt><dd><Money cents={result.data.cleaning.perStayCents} /></dd></div>
                <div className="contents"><dt>Expected (turnovers)</dt><dd><Money cents={result.data.cleaning.expected.reduce((s, t) => s + t.expected_net_cents, 0)} /> <span className="bc-meta">· {result.data.cleaning.expected.filter((t) => t.state === 'expected').length} awaiting invoice</span></dd></div>
              </dl>
              <p className="bc-meta mt-2" style={{ fontSize: 12 }}>An expectation is not an expense. The invoice is; the two are linked per turnover on the transaction detail.</p>
            </Section>
          </div>

          <Section title="Expense lines" meta={`${result.data.lines.length} in the range`} id="lines">
            {result.data.lines.length === 0 ? <div className="pt-3"><EmptyState title="No expenses in this range.">Post one, or import a statement.</EmptyState></div> : (
              <div className="bc-table-wrap">
                <table className="bc-table">
                  <thead><tr><th scope="col">Date</th><th scope="col">Supplier · description</th><th scope="col">Category · tax</th><th scope="col">Unit</th><th scope="col" className="num">Net</th><th scope="col" className="num">VAT</th><th scope="col">Input VAT</th><th scope="col">Document</th><th scope="col">Paid</th></tr></thead>
                  <tbody>
                    {result.data.lines.slice(0, 300).map((l) => {
                      const name = unitNamer(result.data.units);
                      return (
                        <tr key={l.id} data-href={`/admin/finance/transactions/${l.transaction_id}`}>
                          <td className="bc-cover"><Link href={`/admin/finance/transactions/${l.transaction_id}`}><DateCell iso={l.transaction.booked_on} /></Link></td>
                          <td><div style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.transaction.counterparty_label ?? '—'}</div><div className="bc-meta">{l.description ?? l.transaction.description}{l.transaction.supplier_invoice_no ? ` · ${l.transaction.supplier_invoice_no}` : ''}</div></td>
                          <td><div>{categoryLabel(l.category)} <StateBadge table="review" value={l.classification} ghost /></div><div className="bc-meta">{l.tax_code} · {l.rate_bp / 100} %</div></td>
                          <td className="dim">{name(l.unit_id ?? l.transaction.unit_id)}</td>
                          <td className="num"><Money cents={l.net_cents} /></td>
                          <td className="num"><Money cents={l.vat_cents} /></td>
                          <td className="dim">{INPUT_VAT_LABEL[l.input_vat_treatment] ?? l.input_vat_treatment}</td>
                          <td><StateBadge table="document" value={l.transaction.document_state} ghost /></td>
                          <td><StateBadge table="payment" value={l.transaction.payment_state} ghost /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
