'use client';

import * as actions from '@/lib/finance/actions';
import { ActionForm } from '@/components/admin/finance/controls';

/** The accountant-path and operator forms on the Taxes page. Amounts are typed in cents' euros and converted in the browser. */
export function TaxForms({ year, mode }: { year: number; mode: 'stage' | 'notice' | 'adjustment' | 'payment' | 'reserve' }) {
  const cents = (fd: FormData, field: string) => { const v = String(fd.get(field) ?? '').replace(/\./g, '').replace(',', '.'); const n = Number(v); if (v && Number.isFinite(n)) fd.set(field, String(Math.round(n * 100))); else fd.delete(field); };
  if (mode === 'stage') {
    return (
      <details className="bc-details"><summary>Record a reviewed / filed / assessed / paid amount (accountant path)</summary>
        <ActionForm action={(fd) => { cents(fd, 'amount_cents'); return actions.recordTaxStageAction(fd); }} submitLabel="Record stage" success={() => 'Recorded. The stage now governs the period and the reserve.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Tax</span><select name="tax_type" className="bc-select"><option value="vat">VAT</option><option value="kst">KSt</option><option value="soli">Soli</option><option value="gewst">GewSt</option></select></label>
            <label className="bc-field"><span className="bc-label">Period key</span><input name="period_key" className="bc-input" required placeholder={`${year}-Q3 or ${year}`} /></label>
            <label className="bc-field"><span className="bc-label">Stage</span><select name="stage" className="bc-select"><option value="accountant_reviewed">Accountant reviewed</option><option value="filed">Filed</option><option value="assessed">Assessed</option><option value="paid">Paid</option></select></label>
            <label className="bc-field"><span className="bc-label">Amount €</span><input name="amount_cents" className="bc-input" inputMode="decimal" required /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" placeholder="e.g. UStVA transmitted via ELSTER by the adviser" /></label>
        </ActionForm>
      </details>
    );
  }
  if (mode === 'notice') {
    return (
      <details className="bc-details"><summary>Register a tax notice</summary>
        <ActionForm action={(fd) => { cents(fd, 'assessed_cents'); cents(fd, 'advance_payment_cents'); for (let i = 0; i < 4; i += 1) cents(fd, `due_${i}_amount_cents`); return actions.addTaxNoticeAction(fd); }} submitLabel="Register notice" success={() => 'Registered. It appears in the inbox until reviewed; its due dates enter the calendar.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Tax</span><select name="tax_type" className="bc-select"><option value="kst">KSt</option><option value="soli">Soli</option><option value="gewst">GewSt</option><option value="vat">VAT</option><option value="other">Other</option></select></label>
            <label className="bc-field"><span className="bc-label">Period</span><input name="period_key" className="bc-input" required placeholder={String(year)} /></label>
            <label className="bc-field"><span className="bc-label">Authority</span><input name="authority" className="bc-input" required placeholder="Finanzamt Bayreuth / Stadt Bayreuth" /></label>
            <label className="bc-field"><span className="bc-label">Type</span><select name="notice_type" className="bc-select"><option value="assessment">Assessment</option><option value="advance_payment">Advance payment</option><option value="amendment">Amendment</option><option value="interest">Interest</option><option value="late_surcharge">Late surcharge</option><option value="other">Other</option></select></label>
            <label className="bc-field"><span className="bc-label">Dated</span><input name="assessment_date" type="date" className="bc-input" /></label>
            <label className="bc-field"><span className="bc-label">Received</span><input name="received_on" type="date" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">Assessed €</span><input name="assessed_cents" className="bc-input" inputMode="decimal" /></label>
            <label className="bc-field"><span className="bc-label">Advance total €</span><input name="advance_payment_cents" className="bc-input" inputMode="decimal" /></label>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="row">
              <label className="bc-field"><span className="bc-label">Due {i + 1} on</span><input name={`due_${i}_on`} type="date" className="bc-input" /></label>
              <label className="bc-field"><span className="bc-label">Amount €</span><input name={`due_${i}_amount_cents`} className="bc-input" inputMode="decimal" /></label>
              <label className="bc-field"><span className="bc-label">Label</span><input name={`due_${i}_label`} className="bc-input" placeholder="IV. Quartal" /></label>
            </div>
          ))}
          <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
        </ActionForm>
      </details>
    );
  }
  if (mode === 'adjustment') {
    return (
      <details className="bc-details"><summary>Add a tax adjustment (accountant path)</summary>
        <ActionForm action={(fd) => { cents(fd, 'amount_cents'); return actions.addTaxAdjustmentAction(fd); }} submitLabel="Add adjustment" success={() => 'Added. The estimate uses it immediately.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Tax</span><select name="tax_type" className="bc-select"><option value="kst">KSt</option><option value="gewst">GewSt</option><option value="vat">VAT</option></select></label>
            <label className="bc-field"><span className="bc-label">Fiscal year</span><input name="fiscal_year" type="number" className="bc-input" defaultValue={year} required /></label>
            <label className="bc-field"><span className="bc-label">Kind</span><select name="kind" className="bc-select"><option value="non_deductible_expense">Non-deductible expense</option><option value="tax_free_income">Tax-free income</option><option value="loss_carryforward">Loss carry-forward</option><option value="gewst_addition">GewSt Hinzurechnung</option><option value="gewst_reduction">GewSt Kürzung</option><option value="vat_correction">VAT correction</option><option value="other">Other</option></select></label>
            <label className="bc-field"><span className="bc-label">Amount €</span><input name="amount_cents" className="bc-input" inputMode="decimal" required /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Reason</span><input name="reason" className="bc-input" required /></label>
          <label className="bc-field"><span className="bc-label">Legal reference</span><input name="legal_reference" className="bc-input" placeholder="§ 4 Abs. 5 EStG" /></label>
        </ActionForm>
      </details>
    );
  }
  if (mode === 'payment') {
    return (
      <details className="bc-details"><summary>Record a tax payment</summary>
        <ActionForm action={(fd) => { cents(fd, 'amount_cents'); return actions.recordTaxPaymentAction(fd); }} submitLabel="Record payment" success={() => 'Recorded. The reserve requirement falls by the paid amount.'}>
          <div className="row">
            <label className="bc-field"><span className="bc-label">Tax</span><select name="tax_type" className="bc-select"><option value="vat">VAT</option><option value="kst">KSt</option><option value="soli">Soli</option><option value="gewst">GewSt</option><option value="other">Other</option></select></label>
            <label className="bc-field"><span className="bc-label">Period</span><input name="period_key" className="bc-input" required placeholder={String(year)} /></label>
            <label className="bc-field"><span className="bc-label">Kind</span><select name="kind" className="bc-select"><option value="advance">Advance</option><option value="final">Final</option><option value="refund">Refund received</option><option value="interest">Interest</option><option value="surcharge">Surcharge</option></select></label>
            <label className="bc-field"><span className="bc-label">Paid on</span><input name="paid_on" type="date" className="bc-input" required /></label>
            <label className="bc-field"><span className="bc-label">Amount €</span><input name="amount_cents" className="bc-input" inputMode="decimal" required /></label>
          </div>
          <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
        </ActionForm>
      </details>
    );
  }
  return (
    <details className="bc-details"><summary>Declare cash held as reserve</summary>
      <ActionForm action={(fd) => { cents(fd, 'amount_cents'); return actions.setReserveAction(fd); }} submitLabel="Declare" success={() => 'Declared. The coverage updates; no bank movement is implied.'}>
        <div className="row">
          <label className="bc-field"><span className="bc-label">Kind</span><select name="kind" className="bc-select"><option value="tax">Tax</option><option value="maintenance">Maintenance</option><option value="deposit">Deposits held</option><option value="other">Other</option></select></label>
          <label className="bc-field"><span className="bc-label">Label</span><input name="label" className="bc-input" required defaultValue="Tax reserve (sub-account)" /></label>
          <label className="bc-field"><span className="bc-label">Amount held €</span><input name="amount_cents" className="bc-input" inputMode="decimal" required /></label>
          <label className="bc-field"><span className="bc-label">As of</span><input name="as_of" type="date" className="bc-input" required /></label>
        </div>
        <label className="bc-field"><span className="bc-label">Note</span><input name="note" className="bc-input" /></label>
      </ActionForm>
    </details>
  );
}
