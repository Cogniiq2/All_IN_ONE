import type { Metadata } from 'next';
import Link from 'next/link';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { loadAudit, loadQueues, loadRecentJobs, loadRecentOperations, loadRecentOutbox, loadSystemHealth } from '@/lib/admin/queries';
import { codeTitle, jobStatusPresentation, operationOutcomePresentation } from '@/lib/admin/presentation';
import { PageHeader, Section, HealthBadge, ErrorNotice, JobBadge, OperationBadge, When, Notice } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { RunPassButton } from '@/components/admin/system/run-pass-button';

export const metadata: Metadata = { title: 'System' };

const QUEUE_LABEL: Record<string, string> = {
  outbox: 'Automation outbox',
  payment_events: 'Payment inbox',
  reconciliation: 'Reconciliation jobs',
  external_operations: 'External operations',
};

/**
 * Operator-facing health. Each section says what was measured and what
 * was not; a subsystem nothing can measure is "Not instrumented", never
 * green. Configuration appears as states, never as values.
 */
export default async function SystemPage() {
  const [health, queues, jobs, outbox, operations, audit, operator] = await Promise.all([
    loadSystemHealth(),
    loadQueues(),
    loadRecentJobs(12),
    loadRecentOutbox(12),
    loadRecentOperations(12),
    loadAudit(20),
    currentOperator(),
  ]);
  const mayRun = can(operator?.role, 'run_reconciliation_pass');

  return (
    <>
      <PageHeader eyebrow="Operations" title="System" description="What is measured, what is configured, and what nothing measures yet." actions={<RefreshControl loadedAt={health.loadedAt} every={120} />} />

      {!health.ok ? (
        <ErrorNotice title="System health could not be loaded.">{health.error}</ErrorNotice>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {health.data.map((s) => (
            <article key={s.key} className="bc-panel" style={{ padding: '16px 18px' }} aria-labelledby={`sys-${s.key}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 id={`sys-${s.key}`} className="bc-h2">
                  {s.title}
                </h2>
                <HealthBadge status={s.status} />
              </div>
              <p className="bc-prose mt-2" style={{ fontSize: 13 }}>
                {s.summary}
              </p>
              {s.facts.length > 0 && (
                <dl className="mt-4 grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', fontSize: 12.5 }}>
                  {s.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="bc-label" style={{ letterSpacing: '0.1em' }}>
                        {f.label}
                      </dt>
                      <dd className="mt-1 bc-num" style={{ color: f.tone ? `hsl(var(--bc-${f.tone === 'muted' ? 'text-3' : f.tone}))` : undefined, fontWeight: f.tone === 'critical' || f.tone === 'caution' ? 600 : 500 }}>
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Reconciliation" id="reconcile">
          <div className="pt-3 grid gap-4">
            {mayRun ? <RunPassButton /> : <p className="bc-meta">A pass is run by operators; your role can read the result.</p>}
            {!jobs.ok ? (
              <ErrorNotice title="Jobs could not be loaded." tone="caution">
                {jobs.error}
              </ErrorNotice>
            ) : jobs.data.length === 0 ? (
              <Notice tone="neutral">No reconciliation job has been recorded.</Notice>
            ) : (
              <div className="bc-rows">
                {jobs.data.map((j) => (
                  <div key={j.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '10px 0' }}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span style={{ fontWeight: 500 }}>{codeTitle(j.reason)}</span>
                        <JobBadge status={j.status} />
                        {j.reference && (
                          <Link href={`/admin/bookings/${j.reference}`} className="bc-ref">
                            {j.reference}
                          </Link>
                        )}
                      </div>
                      <div className="bc-meta mt-0.5">
                        severity {j.severity} · {j.attempts} {j.attempts === 1 ? 'attempt' : 'attempts'} · {j.status === 'resolved' ? <>resolved <When value={j.resolvedAt} relative /></> : <>next <When value={j.nextAttemptAt} relative /></>}
                        {j.lastError ? ` · ${j.lastError}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title="Queues" id="queues">
          {!queues.ok ? (
            <div className="pt-3">
              <ErrorNotice title="Queue counts could not be loaded." tone="caution">
                {queues.error}
              </ErrorNotice>
            </div>
          ) : queues.data.length === 0 ? (
            <div className="pt-3">
              <Notice tone="neutral">Every queue is empty.</Notice>
            </div>
          ) : (
            <div className="bc-table-wrap mt-3">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th scope="col">Queue</th>
                    <th scope="col">State</th>
                    <th scope="col" className="num">
                      Items
                    </th>
                    <th scope="col">Oldest</th>
                  </tr>
                </thead>
                <tbody>
                  {queues.data
                    .slice()
                    .sort((a, b) => a.queue.localeCompare(b.queue) || a.state.localeCompare(b.state))
                    .map((q) => (
                      <tr key={`${q.queue}-${q.state}`}>
                        <td>{QUEUE_LABEL[q.queue] ?? q.queue}</td>
                        <td>{q.queue === 'external_operations' ? <OperationBadge outcome={q.state} /> : <JobBadge status={q.state} />}</td>
                        <td className="num">{q.items}</td>
                        <td className="dim">
                          <When value={q.oldest} relative />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Recent external operations" id="ops">
          {!operations.ok ? (
            <div className="pt-3">
              <ErrorNotice title="Operations could not be loaded." tone="caution">
                {operations.error}
              </ErrorNotice>
            </div>
          ) : operations.data.length === 0 ? (
            <div className="pt-3">
              <Notice tone="neutral">No external operation has been recorded.</Notice>
            </div>
          ) : (
            <div className="bc-rows">
              {operations.data.map((op) => (
                <div key={op.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '10px 0' }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ fontWeight: 500 }}>
                        {op.provider === 'paypal' ? 'PayPal' : 'Beds24'} · {op.operationType.replace(/_/g, ' ')}
                      </span>
                      <OperationBadge outcome={op.outcome} />
                      {op.reference && (
                        <Link href={`/admin/bookings/${op.reference}`} className="bc-ref">
                          {op.reference}
                        </Link>
                      )}
                    </div>
                    <div className="bc-meta mt-0.5">
                      <When value={op.startedAt} relative /> · {op.attempts} {op.attempts === 1 ? 'attempt' : 'attempts'}
                      {op.lastError ? ` · ${op.lastError}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent automation events" meta={<span>booking.confirmed is the only confirmation trigger</span>} id="outbox">
          {!outbox.ok ? (
            <div className="pt-3">
              <ErrorNotice title="Outbox could not be loaded." tone="caution">
                {outbox.error}
              </ErrorNotice>
            </div>
          ) : outbox.data.length === 0 ? (
            <div className="pt-3">
              <Notice tone="neutral">No automation event has been emitted.</Notice>
            </div>
          ) : (
            <div className="bc-rows">
              {outbox.data.map((ev) => (
                <div key={ev.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '10px 0' }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bc-mono" style={{ fontWeight: 500 }}>
                        {ev.eventType}
                      </span>
                      <JobBadge status={ev.status} />
                      {ev.reference && (
                        <Link href={`/admin/bookings/${ev.reference}`} className="bc-ref">
                          {ev.reference}
                        </Link>
                      )}
                    </div>
                    <div className="bc-meta mt-0.5">
                      <When value={ev.createdAt} relative /> · {ev.attempts} {ev.attempts === 1 ? 'attempt' : 'attempts'}
                      {ev.lastError ? ` · ${ev.lastError}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Operator activity" meta={<span>Append-only audit log</span>} id="audit">
        {!audit.ok ? (
          <div className="pt-3">
            <ErrorNotice title="The audit log could not be loaded." tone="caution">
              {audit.error}
            </ErrorNotice>
          </div>
        ) : audit.data.length === 0 ? (
          <div className="pt-3">
            <Notice tone="neutral">No operator action has been recorded yet.</Notice>
          </div>
        ) : (
          <div className="bc-rows">
            {audit.data.map((a) => (
              <div key={a.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', padding: '10px 0' }}>
                <div className="min-w-0 flex flex-wrap items-center gap-2">
                  <span className="bc-mono">{a.action}</span>
                  <span className="bc-badge ghost" data-tone={a.outcome === 'ok' || a.outcome === 'moved' ? 'positive' : a.outcome.startsWith('denied') || a.outcome === 'error' ? 'critical' : 'neutral'}>
                    {a.outcome}
                  </span>
                  {a.target_ref && (
                    <Link href={`/admin/bookings/${a.target_ref}`} className="bc-ref">
                      {a.target_ref}
                    </Link>
                  )}
                  <span className="bc-meta">{a.operator_email ?? '—'}</span>
                </div>
                <span className="bc-meta whitespace-nowrap">
                  <When value={a.created_at} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="bc-meta mt-10" style={{ fontSize: 12 }}>
        Not instrumented in this version: whether the reconciliation and inventory-sync schedules are firing (a pass leaves no heartbeat), channel-manager and payment-provider reachability (no live call is made from here), and automation-platform health beyond what the outbox shows.{' '}
        {jobStatusPresentation('pending').label && operationOutcomePresentation('in_flight').label ? '' : ''}
      </p>
    </>
  );
}
