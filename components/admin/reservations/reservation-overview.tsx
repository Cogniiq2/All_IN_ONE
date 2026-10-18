import type { ReservationSummary } from '@/lib/admin/reservation-summary';
import { compactUnitName, formatMoney } from '@/lib/admin/format';
import { sourcePresentation } from '@/lib/admin/presentation';

/**
 * The answer to the filter, before the rows: the sentence that says what is
 * being shown, five figures, and how it splits across the apartments.
 * Figures count booked stays only; a cancellation is counted as such and
 * never as value (see `summariseReservations`).
 */
export function ReservationOverview({ description, summary, total, shown, currency }: { description: string; summary: ReservationSummary; total: number; shown: number; currency: string }) {
  const figures: Array<{ label: string; value: string; note?: string }> = [
    { label: 'Bookings', value: String(summary.booked), note: summary.booked === 1 ? 'stay' : 'stays' },
    { label: 'Nights', value: String(summary.nights) },
    { label: 'Guests', value: String(summary.guests) },
    { label: 'Booked value', value: formatMoney(summary.valueCents, currency), note: summary.withoutAmount > 0 ? `gross · ${summary.withoutAmount} without an amount` : 'gross, before commission' },
    { label: 'Cancelled', value: String(summary.cancelled) },
  ];
  const maxNights = Math.max(1, ...summary.byUnit.map((u) => u.nights));

  return (
    <section className="bx-overview" aria-label="Summary">
      <p className="bx-sentence">
        <span className="bx-sentence-label">Showing</span>
        {description}
        {total > shown && <span className="bx-sentence-note"> The first {shown} of {total} are listed — narrow the selection to see the rest.</span>}
      </p>

      <div className="bx-figures">
        {figures.map((f, i) => (
          <div key={f.label} className="bx-figure" style={{ ['--i' as string]: i }}>
            <span className="bx-figure-label">{f.label}</span>
            <span className="bx-figure-value">{f.value}</span>
            {f.note && <span className="bx-figure-note">{f.note}</span>}
          </div>
        ))}
      </div>

      {(summary.byUnit.length > 1 || summary.bySource.length > 0) && (
        <div className="bx-split">
          {summary.byUnit.length > 1 && (
            <div className="bx-split-units">
              {summary.byUnit.map((u, i) => (
                <div key={u.slug} className="bx-split-unit">
                  <div className="bx-split-head">
                    <span className="bx-split-name">{compactUnitName(u.name)}</span>
                    <span className="bx-split-figures">
                      {u.stays} {u.stays === 1 ? 'stay' : 'stays'} · {u.nights} {u.nights === 1 ? 'night' : 'nights'} · {formatMoney(u.valueCents, currency)}
                    </span>
                  </div>
                  <div className="bx-bar" aria-hidden="true">
                    <span style={{ width: `${(u.nights / maxNights) * 100}%`, ['--i' as string]: i }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {summary.bySource.length > 0 && (
            <p className="bx-split-channels">
              {summary.bySource.map((c) => (
                <span key={c.source}>
                  {sourcePresentation(c.source).label} <strong>{c.stays}</strong>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
