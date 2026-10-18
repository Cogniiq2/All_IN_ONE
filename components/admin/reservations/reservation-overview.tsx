import type { ReactNode } from 'react';
import type { ReservationSummary } from '@/lib/admin/reservation-summary';
import { compactUnitName, formatMoney } from '@/lib/admin/format';
import { sourcePresentation } from '@/lib/admin/presentation';
import { CountUp } from '@/components/admin/reservations/count-up';

/**
 * The answer to the filter, before the rows: the sentence that says what is
 * being shown, five figures, and how it splits across apartments and
 * channels. Figures count booked stays only; a cancellation is counted as
 * such and never as value (see `summariseReservations`).
 */
export function ReservationOverview({ description, summary, total, shown, currency }: { description: string; summary: ReservationSummary; total: number; shown: number; currency: string }) {
  const figures: Array<{ id: string; label: string; value: ReactNode; note?: string }> = [
    { id: 'bookings', label: 'Bookings', value: <CountUp id="bookings" value={summary.booked} />, note: summary.booked === 1 ? 'stay' : 'stays' },
    { id: 'nights', label: 'Nights', value: <CountUp id="nights" value={summary.nights} />, note: summary.booked > 0 ? `${(summary.nights / summary.booked).toFixed(1).replace('.', ',')} per stay` : undefined },
    { id: 'guests', label: 'Guests', value: <CountUp id="guests" value={summary.guests} /> },
    {
      id: 'value',
      label: 'Booked value',
      value: <CountUp id="value" value={summary.valueCents} kind="money" currency={currency} />,
      note: summary.withoutAmount > 0 ? `gross · ${summary.withoutAmount} without an amount` : 'gross, before commission',
    },
    { id: 'cancelled', label: 'Cancelled', value: <CountUp id="cancelled" value={summary.cancelled} /> },
  ];
  const totalNights = Math.max(1, summary.byUnit.reduce((n, u) => n + u.nights, 0));
  const totalStays = Math.max(1, summary.bySource.reduce((n, c) => n + c.stays, 0));

  return (
    <section className="bx-overview" aria-label="Summary">
      <p className="bx-sentence">
        {description}
        {total > shown && <span className="bx-sentence-note"> The first {shown} of {total} are listed — narrow the selection to see the rest.</span>}
      </p>

      <dl className="bx-figures">
        {figures.map((f, i) => (
          <div key={f.id} className="bx-figure" style={{ ['--i' as string]: i }}>
            <dt className="bx-figure-label">{f.label}</dt>
            <dd className="bx-figure-value">{f.value}</dd>
            {f.note && <dd className="bx-figure-note">{f.note}</dd>}
          </div>
        ))}
      </dl>

      {(summary.byUnit.length > 1 || summary.bySource.length > 1) && (
        <div className="bx-split">
          {summary.byUnit.length > 1 && (
            <div className="bx-split-block">
              <p className="bx-split-title">Nights by apartment</p>
              {summary.byUnit.map((u, i) => (
                <div key={u.slug} className="bx-split-row">
                  <span className="bx-split-name">{compactUnitName(u.name)}</span>
                  <span className="bx-bar" aria-hidden="true">
                    <span style={{ width: `${(u.nights / totalNights) * 100}%`, ['--i' as string]: i }} />
                  </span>
                  <span className="bx-split-figures">
                    {u.nights} · {formatMoney(u.valueCents, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {summary.bySource.length > 1 && (
            <div className="bx-split-block">
              <p className="bx-split-title">Stays by channel</p>
              {summary.bySource.map((c, i) => (
                <div key={c.source} className="bx-split-row">
                  <span className="bx-split-name">{sourcePresentation(c.source).label}</span>
                  <span className="bx-bar" data-tone="channel" aria-hidden="true">
                    <span style={{ width: `${(c.stays / totalStays) * 100}%`, ['--i' as string]: i + 2 }} />
                  </span>
                  <span className="bx-split-figures">{c.stays}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
