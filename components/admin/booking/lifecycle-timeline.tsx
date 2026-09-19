import type { LifecycleEventDto } from '@/lib/admin/dto';
import { bookingStatePresentation, codeTitle } from '@/lib/admin/presentation';
import { formatMoney } from '@/lib/admin/format';
import { When } from '@/components/admin/primitives';

/** Reasons the domain writes, made readable. Unknown reasons are shown verbatim. */
const REASON_TEXT: Record<string, string> = {
  intent_created: 'Booking attempt created',
  quote_attached: 'Live offer attached',
  lock_acquired: 'Local date range locked',
  lock_lease_expired: 'Lock lease expired',
  hold_created: 'Hold created at the channel manager',
  hold_reconciled: 'Hold found at the channel manager and adopted',
  order_created: 'Payment order created',
  guest_at_provider: 'Guest at the payment provider',
  payment_captured: 'Verified payment capture recorded',
  payment_state_reconciled: 'Payment state read back from the provider',
  finalize_started: 'Finalization at the channel manager started',
  finalize_verified: 'Channel-manager booking read back and verified',
  lease_expired: 'Hold lease expired without payment',
  reconcile_release: 'Release re-run by reconciliation',
  release_verified: 'Release verified at the channel manager',
  guest_cancelled: 'Guest abandoned the payment',
  guest_abandoned: 'Guest abandoned the attempt',
  capture_denied: 'Payment capture denied by the provider',
  quote_aged_out: 'Offer aged out',
};

function reasonText(reason: string | null): string | null {
  if (!reason) return null;
  if (REASON_TEXT[reason]) return REASON_TEXT[reason];
  const asCode = codeTitle(reason);
  if (asCode && asCode !== reason) return asCode;
  if (reason.startsWith('manual:')) return reason;
  return reason.replace(/_/g, ' ');
}

const DETAIL_LABEL: Record<string, string> = {
  beds24_booking_id: 'Channel booking',
  beds24_status: 'Channel status',
  payment_order_id: 'Order',
  payment_capture_id: 'Capture',
  payment_status: 'Payment',
  paid_amount_cents: 'Amount',
  last_failure_code: 'Code',
  last_failure_reason: 'Reason',
  reconciliation_state: 'Reconciliation',
  hold_expires_at: 'Hold until',
  lock_expires_at: 'Lock until',
};

/**
 * The audit trail, in order, as it happened. Every row is a transition the
 * database recorded in the same transaction as the change — nothing here is
 * inferred, and a booking with three rows shows three rows.
 */
export function LifecycleTimeline({ events, currency }: { events: LifecycleEventDto[]; currency: string }) {
  if (events.length === 0) {
    return <p className="bc-meta">No transitions have been recorded for this booking.</p>;
  }
  return (
    <ol className="bc-timeline" aria-label="Booking lifecycle">
      {events.map((e) => {
        const to = bookingStatePresentation(e.toStatus);
        const isManual = e.reason?.startsWith('manual:');
        const details = e.detail
          ? Object.entries(e.detail).filter(([k]) => DETAIL_LABEL[k]).map(([k, v]) => [DETAIL_LABEL[k], k === 'paid_amount_cents' && typeof v === 'number' ? formatMoney(v, currency) : String(v)] as const)
          : [];
        return (
          <li key={e.id} className="bc-tl-item" data-tone={to.tone}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: 13.5 }}>
                {e.fromStatus && (
                  <>
                    <span style={{ color: 'hsl(var(--bc-text-3))', fontWeight: 500 }}>{bookingStatePresentation(e.fromStatus).label}</span>
                    <span aria-hidden="true" style={{ color: 'hsl(var(--bc-text-3))' }}>
                      →
                    </span>
                  </>
                )}
                <span>{to.label}</span>
              </span>
              <span className="bc-meta ml-auto whitespace-nowrap">
                <When value={e.at} />
              </span>
            </div>
            {e.reason && (
              <p style={{ fontSize: 13, color: isManual ? 'hsl(var(--bc-accent))' : 'hsl(var(--bc-text-2))' }}>
                {isManual && (
                  <span className="bc-label" style={{ marginRight: 8, letterSpacing: '0.1em', color: 'inherit' }}>
                    Operator
                  </span>
                )}
                {reasonText(e.reason)}
              </p>
            )}
            {details.length > 0 && (
              <p className="bc-meta" style={{ fontSize: 12 }}>
                {details.map(([k, v], i) => (
                  <span key={k}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    {k}: <span className="bc-num">{v}</span>
                  </span>
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
