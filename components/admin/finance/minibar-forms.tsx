'use client';

import * as actions from '@/lib/finance/actions';
import type { CounterpartyRow, MinibarProductRow, StayRow, TaxCodeRow } from '@/lib/finance/rows';
import type { UnitLookup } from '@/lib/finance/queries';
import { ActionForm } from '@/components/admin/finance/controls';

export function MinibarForms({ products, units, stays, taxCodes, counterparties, mayConfigure }: { products: MinibarProductRow[]; units: UnitLookup; stays: StayRow[]; taxCodes: TaxCodeRow[]; counterparties: CounterpartyRow[]; mayConfigure: boolean }) {
  const cents = (fd: FormData, f: string) => { const v = String(fd.get(f) ?? '').replace(/\./g, '').replace(',', '.'); const n = Number(v); if (v && Number.isFinite(n)) fd.set(f, String(Math.round(n * 100))); else fd.delete(f); };
  return (
    <>
      <section className="bc-section" aria-labelledby="mb-record">
        <div className="bc-section-head"><h2 id="mb-record" className="bc-h2">Record consumption or a movement</h2></div>
        <ActionForm action={(fd) => { const stay = String(fd.get('stay') ?? ''); const [intentId, ref, unitId] = stay.split('|'); if (intentId) { fd.set('booking_intent_id', intentId); fd.set('booking_reference', ref); if (!fd.get('unit_id')) fd.set('unit_id', unitId); } const p = products.find((x) => x.id === fd.get('product_id')); if (p) fd.set('sku', p.sku); return actions.recordMinibarMovementAction(fd); }} submitLabel="Record" success={(r) => (r.transactionId ? 'Recorded: stock reduced, revenue and COGS posted.' : 'Recorded.')}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Product</span><select name="product_id" className="bc-select" required>{products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {(p.selling_price_cents / 100).toFixed(2)} €</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Movement</span><select name="movement" className="bc-select" defaultValue="sale"><option value="sale">Sale / consumption</option><option value="purchase">Purchase (stock in)</option><option value="complimentary">Complimentary</option><option value="waste">Waste</option><option value="adjustment">Stock count adjustment (±)</option></select></label>
            <label className="bc-field"><span className="bc-label">Quantity</span><input name="quantity" type="number" className="bc-input" required defaultValue={1} /></label>
            <label className="bc-field"><span className="bc-label">Date</span><input name="occurred_on" type="date" className="bc-input" /></label>
          </div>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Stay (checkout today ± 3 days)</span><select name="stay" className="bc-select" defaultValue=""><option value="">— none —</option>{stays.map((s) => <option key={s.intent_id} value={`${s.intent_id}|${s.reference}|${s.unit_id}`}>{s.reference} · {s.guest_label ?? ''} · {s.check_in} – {s.check_out}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Unit</span><select name="unit_id" className="bc-select" defaultValue=""><option value="">from stay / none</option>{units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Charge state</span><select name="charge_state" className="bc-select" defaultValue="unpaid"><option value="unpaid">Unpaid (to collect / invoice)</option><option value="paid">Paid</option><option value="included">Included / complimentary</option><option value="written_off">Written off</option><option value="needs_review">Needs review</option></select></label>
          </div>
          <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" placeholder="e.g. stock count 20, book 22" /></label>
        </ActionForm>
      </section>
      {mayConfigure && (
        <details className="bc-details mt-4"><summary>Add a product</summary>
          <ActionForm action={(fd) => { cents(fd, 'selling_price_cents'); cents(fd, 'purchase_cost_cents'); return actions.addMinibarProductAction(fd); }} submitLabel="Add product" success={() => 'Added.'}>
            <div className="row">
              <label className="bc-field"><span className="bc-label">SKU</span><input name="sku" className="bc-input" required placeholder="WATER-05" /></label>
              <label className="bc-field"><span className="bc-label">Name</span><input name="name" className="bc-input" required /></label>
              <label className="bc-field"><span className="bc-label">Selling price €</span><input name="selling_price_cents" className="bc-input" inputMode="decimal" required /></label>
              <label className="bc-field"><span className="bc-label">Purchase cost €</span><input name="purchase_cost_cents" className="bc-input" inputMode="decimal" /></label>
              <label className="bc-field"><span className="bc-label">Tax code (sale)</span><select name="tax_code" className="bc-select" defaultValue="DE_REVIEW_REQUIRED">{taxCodes.filter((c) => c.side !== 'input').map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
              <label className="bc-field"><span className="bc-label">Tax code (purchase)</span><select name="purchase_tax_code" className="bc-select" defaultValue=""><option value="">—</option>{taxCodes.filter((c) => c.side !== 'output').map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
              <label className="bc-field"><span className="bc-label">Reorder at</span><input name="reorder_threshold" type="number" className="bc-input" defaultValue={6} /></label>
              <label className="bc-field"><span className="bc-label">Supplier</span><select name="supplier_id" className="bc-select" defaultValue=""><option value="">—</option>{counterparties.filter((c) => c.kind === 'supplier').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <p className="bc-meta" style={{ fontSize: 12 }}>Default is review-required: choose Beverages 19 % or Food items 7 % only when the classification is certain.</p>
          </ActionForm>
        </details>
      )}
    </>
  );
}
