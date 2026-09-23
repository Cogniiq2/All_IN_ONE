import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadBookingComFinance } from '@/lib/finance/queries';
import { isUuid, one, presetsFor, qs, rangeOf, type Params } from '@/lib/finance/params';
import type { SettlementReconState } from '@/lib/finance/settlements';
import { PageHeader, Section, ErrorNotice, EmptyState, Notice } from '@/components/admin/primitives';
import { Money, RangeForm } from '@/components/admin/finance/primitives';
import { AcceptAmendmentButton, RematchSettlementsButton } from '@/components/admin/finance/controls';
import { PayoutTable, SettlementFigures, SettlementTable } from '@/components/admin/finance/settlement-views';

export const metadata: Metadata = { title: 'Booking.com' };

const STATES: Array<{ value: SettlementReconState; label: string }> = [
  { value: 'reconciled', label: 'Reconciled' },
  { value: 'discrepancy', label: 'Gross differs' },
  { value: 'no_local_gross', label: 'No local amount' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'ambiguous', label: 'Ambiguous' },
];

/**
 * Booking.com settlement economics, from the Extranet finance statement:
 * what each reservation grossed, what Booking.com kept, what it paid out and
 * in which payout, and whether each line agrees with the local reservation.
 * Operational KPIs (occupancy, ADR, RevPAR) stay on Performance; nothing on
 * this page feeds them.
 */
export default async function BookingComFinancePage({ searchParams }: { searchParams: Params }) {
  const range = rangeOf(searchParams, 'ytd');
  const basis = one(searchParams, 'basis', 10) === 'checkout' ? 'checkout' : 'payout';
  const unit = one(searchParams, 'unit', 40);
  const payout = one(searchParams, 'payout', 64);
  const stateParam = one(searchParams, 'state', 20);
  const state = STATES.some((s) => s.value === stateParam) ? (stateParam as SettlementReconState) : null;
  const unitId = unit === 'none' ? null : isUuid(unit) || (unit && /^[a-z0-9-]{1,40}$/.test(unit)) ? unit : null;
  // A payout filter narrows to one transfer across all time; the period would only hide it.
  const effectiveRange = payout ? { from: '2000-01-01', to: '2100-01-01' } : range;
  const [result, operator] = await Promise.all([
    loadBookingComFinance(effectiveRange, { basis, unitId, payoutId: payout, state }),
    currentOperator(),
  ]);
  const mayEdit = can(operator?.role, 'finance.edit') && !operator?.preview;
  const mayReview = can(operator?.role, 'finance.review') && !operator?.preview;
  const base = { from: range.from, to: range.to, basis: basis === 'checkout' ? 'checkout' : null };

  return (
    <>
      <PageHeader
        eyebrow="Finance · settlements"
        title="Booking.com"
        description="Statement gross, commission, payment service fee and net payout, per reservation and per payout, from the Booking.com finance statement. Each line is matched to the local reservation by its Booking.com number; the reservation itself is never changed."
        actions={mayEdit ? <RematchSettlementsButton /> : undefined}
      />
      <RangeForm
        action="/admin/finance/booking-com"
        from={range.from}
        to={range.to}
        presets={presetsFor()}
        extra={
          <>
            <label className="bc-field"><span className="bc-label">Period by</span>
              <select name="basis" defaultValue={basis} className="bc-select"><option value="payout">Payout date</option><option value="checkout">Check-out</option></select>
            </label>
            {result.ok && (
              <>
                <label className="bc-field"><span className="bc-label">Unit</span>
                  <select name="unit" defaultValue={unit ?? ''} className="bc-select"><option value="">All units</option>{result.data.units.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select>
                </label>
                <label className="bc-field"><span className="bc-label">Payout</span>
                  <select name="payout" defaultValue={payout ?? ''} className="bc-select"><option value="">All payouts</option>{result.data.payoutIds.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </label>
              </>
            )}
            <label className="bc-field"><span className="bc-label">Status</span>
              <select name="state" defaultValue={state ?? ''} className="bc-select"><option value="">Any status</option>{STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
          </>
        }
      />
      {payout && <p className="bc-meta -mt-3 mb-4">Showing payout <span className="bc-mono">{payout}</span> across all dates. <Link href={`/admin/finance/booking-com${qs(base)}`}>Clear →</Link></p>}

      {!result.ok ? <ErrorNotice title="Booking.com settlements could not be loaded.">{result.error}</ErrorNotice> : (
        <>
          <SettlementFigures summary={result.data.summary} payoutHref="#payouts" />

          {result.data.amendments.length > 0 && (
            <Section title="Amended by Booking.com" meta={`${result.data.amendments.length} awaiting review · not in any total`} id="amendments">
              <p className="bc-meta mt-2" style={{ fontSize: 12.5 }}>A later statement changed a line that was already imported. Both versions are kept. Accepting reverses the original&rsquo;s ledger postings (nothing is deleted) and posts the amended figures.</p>
              <div className="bc-table-wrap mt-2">
                <table className="bc-table">
                  <thead><tr><th scope="col">Booking number</th><th scope="col">Payout</th><th scope="col" className="num">Gross was → now</th><th scope="col" className="num">Commission was → now</th><th scope="col" className="num">Net was → now</th><th scope="col">Decision</th></tr></thead>
                  <tbody>
                    {result.data.amendments.map(({ amendment: a, original: o }) => (
                      <tr key={a.id}>
                        <td><span className="bc-ref">{a.booking_number}</span></td>
                        <td className="bc-mono" style={{ fontSize: 11.5 }}>{a.payout_id}</td>
                        <td className="num"><Money cents={o?.gross_cents} /> → <Money cents={a.gross_cents} /></td>
                        <td className="num"><Money cents={o?.commission_cents} /> → <Money cents={a.commission_cents} /></td>
                        <td className="num"><Money cents={o?.net_cents} /> → <Money cents={a.net_cents} /></td>
                        <td>{mayReview ? <AcceptAmendmentButton settlementId={a.id} /> : <span className="bc-meta">A reviewer decides.</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title="Payouts" meta={`${result.data.payouts.length} payout${result.data.payouts.length === 1 ? '' : 's'} · net is what Booking.com transferred`} id="payouts">
            {result.data.payouts.length === 0 ? <div className="pt-3"><EmptyState title="No payout in this selection." /></div> : <PayoutTable payouts={result.data.payouts} />}
            <p className="bc-meta mt-2" style={{ fontSize: 12 }}>A payout is one transfer covering several reservations. Its cash is recorded once, from the bank statement, and reconciled against the payout&rsquo;s net — never once per reservation.</p>
          </Section>

          <Section title="Reservation lines" meta={`${result.data.rows.length} in the selection`} id="lines">
            {result.data.rows.length === 0 ? (
              <div className="pt-3">
                <EmptyState title="No Booking.com statement line in this selection." />
                <p className="bc-meta mt-2">Import the Extranet finance statement under <Link href="/admin/finance/imports">Imports</Link>.</p>
              </div>
            ) : <SettlementTable rows={result.data.rows.slice(0, 500)} units={result.data.units} showLedger />}
            {result.data.rows.length > 500 && <p className="bc-meta mt-2">Showing 500 of {result.data.rows.length}; narrow the period or filter by payout.</p>}
          </Section>

          <Notice tone="neutral" title="Operational fact, not tax classification.">
            These are the amounts Booking.com states. They are posted to the ledger with the VAT treatment left for review: whether the amount is all accommodation, how a cancellation charge is taxed and how Booking.com&rsquo;s commission and payment fee are treated for input VAT are decided with the tax adviser, not here.
          </Notice>
        </>
      )}
    </>
  );
}
