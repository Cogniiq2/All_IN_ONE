import type { BookingDetailDto } from '@/lib/admin/dto';
import { JobBadge, OperationBadge, When, Badge } from '@/components/admin/primitives';
import { codeTitle, jobStatusPresentation } from '@/lib/admin/presentation';
import { formatMoney } from '@/lib/admin/format';
import { CopyButton } from '@/components/admin/copy-button';

/**
 * External operations, payment events, outbox and reconciliation jobs for
 * one booking. Folded by default — an operator reads the lifecycle first —
 * and never raw JSON: every row is the fields that matter, with the last
 * error trimmed to a line.
 */
export function TechnicalPanel({ booking }: { booking: BookingDetailDto }) {
  const empty = booking.operations.length + booking.paymentEvents.length + booking.outbox.length + booking.reconciliationJobs.length === 0;
  return (
    <details className="bc-details bc-panel" style={{ padding: '4px 18px 6px' }}>
      <summary>
        Technical detail
        <span className="bc-meta" style={{ fontWeight: 400, marginLeft: 4 }}>
          — {booking.operations.length} external operations, {booking.paymentEvents.length} payment events, {booking.outbox.length} outbox events, {booking.reconciliationJobs.length} reconciliation jobs
        </span>
      </summary>
      <div className="grid gap-6 pb-4 pt-2">
        {empty && <p className="bc-meta">Nothing has been recorded beyond the lifecycle.</p>}

        {booking.operations.length > 0 && (
          <Block title="External operations">
            {booking.operations.map((op) => (
              <div key={op.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span style={{ fontWeight: 500 }}>
                      {op.provider === 'paypal' ? 'PayPal' : op.provider === 'beds24' ? 'Beds24' : op.provider} · {op.operationType.replace(/_/g, ' ')}
                    </span>
                    <OperationBadge outcome={op.outcome} />
                    <span className="bc-meta">
                      {op.attempts} {op.attempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                  </div>
                  <div className="bc-meta mt-1 flex flex-wrap gap-x-3">
                    <span>
                      Started <When value={op.startedAt} />
                    </span>
                    {op.completedAt && (
                      <span>
                        Completed <When value={op.completedAt} />
                      </span>
                    )}
                    {op.uncertainAt && (
                      <span style={{ color: 'hsl(var(--bc-critical))' }}>
                        Uncertain since <When value={op.uncertainAt} />
                      </span>
                    )}
                    {op.reconciledAt && (
                      <span>
                        Reconciled <When value={op.reconciledAt} />
                      </span>
                    )}
                  </div>
                  {op.lastError && <div className="bc-mono mt-1" style={{ color: 'hsl(var(--bc-text-2))' }}>{op.lastError}</div>}
                </div>
                {op.resourceId && <CopyButton value={op.resourceId} className="bc-mono" />}
              </div>
            ))}
          </Block>
        )}

        {booking.paymentEvents.length > 0 && (
          <Block title="Payment webhook events">
            {booking.paymentEvents.map((ev) => (
              <div key={ev.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bc-mono" style={{ fontWeight: 500 }}>
                      {ev.eventType}
                    </span>
                    <Badge p={ev.verification === 'verified' ? { label: 'Verified', tone: 'positive', glyph: 'check', summary: 'Signature verified against the registered webhook.' } : { label: `Verification ${ev.verification}`, tone: ev.verification === 'failed' ? 'critical' : 'neutral', glyph: 'alert', summary: 'This event was stored and not processed.' }} />
                    <JobBadge status={ev.status} />
                  </div>
                  <div className="bc-meta mt-1 flex flex-wrap gap-x-3">
                    <span>
                      Received <When value={ev.receivedAt} />
                    </span>
                    {ev.processedAt && (
                      <span>
                        Processed <When value={ev.processedAt} />
                      </span>
                    )}
                    {ev.amountCents !== null && <span className="bc-num">{formatMoney(ev.amountCents, ev.currency)}</span>}
                    <span>
                      {ev.attempts} {ev.attempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                  </div>
                  {ev.lastError && <div className="bc-mono mt-1" style={{ color: 'hsl(var(--bc-text-2))' }}>{ev.lastError}</div>}
                </div>
                <CopyButton value={ev.providerEventId} className="bc-mono">
                  {ev.providerEventId.slice(0, 14)}…
                </CopyButton>
              </div>
            ))}
          </Block>
        )}

        {booking.outbox.length > 0 && (
          <Block title="Automation outbox">
            {booking.outbox.map((ev) => (
              <div key={ev.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bc-mono" style={{ fontWeight: 500 }}>
                      {ev.eventType}
                    </span>
                    <JobBadge status={ev.status} />
                    <span className="bc-meta">
                      {ev.attempts} {ev.attempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                  </div>
                  <div className="bc-meta mt-1 flex flex-wrap gap-x-3">
                    <span>
                      Created <When value={ev.createdAt} />
                    </span>
                    {ev.processedAt ? (
                      <span>
                        Delivered <When value={ev.processedAt} />
                      </span>
                    ) : (
                      <span>
                        Next attempt <When value={ev.availableAt} relative />
                      </span>
                    )}
                  </div>
                  {ev.lastError && <div className="bc-mono mt-1" style={{ color: 'hsl(var(--bc-text-2))' }}>{ev.lastError}</div>}
                </div>
              </div>
            ))}
          </Block>
        )}

        {booking.reconciliationJobs.length > 0 && (
          <Block title="Reconciliation jobs">
            {booking.reconciliationJobs.map((job) => (
              <div key={job.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span style={{ fontWeight: 500 }}>{codeTitle(job.reason)}</span>
                    <JobBadge status={job.status} />
                    <span className="bc-meta">severity {job.severity}</span>
                    <span className="bc-meta">
                      {job.attempts} {job.attempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                  </div>
                  <div className="bc-meta mt-1 flex flex-wrap gap-x-3">
                    <span>
                      Opened <When value={job.createdAt} />
                    </span>
                    {job.resolvedAt ? (
                      <span>
                        Resolved <When value={job.resolvedAt} /> {job.resolution ? `(${job.resolution})` : ''}
                      </span>
                    ) : (
                      <span>
                        Next attempt <When value={job.nextAttemptAt} relative />
                      </span>
                    )}
                  </div>
                  {job.lastError && <div className="bc-mono mt-1" style={{ color: 'hsl(var(--bc-text-2))' }}>{job.lastError}</div>}
                </div>
                <span className="bc-mono" style={{ color: 'hsl(var(--bc-text-3))' }}>
                  {job.reason}
                </span>
              </div>
            ))}
          </Block>
        )}
      </div>
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="bc-label" style={{ marginBottom: 4 }}>
        {title}
      </p>
      <div className="bc-rows">{children}</div>
    </section>
  );
}

export { jobStatusPresentation };
