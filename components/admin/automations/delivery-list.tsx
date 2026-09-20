import Link from 'next/link';
import type { MessageDeliveryDto } from '@/lib/admin/dto';
import { Notice, When } from '@/components/admin/primitives';
import { RequeueDeliveryButton } from '@/components/admin/automations/requeue-buttons';

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'progress' },
  sent: { label: 'Sent', tone: 'positive' },
  failed: { label: 'Failed', tone: 'critical' },
  skipped: { label: 'Skipped', tone: 'muted' },
  suppressed: { label: 'Suppressed', tone: 'muted' },
};

export const KIND_LABEL: Record<string, string> = {
  booking_confirmation: 'Booking confirmation',
  prearrival: 'Pre-arrival',
  checkin: 'Check-in',
  checkout: 'Check-out',
  review_request: 'Review request',
};

export function DeliveryRow({ delivery, mayRequeue }: { delivery: MessageDeliveryDto; mayRequeue: boolean }) {
  const status = STATUS[delivery.status] ?? { label: delivery.status, tone: 'neutral' };
  const stuck = delivery.status === 'failed' && (!delivery.retryable || delivery.attempts >= delivery.maxAttempts);
  return (
    <div className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr)', padding: '12px 0' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="bc-badge" data-tone={status.tone}>
          {status.label}
        </span>
        <span style={{ fontWeight: 600 }}>{KIND_LABEL[delivery.kind] ?? delivery.kind}</span>
        <Link href={`/admin/bookings/${delivery.reference}`} className="bc-ref">
          {delivery.reference}
        </Link>
        <span className="bc-meta">
          {delivery.channel} · {delivery.locale.toUpperCase()} · to {delivery.destinationMasked ?? '—'}
          {delivery.templateId ? ` · ${delivery.templateId} v${delivery.templateVersion ?? '?'}` : ''}
        </span>
        <span className="bc-meta ml-auto whitespace-nowrap">
          <When value={delivery.sentAt ?? delivery.failedAt ?? delivery.updatedAt} relative />
        </span>
      </div>
      <div className="bc-meta mt-1">
        {delivery.attempts} of {delivery.maxAttempts} {delivery.attempts === 1 ? 'attempt' : 'attempts'}
        {delivery.provider ? ` · via ${delivery.provider}` : ''}
        {delivery.providerMessageId ? ` · ${delivery.providerMessageId}` : ''}
        {delivery.status === 'failed' && delivery.retryable && !stuck && delivery.nextAttemptAt ? (
          <>
            {' '}
            · next attempt <When value={delivery.nextAttemptAt} relative />
          </>
        ) : null}
        {delivery.lastError ? ` · ${delivery.lastError}` : ''}
      </div>
      {mayRequeue && stuck && (
        <div className="mt-2">
          <RequeueDeliveryButton id={delivery.id} />
        </div>
      )}
    </div>
  );
}

export function DeliveryGroup({ items, empty, mayRequeue }: { items: MessageDeliveryDto[]; empty: string; mayRequeue: boolean }) {
  if (items.length === 0) {
    return (
      <div className="pt-3">
        <Notice tone="neutral">{empty}</Notice>
      </div>
    );
  }
  return (
    <div className="bc-rows">
      {items.map((d) => (
        <DeliveryRow key={d.id} delivery={d} mayRequeue={mayRequeue} />
      ))}
    </div>
  );
}
