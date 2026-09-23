import Link from 'next/link';
import type { PayoutGroup, PreviewLine, SettlementRow, SettlementSummary } from '@/lib/finance/settlements';
import { reconState } from '@/lib/finance/settlements';
import type { StagedOtaSettlement } from '@/lib/finance/import/adapters';
import type { UnitLookup } from '@/lib/finance/queries';
import { unitNamer } from '@/lib/finance/queries';
import { Money, PlainFigure, StateBadge, DateCell } from '@/components/admin/finance/primitives';
import { formatIsoDate } from '@/lib/admin/format';

/**
 * Booking.com settlement views. Server components; no guest data exists in
 * anything they receive — a line is identified by its Booking.com number.
 */

function pct(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(2)} %`;
}

/** The six headline figures plus the reconciliation counts, for any set of current lines. */
export function SettlementFigures({ summary, provenance = 'imported', payoutHref }: { summary: SettlementSummary; provenance?: string; payoutHref?: string }) {
  return (
    <>
      <div className="bc-figures" style={{ ['--cols' as string]: 3 }}>
        <PlainFigure label="Statement gross" cents={summary.grossCents} provenance={provenance} note={`${summary.lines} reservation line${summary.lines === 1 ? '' : 's'}`} />
        <PlainFigure label="Booking.com commission" cents={summary.commissionCents} provenance={provenance} note="a cost, deducted from the payout" />
        <PlainFigure label="Payment service fee" cents={summary.paymentServiceFeeCents} provenance={provenance} note="a cost, deducted from the payout" />
        <PlainFigure label="Total fees" cents={summary.totalFeesCents} provenance="calculated" note="commission + payment service fee" />
        <PlainFigure label="Net payout" cents={summary.netCents} provenance={provenance} note={`${summary.payouts} payout${summary.payouts === 1 ? '' : 's'}`} href={payoutHref} />
        <PlainFigure label="Effective total fee" value={pct(summary.effectiveFeeRatio)} provenance="calculated" note="(commission + fee) ÷ gross" />
      </div>
      <dl className="bc-meta mt-1 mb-4 flex flex-wrap gap-x-5 gap-y-1" style={{ fontSize: 12.5 }}>
        <div><dt className="inline">Matched </dt><dd className="inline bc-num">{summary.matched}</dd></div>
        <div><dt className="inline">Unmatched </dt><dd className="inline bc-num">{summary.unmatched}</dd></div>
        <div><dt className="inline">Ambiguous </dt><dd className="inline bc-num">{summary.ambiguous}</dd></div>
        <div><dt className="inline">Gross differs </dt><dd className="inline bc-num">{summary.discrepancies}</dd></div>
        {summary.noLocalGross > 0 && <div><dt className="inline">No local amount </dt><dd className="inline bc-num">{summary.noLocalGross}</dd></div>}
        {summary.grossDeltaCents !== 0 && <div><dt className="inline">Σ gross delta (statement − local) </dt><dd className="inline"><Money cents={summary.grossDeltaCents} signed /></dd></div>}
      </dl>
    </>
  );
}

/** Staged rows, before commit: what the commit will record and how each line will match. */
export function SettlementPreviewTable({ lines, units }: { lines: Array<PreviewLine<StagedOtaSettlement> & { rowNo: number }>; units: UnitLookup }) {
  const unitName = unitNamer(units);
  return (
    <div className="bc-table-wrap mt-2">
      <table className="bc-table">
        <thead><tr><th scope="col">#</th><th scope="col">Booking number</th><th scope="col">Stay</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">PSP fee</th><th scope="col" className="num">Net</th><th scope="col">Payout</th><th scope="col">Local reservation</th></tr></thead>
        <tbody>
          {lines.map((p) => (
            <tr key={p.rowNo}>
              <td className="dim">{p.rowNo}</td>
              <td><span className="bc-ref">{p.line.bookingNumber}</span><div className="bc-meta">{p.line.reservationStatus}{p.line.paymentStatus ? ` · ${p.line.paymentStatus}` : ''}</div></td>
              <td className="whitespace-nowrap"><DateCell iso={p.line.checkIn} /> – <DateCell iso={p.line.checkOut} /></td>
              <td className="num"><Money cents={p.line.grossCents} /></td>
              <td className="num"><Money cents={-p.line.commissionCents} /></td>
              <td className="num"><Money cents={-p.line.paymentServiceFeeCents} /></td>
              <td className="num" style={{ fontWeight: 600 }}><Money cents={p.line.netCents} /></td>
              <td><span className="bc-mono" style={{ fontSize: 11.5 }}>{p.line.payoutId}</span><div className="bc-meta">{formatIsoDate(p.line.payoutDate, 'long')}</div></td>
              <td>
                <StateBadge table="settlement" value={p.state} ghost />
                <div className="bc-meta">
                  {p.match.state === 'matched' ? unitName(p.match.reservation!.unit_id) : p.match.state === 'ambiguous' ? `${p.match.candidates} candidates — none chosen` : 'not found by number'}
                  {p.gross.deltaCents !== null && p.gross.deltaCents !== 0 && <div>Δ <Money cents={p.gross.deltaCents} signed /></div>}
                  {p.gross.localGrossCents !== null && <div>local <Money cents={p.gross.localGrossCents} /></div>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Persisted lines. Costs shown as negatives, the way they reduce the payout. */
export function SettlementTable({ rows, units, showLedger }: { rows: SettlementRow[]; units: UnitLookup; showLedger?: boolean }) {
  const unitName = unitNamer(units);
  return (
    <div className="bc-table-wrap mt-2">
      <table className="bc-table">
        <thead><tr><th scope="col">Booking number</th><th scope="col">Unit</th><th scope="col">Stay</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">PSP fee</th><th scope="col" className="num">Net</th><th scope="col">Payout</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className="bc-ref">{r.booking_number}</span><div className="bc-meta">{r.reservation_status}{r.payment_status ? ` · ${r.payment_status}` : ''}</div></td>
              <td className="dim">{r.match_state === 'matched' ? unitName(r.unit_id) : '—'}</td>
              <td className="whitespace-nowrap"><DateCell iso={r.check_in} /> – <DateCell iso={r.check_out} /></td>
              <td className="num"><Money cents={r.gross_cents} /></td>
              <td className="num"><Money cents={-r.commission_cents} /></td>
              <td className="num"><Money cents={-r.payment_service_fee_cents} /></td>
              <td className="num" style={{ fontWeight: 600 }}><Money cents={r.net_cents} /></td>
              <td><Link href={`/admin/finance/booking-com?payout=${encodeURIComponent(r.payout_id)}#lines`} className="bc-mono link-quiet" style={{ fontSize: 11.5 }}>{r.payout_id}</Link><div className="bc-meta">{formatIsoDate(r.payout_date, 'long')}</div></td>
              <td>
                <StateBadge table="settlement" value={r.amendment_state === 'conflict' ? 'amendment' : reconState(r.match_state, r.gross_state)} ghost />
                <div className="bc-meta">
                  {r.match_state === 'ambiguous' && `${r.match_candidates} candidates`}
                  {r.gross_delta_cents !== null && r.gross_delta_cents !== 0 && <><div>Δ <Money cents={r.gross_delta_cents} signed /></div><div>local <Money cents={r.local_gross_cents} /></div></>}
                  {showLedger && r.revenue_transaction_id && <> <Link href={`/admin/finance/transactions/${r.revenue_transaction_id}`} className="bc-ref">ledger →</Link></>}
                  {showLedger && r.ledger_state === 'legacy_posted' && ' already in the ledger via the retired adapter'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Payouts as groups: one row per payout ID, never one per reservation. */
export function PayoutTable({ payouts }: { payouts: Array<PayoutGroup & { bankState?: string }> }) {
  return (
    <div className="bc-table-wrap mt-2">
      <table className="bc-table">
        <thead><tr><th scope="col">Payout</th><th scope="col">Date</th><th scope="col" className="num">Lines</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">PSP fee</th><th scope="col" className="num">Net payout</th><th scope="col">Reconciliation</th></tr></thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.payoutId}>
              <td><Link href={`/admin/finance/booking-com?payout=${encodeURIComponent(p.payoutId)}#lines`} className="bc-mono link-quiet" style={{ fontSize: 12 }}>{p.payoutId}</Link></td>
              <td className="whitespace-nowrap"><DateCell iso={p.payoutDate} />{p.dateConflict && <div className="bc-meta" style={{ color: 'hsl(var(--bc-critical))' }}>lines disagree on the date</div>}</td>
              <td className="num">{p.lines}</td>
              <td className="num"><Money cents={p.grossCents} /></td>
              <td className="num"><Money cents={-p.commissionCents} /></td>
              <td className="num"><Money cents={-p.paymentServiceFeeCents} /></td>
              <td className="num" style={{ fontWeight: 600 }}><Money cents={p.netCents} /></td>
              <td>
                <span className="inline-flex flex-wrap gap-1">
                  <span className="bc-badge ghost" data-tone={p.state === 'reconciled' ? 'positive' : 'caution'}>{p.state === 'reconciled' ? 'All lines reconciled' : `${p.unmatched + p.ambiguous + p.discrepancies} need attention`}</span>
                  {p.bankState && <StateBadge table="payoutbank" value={p.bankState} ghost />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
