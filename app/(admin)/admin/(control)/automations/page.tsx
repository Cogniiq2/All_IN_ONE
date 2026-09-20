import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadAutomationsBoard, loadIntegrationSignals, loadRecentOutbox } from '@/lib/admin/queries';
import { PageHeader, Section, ErrorNotice, Metric, Notice, JobBadge, When } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { DeliveryGroup } from '@/components/admin/automations/delivery-list';
import { RequeueOutboxButton } from '@/components/admin/automations/requeue-buttons';

export const metadata: Metadata = { title: 'Automations' };

/**
 * What the automation platform did with what the booking core emitted.
 *
 * Two ledgers: the outbox (events the core wants acted on) and the delivery
 * ledger (guest messages, one send per booking and kind). Nothing here
 * sends; the two operator controls put a failed row back in the pump's path.
 */
export default async function AutomationsPage() {
  const [board, outbox, signals, operator] = await Promise.all([loadAutomationsBoard(), loadRecentOutbox(40), loadIntegrationSignals(), currentOperator()]);
  const mayRequeue = can(operator?.role, 'requeue_automation') && !operator?.preview;

  return (
    <>
      <PageHeader eyebrow="Operations" title="Automations" description="Guest messages, automation events and what the platform last said. Delivered means a provider confirmed it; nothing else counts." actions={<RefreshControl loadedAt={board.loadedAt} every={60} />} />

      {!board.ok ? (
        <ErrorNotice title="The delivery ledger could not be loaded.">{board.error}</ErrorNotice>
      ) : (
        <>
          <div className="bc-metrics" style={{ ['--cols' as string]: 4 }}>
            <Metric label="Sent" value={board.data.counts.sent} />
            <Metric label="Failed, needs a person" value={board.data.counts.stuck} />
            <Metric label="Retrying" value={board.data.counts.retrying} />
            <Metric label="Waiting" value={board.data.counts.waiting} note={`${board.data.counts.suppressed} suppressed · ${board.data.counts.skipped} skipped`} />
          </div>

          <Section title="Failed deliveries" meta={<span>exhausted or non-retryable</span>} id="stuck">
            <DeliveryGroup items={board.data.stuck} empty="No delivery is stuck." mayRequeue={mayRequeue} />
          </Section>

          <div className="grid gap-x-10 lg:grid-cols-2">
            <Section title="Retrying" id="retrying">
              <DeliveryGroup items={board.data.retrying} empty="Nothing is inside a retry backoff." mayRequeue={false} />
            </Section>
            <Section title="Waiting" meta={<span>prepared, no outcome yet</span>} id="waiting">
              <DeliveryGroup items={board.data.waiting} empty="Nothing is waiting for a send outcome." mayRequeue={false} />
            </Section>
          </div>

          <Section title="Recent deliveries" id="recent">
            <DeliveryGroup items={board.data.recent} empty="No guest message has been recorded yet." mayRequeue={false} />
          </Section>
        </>
      )}

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Automation events" meta={<span>the outbox, newest first</span>} id="outbox">
          {!outbox.ok ? (
            <div className="pt-3">
              <ErrorNotice title="The outbox could not be loaded." tone="caution">{outbox.error}</ErrorNotice>
            </div>
          ) : outbox.data.length === 0 ? (
            <div className="pt-3">
              <Notice tone="neutral">No automation event has been emitted.</Notice>
            </div>
          ) : (
            <div className="bc-rows">
              {outbox.data.map((ev) => (
                <div key={ev.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr)', padding: '10px 0' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bc-mono" style={{ fontWeight: 500 }}>{ev.eventType}</span>
                    <JobBadge status={ev.status} />
                    {ev.reference && (
                      <Link href={`/admin/bookings/${ev.reference}`} className="bc-ref">{ev.reference}</Link>
                    )}
                    <span className="bc-meta ml-auto whitespace-nowrap"><When value={ev.createdAt} relative /></span>
                  </div>
                  <div className="bc-meta mt-0.5">
                    {ev.attempts} {ev.attempts === 1 ? 'attempt' : 'attempts'}
                    {ev.lastError ? ` · ${ev.lastError}` : ''}
                  </div>
                  {mayRequeue && ev.status === 'exhausted' && (
                    <div className="mt-2"><RequeueOutboxButton id={ev.id} /></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Last heard from" meta={<span>never observed is never green</span>} id="signals">
          {!signals.ok ? (
            <div className="pt-3">
              <ErrorNotice title="Integration signals could not be loaded." tone="caution">{signals.error}</ErrorNotice>
            </div>
          ) : (
            <div className="bc-table-wrap mt-3">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th scope="col">Signal</th>
                    <th scope="col">Observed</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.data.map((s) => (
                    <tr key={`${s.provider}:${s.signal}`}>
                      <td>{s.label}</td>
                      <td className={s.status === 'never' ? 'dim' : undefined}>{s.status === 'never' ? 'never observed' : <When value={s.observedAt} relative />}</td>
                      <td className="dim bc-mono" style={{ fontSize: 11.5 }}>{s.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {!mayRequeue && (
        <p className="bc-meta mt-6" style={{ fontSize: 12 }}>
          {operator?.preview ? 'Preview data is read-only.' : 'Your role can read the ledgers; requeueing is done by operators.'}
        </p>
      )}
    </>
  );
}
