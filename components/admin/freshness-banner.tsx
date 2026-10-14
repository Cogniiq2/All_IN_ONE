import type { BookingFreshness } from '@/lib/admin/freshness';
import { Notice } from '@/components/admin/primitives';

/**
 * One line at the top of every daily page: when the bookings were last
 * brought up to date. Quiet when they are current; a clear warning when
 * they are not, so old data never looks current.
 */
export function FreshnessBanner({ freshness, extra }: { freshness: BookingFreshness; extra?: string }) {
  if (freshness.warning) {
    return (
      <div className="mb-5">
        <Notice tone={freshness.state === 'failing' || freshness.state === 'unknown' ? 'critical' : 'caution'} icon="warn" title={freshness.headline}>
          {freshness.warning}
        </Notice>
      </div>
    );
  }
  return (
    <p className="bc-meta mb-5 flex flex-wrap items-center gap-2" style={{ fontSize: 12.5 }} role="status">
      <span className="bc-badge ghost" data-tone="positive">
        <i className="bc-glyph" data-glyph="check" aria-hidden="true" />
        {freshness.headline}
      </span>
      <span>New bookings, changes and cancellations arrive automatically from Booking.com and Airbnb.{extra ? ` ${extra}` : ''}</span>
    </p>
  );
}
