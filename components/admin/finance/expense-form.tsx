'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as actions from '@/lib/finance/actions';
import type { CategoryRow, CounterpartyRow, TaxCodeRow } from '@/lib/finance/rows';
import type { UnitLookup } from '@/lib/finance/queries';
import { ActionForm } from '@/components/admin/finance/controls';
import { classifyExpense } from '@/lib/finance/categorization';
import { parseDecimalToCents, vatFromNet, formatCents } from '@/lib/finance/money';
import { ALLOCATION_LABEL, INPUT_VAT_LABEL } from '@/lib/finance/presentation';

interface LineState { category: string; taxCode: string; net: string; vat: string; description: string; unitId: string; allocation: string; inputVat: string; asset: boolean }

export function ExpenseForm({ units, categories, taxCodes, counterparties }: { units: UnitLookup; categories: CategoryRow[]; taxCodes: TaxCodeRow[]; counterparties: CounterpartyRow[] }) {
  const [supplier, setSupplier] = useState('');
  const [country, setCountry] = useState('DE');
  const [vatId, setVatId] = useState('');
  const [lines, setLines] = useState<LineState[]>([{ category: '', taxCode: '', net: '', vat: '', description: '', unitId: '', allocation: 'direct', inputVat: '', asset: false }]);
  const suggestion = useMemo(() => classifyExpense({ counterpartyName: supplier || null, counterpartyCountry: country || null, counterpartyVatId: vatId || null, netCents: parseDecimalToCents(lines[0]?.net ?? '') ?? null, vatCents: parseDecimalToCents(lines[0]?.vat ?? '') ?? null }, counterparties), [supplier, country, vatId, lines, counterparties]);
  const expenseCategories = categories.filter((c) => c.active && c.kind !== 'revenue');
  const inputCodes = taxCodes.filter((c) => c.active && c.side !== 'output');
  const update = (i: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const autoVat = (i: number) => {
    const l = lines[i];
    const code = taxCodes.find((c) => c.code === l.taxCode);
    const net = parseDecimalToCents(l.net);
    if (!code || net === null) return;
    const vat = code.treatment === 'standard' || code.treatment === 'reduced' ? vatFromNet(net, code.rate_bp) : 0;
    update(i, { vat: (vat / 100).toFixed(2).replace('.', ',') });
  };
  const total = lines.reduce((s, l) => s + (parseDecimalToCents(l.net) ?? 0) + (parseDecimalToCents(l.vat) ?? 0), 0);

  return (
    <ActionForm action={(fd) => {
      // Money is typed as decimals; the action receives integer cents.
      lines.forEach((l, i) => {
        fd.set(`line_${i}_category`, l.category); fd.set(`line_${i}_tax_code`, l.taxCode); fd.set(`line_${i}_description`, l.description); fd.set(`line_${i}_unit_id`, l.unitId || 'none');
        fd.set(`line_${i}_allocation`, l.allocation); fd.set(`line_${i}_input_vat`, l.inputVat || suggestion.inputVatTreatment); fd.set(`line_${i}_asset`, l.asset ? 'candidate' : 'none');
        fd.set(`line_${i}_net_cents`, String(parseDecimalToCents(l.net) ?? '')); fd.set(`line_${i}_vat_cents`, String(parseDecimalToCents(l.vat) ?? 0));
      });
      return actions.postExpenseAction(fd);
    }} submitLabel="Post expense" success={(r) => (r.created ? <>Posted. <Link href={`/admin/finance/transactions/${String(r.id)}`} className="bc-ref">Open the transaction →</Link></> : 'This exact invoice was already posted (same supplier, number, date and amounts).')}>
      <div className="row">
        <label className="bc-field"><span className="bc-label">Supplier</span><input name="counterparty_name" className="bc-input" required list="cp-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="as printed on the invoice" /><datalist id="cp-list">{counterparties.map((c) => <option key={c.id} value={c.name} />)}</datalist></label>
        <label className="bc-field"><span className="bc-label">Country</span><input name="counterparty_country" className="bc-input" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></label>
        <label className="bc-field"><span className="bc-label">Supplier VAT id</span><input name="counterparty_vat_id" className="bc-input" value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="optional" /></label>
        <label className="bc-field"><span className="bc-label">Invoice number</span><input name="supplier_invoice_no" className="bc-input" placeholder="§ 14 Abs. 4 Nr. 4" /></label>
      </div>
      <div className="row">
        <label className="bc-field"><span className="bc-label">Service / booking date</span><input name="booked_on" type="date" className="bc-input" required /></label>
        <label className="bc-field"><span className="bc-label">Invoice date</span><input name="invoice_date" type="date" className="bc-input" /></label>
        <label className="bc-field"><span className="bc-label">Due</span><input name="due_on" type="date" className="bc-input" /></label>
        <label className="bc-field" style={{ gridColumn: 'span 2' }}><span className="bc-label">Description</span><input name="description" className="bc-input" required placeholder="what was bought" /></label>
      </div>
      {supplier && (
        <div className="bc-notice" data-tone={suggestion.classification === 'auto_verified' ? 'positive' : suggestion.classification === 'suggested' ? 'progress' : 'caution'}>
          <div><strong>Rule engine: {suggestion.classification.replace('_', ' ')}</strong> — {suggestion.reasons.join(' ')} <button type="button" className="bc-btn sm quiet ml-2" onClick={() => setLines((ls) => ls.map((l, i) => (i === 0 ? { ...l, category: l.category || suggestion.category, taxCode: l.taxCode || suggestion.taxCode, inputVat: l.inputVat || suggestion.inputVatTreatment, allocation: suggestion.allocationMethod === 'unallocated' ? l.allocation : suggestion.allocationMethod } : l)))}>Apply suggestion to line 1</button></div>
        </div>
      )}
      <div className="bc-fin-lines">
        {lines.map((l, i) => (
          <div key={i} className="bc-fin-line">
            <label className="bc-field"><span className="bc-label">Category</span><select className="bc-select" value={l.category} required onChange={(e) => { const cat = expenseCategories.find((c) => c.code === e.target.value); update(i, { category: e.target.value, taxCode: l.taxCode || cat?.default_tax_code || '' }); }}><option value="">—</option>{expenseCategories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Tax code</span><select className="bc-select" value={l.taxCode} required onChange={(e) => update(i, { taxCode: e.target.value })}><option value="">—</option>{inputCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Net €</span><input className="bc-input" inputMode="decimal" value={l.net} required onChange={(e) => update(i, { net: e.target.value })} onBlur={() => autoVat(i)} placeholder="0,00" /></label>
            <label className="bc-field"><span className="bc-label">VAT €</span><input className="bc-input" inputMode="decimal" value={l.vat} onChange={(e) => update(i, { vat: e.target.value })} placeholder="auto" /></label>
            <label className="bc-field"><span className="bc-label">Unit</span><select className="bc-select" value={l.unitId} onChange={(e) => update(i, { unitId: e.target.value })}><option value="">Not allocated</option>{units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Allocation</span><select className="bc-select" value={l.allocation} onChange={(e) => update(i, { allocation: e.target.value })}>{Object.entries(ALLOCATION_LABEL).filter(([k]) => k !== 'unallocated').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Input VAT</span><select className="bc-select" value={l.inputVat} onChange={(e) => update(i, { inputVat: e.target.value })}><option value="">suggest: {INPUT_VAT_LABEL[suggestion.inputVatTreatment]}</option>{Object.entries(INPUT_VAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Line description</span><input className="bc-input" value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="optional" /></label>
            <label className="flex items-center gap-2 bc-meta self-end"><input type="checkbox" checked={l.asset} onChange={(e) => update(i, { asset: e.target.checked })} /> asset candidate</label>
            {lines.length > 1 && <button type="button" className="bc-btn sm quiet self-end" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="bc-btn sm" onClick={() => setLines((ls) => [...ls, { category: '', taxCode: '', net: '', vat: '', description: '', unitId: '', allocation: 'direct', inputVat: '', asset: false }])}>Add a line (split by unit / category / rate)</button>
          <span className="bc-num" style={{ fontWeight: 600 }}>Gross {formatCents(total)}</span>
        </div>
      </div>
      <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" placeholder="optional" /></label>
      <p className="bc-meta" style={{ fontSize: 12 }}>The document is uploaded on the transaction after posting (or on Documents first, then linked). An expense without a document stays in the inbox until one is linked or it is marked not required with a reason.</p>
    </ActionForm>
  );
}
