import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentOperator } from '@/lib/admin/auth';
import { can } from '@/lib/admin/permissions';
import { getBookingDetail } from '@/lib/admin/queries';
import { assessBooking } from '@/lib/admin/attention';
import { isBookingReference } from '@/lib/booking/reference';
import { formatIsoDate, formatMoney, formatStay, pluralNights, propertyTodayIso, weekdayShort } from '@/lib/admin/format';
import { bookingFacts, bookingStatePresentation, codeTitle, paymentStatePresentation, sourcePresentation } from '@/lib/admin/presentation';
import { relationOn } from '@/lib/admin/calendar';
import { BackLink, BookingStateBadge, Dash, KeyValue, PaymentStateBadge, ReconciliationBadge, Section, When, ErrorNotice, Notice } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { CopyButton } from '@/components/admin/copy-button';
import { AttentionRow } from '@/components/admin/attention/attention-list';
import { LifecycleTimeline } from '@/components/admin/booking/lifecycle-timeline';
import { TechnicalPanel } from '@/components/admin/booking/technical-panel';
import { ReconcileButton } from '@/components/admin/booking/reconcile-button';
import { CancelPanel, type CancelPanelMode } from '@/components/admin/booking/cancel-panel';
import { classifyCancellation } from '@/lib/booking/cancellation';
import type { BookingState, PaymentState } from '@/lib/booking/states';
import { operatorPaidCancellationEnabled } from '@/lib/booking/config';
import { loadDeliveriesForBooking, loadTurnoversForBooking } from '@/lib/admin/queries';
import { adminMode } from '@/lib/admin/config';
import { KIND_LABEL } from '@/components/admin/automations/delivery-list';

export async function generateMetadata({ params }: { params: { reference: string } }): Promise<Metadata> {
  return { title: isBookingReference(params.reference) ? params.reference : 'Booking' };
}

const FACT_LABEL = { true: 'Yes', false: 'No', unknown: 'Unknown' } as const;

function Fact({ label, value, yesTone = 'positive', noTone = 'neutral' }: { label: string; value: boolean | 'unknown'; yesTone?: string; noTone?: string }) {
  const tone = value === 'unknown' ? 'critical' : value ? yesTone : noTone;
  return (
    <div className="bc-metric" style={{ padding: '14px 16px 12px' }}>
      <p className="bc-label">{label}</p>
      <p className="mt-2 flex items-center gap-2" style={{ fontSize: 15, fontWeight: 600 }}>
        <i className="bc-glyph" data-glyph={value === 'unknown' ? 'question' : value ? 'check' : 'dash'} data-tone={tone} style={{ color: 'hsl(var(--tone))' }} aria-hidden="true" />
        {FACT_LABEL[String(value) as keyof typeof FACT_LABEL]}
      </p>
    </div>
  );
}

/**
 * The operational source of truth for one reservation: the state the core
 * holds, the facts derived from it, and the record of how it got there.
 */
export default async function BookingDetailPage({ params }: { params: { reference: string } }) {
  const reference = decodeURIComponent(params.reference).toUpperCase();
  if (!isBookingReference(reference)) notFound();

  const [result, operator, deliveries] = await Promise.all([getBookingDetail(reference), currentOperator(), loadDeliveriesForBooking(reference)]);
  if (!result.ok) {
    return (
      <>
        <BackLink href="/admin/bookings">Bookings</BackLink>
        <div className="mt-6">
          <ErrorNotice title="This booking could not be loaded.">{result.error}</ErrorNotice>
        </div>
      </>
    );
  }
  const b = result.data;
  if (!b) notFound();

  const today = propertyTodayIso();
  const state = bookingStatePresentation(b.status);
  const payment = paymentStatePresentation(b.paymentStatus);
  const facts = bookingFacts(b.status, b.paymentStatus);
  const attention = assessBooking(b);
  const relation = relationOn(b, today);
  // A preview viewer never sees the control at all: the write is refused
  // server-side regardless, and offering a button that cannot work is worse
  // than not offering one.
  const mayReconcile = can(operator?.role, 'reconcile_booking') && !operator?.preview;
  const guestName = b.guest ? `${b.guest.firstName} ${b.guest.lastName}`.trim() : null;
  const turnovers = await loadTurnoversForBooking(b.id);

  // Cancellation: which case this booking is, and whether THIS operator on
  // THIS deployment may start it. The server action re-derives all of it.
  const klass = classifyCancellation({ status: b.status as BookingState, paymentStatus: b.paymentStatus as PaymentState, paidAmountCents: b.payment.paidAmountCents, refundedAmountCents: b.payment.refundedAmountCents });
  const cancelMode: CancelPanelMode | null = klass.kind === 'paid' ? 'paid' : klass.kind === 'payment_evidence' ? 'evidence' : klass.kind === 'held_unpaid' || klass.kind === 'nothing_held' ? 'unpaid' : null;
  const paidPath = cancelMode === 'paid' || cancelMode === 'evidence';
  let cancelDisabled: string | null = null;
  if (operator?.preview) cancelDisabled = 'Preview data is read-only.';
  else if (adminMode() !== 'supabase') cancelDisabled = 'Development fixtures have no booking core behind them.';
  else if (!can(operator?.role, 'cancel_unpaid_booking')) cancelDisabled = 'Your role can read this booking; cancellation is done by operators.';
  else if (paidPath && !can(operator?.role, 'cancel_paid_booking')) cancelDisabled = 'This booking carries payment evidence. Cancelling it needs an administrator.';
  else if (paidPath && !operatorPaidCancellationEnabled()) cancelDisabled = 'This booking carries payment evidence. Cancelling paid bookings from Control is switched off on this deployment (OPERATOR_PAID_CANCELLATION_ENABLED).';

  return (
    <>
      <BackLink href="/admin/bookings">Bookings</BackLink>

      <header className="bc-page-head mt-4">
        <div className="min-w-0">
          <p className="bc-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <CopyButton value={b.reference} className="bc-ref" >
              <span style={{ letterSpacing: '0.02em', fontSize: 12, fontWeight: 600 }}>{b.reference}</span>
            </CopyButton>
            <span>·</span>
            <span>{sourcePresentation(b.source).label}</span>
            <span>·</span>
            <span>
              Created <When value={b.createdAt} />
            </span>
          </p>
          <h1 className="bc-h1 mt-2 truncate">{guestName ?? 'Guest details not collected'}</h1>
          <p style={{ marginTop: 6 }}>
            {b.unitName} · {formatStay(b.checkIn, b.checkOut)} · {pluralNights(b.nights)} · {b.adults} {b.adults === 1 ? 'adult' : 'adults'}
            {b.children > 0 ? `, ${b.children} ${b.children === 1 ? 'child' : 'children'}` : ''}
            {relation === 'arrival' && ' · arriving today'}
            {relation === 'departure' && ' · departing today'}
            {relation === 'in_house' && ' · in house'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStateBadge state={b.status} size="lg" />
            <PaymentStateBadge state={b.paymentStatus} size="lg" ghost />
            <ReconciliationBadge state={b.reconciliationState} />
          </div>
          <RefreshControl loadedAt={result.loadedAt} />
        </div>
      </header>

      {attention && (
        <div className="bc-panel mb-6" style={{ padding: '0 4px' }}>
          <AttentionRow item={attention} />
        </div>
      )}

      <div className="bc-metrics" style={{ ['--cols' as string]: 5 }}>
        <Fact label="Inventory held" value={facts.inventoryHeld} yesTone="progress" />
        <Fact label="Paid" value={facts.paid} />
        <Fact label="Money may be involved" value={facts.moneyMayBeInvolved} yesTone="caution" />
        <Fact label="Channel finalized" value={facts.externallyFinalized} />
        <div className="bc-metric" style={{ padding: '14px 16px 12px' }}>
          <p className="bc-label">Needs a person</p>
          <p className="mt-2 flex items-center gap-2" style={{ fontSize: 15, fontWeight: 600 }}>
            <i className="bc-glyph" data-glyph={facts.needsHuman ? 'alert' : 'check'} data-tone={facts.needsHuman ? 'critical' : 'positive'} style={{ color: 'hsl(var(--tone))' }} aria-hidden="true" />
            {facts.needsHuman ? 'Yes' : 'No'}
          </p>
        </div>
      </div>

      <div className="grid gap-x-10 lg:grid-cols-[minmax(0,7fr)_minmax(280px,4fr)]">
        <div className="min-w-0">
          <Section title="Lifecycle" meta={<span>{b.lifecycle.length} recorded transitions</span>} id="lifecycle">
            <div className="pt-3">
              <p className="bc-prose mb-4" style={{ fontSize: 13 }}>
                {state.summary}
              </p>
              <LifecycleTimeline events={b.lifecycle} currency={b.currency} />
            </div>
          </Section>

          <Section title="Reconciliation" id="reconciliation">
            <div className="grid gap-4 pt-3">
              <KeyValue
                rows={[
                  ['State', <ReconciliationBadge key="r" state={b.reconciliationState} />],
                  ['Open jobs', String(b.reconciliationJobs.filter((j) => j.status !== 'resolved' && j.status !== 'succeeded').length)],
                  b.failure.code ? ['Last failure', <span key="f">{codeTitle(b.failure.code)} <span className="bc-mono" style={{ color: 'hsl(var(--bc-text-3))' }}>{b.failure.code}</span></span>] : null,
                  b.failure.reason ? ['Reason', b.failure.reason] : null,
                  b.failure.at ? ['Failed at', <When key="a" value={b.failure.at} />] : null,
                  ['Channel verified', b.channel.verifiedAt ? <When key="v" value={b.channel.verifiedAt} /> : <Dash />],
                ]}
              />
              {mayReconcile ? (
                <ReconcileButton reference={b.reference} />
              ) : (
                <p className="bc-meta">
                  {operator?.preview
                    ? 'Preview data is read-only. Reconciliation runs against the live booking core, which this deployment cannot reach.'
                    : 'Your role can read this booking; reconciliation is run by operators.'}
                </p>
              )}
            </div>
          </Section>

          <Section title="Cancellation" meta={<span>intent, release and refund are three separate facts</span>} id="cancellation">
            <div className="grid gap-4 pt-3">
              {(b.cancellation.requestedAt || b.status === 'cancelled') && (
                <KeyValue
                  rows={[
                    b.cancellation.requestedAt ? ['Requested', <span key="rq"><When value={b.cancellation.requestedAt} />{b.cancellation.requestedBy ? ` by ${b.cancellation.requestedBy}` : ''}</span>] : null,
                    b.cancellation.reason ? ['Reason', b.cancellation.reason] : null,
                    b.cancellation.authorizedBy ? ['Authorised by', b.cancellation.authorizedBy] : null,
                    ['Completed', b.cancellation.completedAt ? <When key="cp" value={b.cancellation.completedAt} /> : <span key="ncp" className="bc-meta">Not yet — release pending</span>],
                    ['Refund', <span key="rs" className="bc-badge ghost" data-tone={b.cancellation.refundState === 'completed' || b.cancellation.refundState === 'not_required' || b.cancellation.refundState === 'none' ? 'positive' : b.cancellation.refundState === 'unknown' || b.cancellation.refundState === 'failed' ? 'critical' : 'caution'}>{b.cancellation.refundState.replace(/_/g, ' ')}</span>],
                    b.cancellation.refundRequiredCents !== null ? ['Refund decided', <span key="ra" className="bc-num">{formatMoney(b.cancellation.refundRequiredCents, b.payment.paidCurrency ?? b.currency)}</span>] : null,
                    b.cancellation.refundId ? ['Refund id', <CopyButton key="rid" value={b.cancellation.refundId} className="bc-mono" />] : null,
                    b.cancellation.refundLastError ? ['Refund error', b.cancellation.refundLastError] : null,
                  ]}
                />
              )}
              {cancelMode && b.status !== 'cancelled' && !b.cancellation.requestedAt ? (
                <CancelPanel reference={b.reference} mode={cancelMode} paidAmountCents={b.payment.paidAmountCents} currency={b.payment.paidCurrency ?? b.currency} allowed={!cancelDisabled} disabledReason={cancelDisabled} />
              ) : b.status === 'cancelled' ? (
                <p className="bc-meta">Cancelled. {b.cancellation.refundState === 'required' || b.cancellation.refundState === 'pending' ? 'A refund is decided and not yet completed: it runs where refund execution is enabled, or is done by hand at the provider, and the provider\'s refund webhook settles it here.' : ''}</p>
              ) : b.cancellation.requestedAt ? (
                <p className="bc-meta">Cancellation requested; the release is being verified. Reconcile now re-runs the release check.</p>
              ) : (
                <p className="bc-meta">
                  {klass.kind === 'in_progress' ? 'Mid-transition: cancellation waits for the lease to lapse or reconciliation.' : klass.kind === 'manual_review' ? 'Under manual review: resolve the review first.' : 'Nothing to cancel.'}
                </p>
              )}
            </div>
          </Section>

          <Section title="Guest messages" meta={<span>one send per kind; the ledger is the proof</span>} id="messages">
            <div className="pt-3">
              {!deliveries.ok ? (
                <ErrorNotice title="Deliveries could not be loaded." tone="caution">{deliveries.error}</ErrorNotice>
              ) : deliveries.data.length === 0 ? (
                <p className="bc-meta">No guest message has been prepared for this booking.</p>
              ) : (
                <div className="bc-rows" style={{ fontSize: 13 }}>
                  {deliveries.data.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2" style={{ padding: '7px 0' }}>
                      <span className="bc-badge ghost" data-tone={d.status === 'sent' ? 'positive' : d.status === 'failed' ? 'critical' : 'muted'}>{d.status}</span>
                      <span>{KIND_LABEL[d.kind] ?? d.kind}</span>
                      <span className="bc-meta">to {d.destinationMasked ?? '—'} · {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}{d.provider ? ` · via ${d.provider}` : ''}{d.lastError ? ` · ${d.lastError}` : ''}</span>
                      <span className="bc-meta ml-auto"><When value={d.sentAt ?? d.failedAt ?? d.updatedAt} relative /></span>
                    </div>
                  ))}
                </div>
              )}
              {turnovers.ok && turnovers.data.length > 0 && (
                <p className="bc-meta mt-3">
                  Turnover after departure: {turnovers.data.map((t) => `${t.status.replace('_', ' ')}${t.assignedTo ? ` (${t.assignedTo})` : ''}`).join(', ')}. <a href="/admin/cleaning" className="link-quiet">Cleaning board</a>
                </p>
              )}
            </div>
          </Section>

          <div className="bc-section">
            <TechnicalPanel booking={b} />
          </div>
        </div>

        <aside className="min-w-0">
          <Section title="Stay" id="stay">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Property', b.unitName],
                  ['Arrival', `${weekdayShort(b.checkIn)}, ${formatIsoDate(b.checkIn, 'long')}`],
                  ['Departure', `${weekdayShort(b.checkOut)}, ${formatIsoDate(b.checkOut, 'long')}`],
                  ['Nights', String(b.nights)],
                  ['Guests', `${b.adults} ${b.adults === 1 ? 'adult' : 'adults'}${b.children > 0 ? `, ${b.children} ${b.children === 1 ? 'child' : 'children'}` : ''}`],
                  ['Source', sourcePresentation(b.source).label],
                  b.holdExpiresAt ? ['Hold lease', <When key="h" value={b.holdExpiresAt} />] : null,
                  b.lockExpiresAt ? ['Lock lease', <When key="l" value={b.lockExpiresAt} />] : null,
                  b.confirmedAt ? ['Confirmed', <When key="c" value={b.confirmedAt} />] : null,
                  b.releasedAt ? ['Released', <When key="rl" value={b.releasedAt} />] : null,
                ]}
              />
            </div>
          </Section>

          <Section title="Guest" id="guest">
            <div className="pt-3">
              {b.guest ? (
                <KeyValue
                  rows={[
                    ['Name', guestName],
                    ['Email', <a key="e" href={`mailto:${b.guest.email}`} className="link-quiet" style={{ fontSize: 13, borderBottomColor: 'hsl(var(--bc-line-strong))' }}>{b.guest.email}</a>],
                    ['Phone', b.guest.phone ? <a key="p" href={`tel:${b.guest.phone.replace(/\s/g, '')}`} className="bc-num">{b.guest.phone}</a> : <Dash />],
                    ['Country', b.guest.country ?? <Dash />],
                    ['Language', b.guest.locale === 'en' ? 'English' : b.guest.locale === 'de' ? 'German' : <Dash />],
                  ]}
                />
              ) : (
                <p className="bc-meta">No guest details were collected for this attempt.</p>
              )}
              <p className="bc-meta mt-4" style={{ fontSize: 11.5 }}>
                Personal data. Shown here because reaching the guest is this screen’s job; not carried into lists, logs or events.
              </p>
            </div>
          </Section>

          <Section title="Payment" meta={<span>PayPal is the money authority</span>} id="payment">
            <div className="pt-3 grid gap-4">
              <p className="bc-prose" style={{ fontSize: 13 }}>
                {payment.summary}
              </p>
              <KeyValue
                rows={[
                  ['Local state', <PaymentStateBadge key="ps" state={b.paymentStatus} />],
                  ['Quoted', <span key="q" className="bc-num">{formatMoney(b.quotedTotalCents, b.currency)}</span>],
                  ['Captured', b.payment.paidAmountCents !== null ? <span key="pd" className="bc-num" style={{ color: b.payment.paidAmountCents !== b.quotedTotalCents ? 'hsl(var(--bc-critical))' : undefined }}>{formatMoney(b.payment.paidAmountCents, b.payment.paidCurrency ?? b.currency)}{b.payment.paidAmountCents !== b.quotedTotalCents ? ' — differs from quote' : ''}</span> : <Dash />],
                  b.payment.refundedAmountCents > 0 ? ['Refunded', <span key="rf" className="bc-num">{formatMoney(b.payment.refundedAmountCents, b.payment.paidCurrency ?? b.currency)}</span>] : null,
                  ['Provider', b.payment.provider === 'paypal' ? 'PayPal' : b.payment.provider ?? <Dash />],
                  ['Order', b.payment.orderId ? <CopyButton key="o" value={b.payment.orderId} className="bc-mono" /> : <Dash />],
                  ['Capture', b.payment.captureId ? <CopyButton key="c" value={b.payment.captureId} className="bc-mono" /> : <Dash />],
                  ['Paid at', b.payment.paidAt ? <When key="pa" value={b.payment.paidAt} /> : <Dash />],
                ]}
              />
              {b.quote.lines.length > 0 && (
                <div>
                  <p className="bc-label" style={{ marginBottom: 6 }}>
                    Quote lines
                  </p>
                  <div className="bc-rows" style={{ fontSize: 13 }}>
                    {b.quote.lines.map((l) => (
                      <div key={l.code} className="flex items-center justify-between gap-3" style={{ padding: '7px 0' }}>
                        <span className="truncate">
                          {l.label || l.code}
                          {!l.mandatory && <span className="bc-meta"> · payable on site</span>}
                        </span>
                        <span className="bc-num">{formatMoney(l.amountCents, b.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section title="Channel manager" meta={<span>Beds24</span>} id="channel">
            <div className="pt-3">
              <KeyValue
                rows={[
                  ['Booking id', b.channel.bookingId ? <CopyButton key="bid" value={b.channel.bookingId} className="bc-mono" /> : <Dash />],
                  ['Status', b.channel.status ? <span key="st" className="bc-mono">{b.channel.status}</span> : <Dash />],
                  ['Verified', b.channel.verifiedAt ? <When key="vf" value={b.channel.verifiedAt} /> : <span key="nv" className="bc-meta">Not verified</span>],
                  ['Property / room', b.channel.propertyId ? <span key="pr" className="bc-mono">{b.channel.propertyId} / {b.channel.roomId}</span> : <Dash />],
                ]}
              />
              {!b.channel.bookingId && facts.inventoryHeld === true && (
                <div className="mt-4">
                  <Notice tone="caution" icon="warn">
                    Reserving locally without a channel-manager booking id. Reconciliation searches the channel manager before anything is retried.
                  </Notice>
                </div>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
