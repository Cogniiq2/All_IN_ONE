'use client';

import * as actions from '@/lib/finance/actions';
import type { CategoryRow, TaxCodeRow } from '@/lib/finance/rows';
import { ActionForm } from '@/components/admin/finance/controls';
import { ALLOCATION_LABEL, INPUT_VAT_LABEL } from '@/lib/finance/presentation';

export function SettingsForms({ mode, categories, taxCodes }: { mode: 'policy' | 'rate' | 'counterparty' | 'account'; categories: CategoryRow[]; taxCodes: TaxCodeRow[] }) {
  const cents = (fd: FormData, f: string) => { const v = String(fd.get(f) ?? '').replace(/\./g, '').replace(',', '.'); const n = Number(v); if (v && Number.isFinite(n)) fd.set(f, String(Math.round(n * 100))); else fd.delete(f); };
  if (mode === 'policy') {
    return (
      <details className="bc-details"><summary>Set a policy value (effective-dated)</summary>
        <ActionForm action={actions.setPolicyAction} submitLabel="Set" success={() => 'Recorded. It applies from the effective date; older figures keep the older policy.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Key</span><select name="key" className="bc-select"><option value="vat_filing_frequency">vat_filing_frequency (monthly | quarterly | annual_only)</option><option value="dauerfristverlaengerung">dauerfristverlaengerung (true | false)</option><option value="fiscal_year_start_month">fiscal_year_start_month (1–12)</option><option value="vat_annual_return_month">vat_annual_return_month (1–12)</option><option value="tax_reserve_policy">tax_reserve_policy</option><option value="local_levy_enabled">local_levy_enabled (true | false)</option><option value="small_business_scheme">small_business_scheme (true | false)</option><option value="default_shared_cost_allocation">default_shared_cost_allocation</option></select></label>
            <label className="bc-field"><span className="bc-label">Value</span><input name="value" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">Effective from</span><input name="effective_from" type="date" className="bc-input" required /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Source / reason</span><input name="source_reference" className="bc-input" placeholder="e.g. Finanzamt letter of …" /></label>
        </ActionForm>
      </details>
    );
  }
  if (mode === 'rate') {
    return (
      <details className="bc-details"><summary>Add a confirmed rate (e.g. the Bayreuth Hebesatz for a year)</summary>
        <ActionForm action={actions.addTaxRateAction} submitLabel="Add rate" success={() => 'Added. Estimates for the period now use it.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Type</span><select name="tax_type" className="bc-select" defaultValue="gewst_hebesatz"><option value="gewst_hebesatz">GewSt Hebesatz (Bayreuth)</option><option value="gewst_messzahl">GewSt Messzahl</option><option value="kst">KSt</option><option value="soli">Soli</option></select></label>
            <label className="bc-field"><span className="bc-label">Rate in basis points (390 % = 39000)</span><input name="rate_bp" type="number" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">From</span><input name="effective_from" type="date" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">To</span><input name="effective_to" type="date" className="bc-input" /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Legal / source reference</span><input name="legal_reference" className="bc-input" required placeholder="Haushaltssatzung der Stadt Bayreuth 2026, § …" /></label>
          <label className="bc-field"><span className="bc-label">Source URL</span><input name="source_url" className="bc-input" /></label>
          <label className="flex items-center gap-2 bc-meta"><input type="checkbox" name="confirmed" value="true" /> Confirmed against the source (unchecked = review-flagged placeholder)</label>
        </ActionForm>
      </details>
    );
  }
  if (mode === 'counterparty') {
    return (
      <details className="bc-details"><summary>Add a counterparty rule</summary>
        <ActionForm action={actions.addCounterpartyAction} submitLabel="Add" success={() => 'Added. New expenses from this counterparty get its defaults.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Name</span><input name="name" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">Kind</span><select name="kind" className="bc-select" defaultValue="supplier">{['supplier', 'customer', 'ota', 'payment_provider', 'authority', 'bank', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Country</span><input name="country" className="bc-input" maxLength={2} defaultValue="DE" /></label>
            <label className="bc-field"><span className="bc-label">VAT id</span><input name="vat_id" className="bc-input" /></label>
            <label className="bc-field"><span className="bc-label">Default category</span><select name="default_category" className="bc-select" defaultValue=""><option value="">—</option>{categories.filter((c) => c.active).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Default tax code</span><select name="default_tax_code" className="bc-select" defaultValue=""><option value="">—</option>{taxCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Default input VAT</span><select name="default_input_vat" className="bc-select" defaultValue=""><option value="">—</option>{Object.entries(INPUT_VAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="bc-field"><span className="bc-label">Default allocation</span><select name="default_allocation" className="bc-select" defaultValue=""><option value="">—</option>{Object.entries(ALLOCATION_LABEL).filter(([k]) => k !== 'unallocated').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <label className="bc-field"><span className="bc-label">Match patterns (comma-separated, lower-case substrings of the bank text or invoice name)</span><input name="match_patterns" className="bc-input" /></label>
          <label className="flex items-center gap-2 bc-meta"><input type="checkbox" name="auto_verify" value="true" /> Auto-verify when the printed VAT agrees with the default code (never for marketplaces)</label>
          <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
        </ActionForm>
      </details>
    );
  }
  return (
    <details className="bc-details"><summary>Add an account</summary>
      <ActionForm action={(fd) => { cents(fd, 'opening_balance_cents'); return actions.addAccountAction(fd); }} submitLabel="Add account" success={() => 'Added. Cash now = opening balance + recorded movements.'}>
        <div className="row">
          <label className="bc-field"><span className="bc-label">Code</span><input name="code" className="bc-input" required placeholder="BANK" /></label>
          <label className="bc-field"><span className="bc-label">Label</span><input name="label" className="bc-input" required /></label>
          <label className="bc-field"><span className="bc-label">Kind</span><select name="kind" className="bc-select" defaultValue="bank">{['bank', 'paypal', 'cash', 'ota_wallet', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label className="bc-field"><span className="bc-label">IBAN (stored masked)</span><input name="iban" className="bc-input" /></label>
          <label className="bc-field"><span className="bc-label">Opening balance €</span><input name="opening_balance_cents" className="bc-input" inputMode="decimal" /></label>
          <label className="bc-field"><span className="bc-label">As of</span><input name="opening_balance_on" type="date" className="bc-input" /></label>
        </div>
      </ActionForm>
    </details>
  );
}
