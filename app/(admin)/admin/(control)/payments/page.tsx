import type { Metadata } from 'next';
import Link from 'next/link';
import { adminPosture } from '@/lib/admin/config';
import { loadPayments } from '@/lib/admin/queries';
import { PAGE_SIZE } from '@/lib/admin/filters';
import { formatMoney, formatStay } from '@/lib/admin/format';
import { isPaymentState } from '@/lib/admin/presentation';
import { isPaymentSettled } from '@/lib/booking/states';
import { PageHeader, ErrorNotice, EmptyState, BookingStateBadge, PaymentStateBadge, JobBadge, Badge, When, Notice, Section } from '@/components/admin/primitives';
import { RefreshControl } from '@/components/admin/shell/refresh-control';
import { Pagination } from '@/components/admin/bookings/pagination';
import { CopyButton } from '@/components/admin/copy-button';

export const metadata: Metadata = { title: 'Payments' };

/**
 * Operational payment view. PayPal is the money authority; this screen
 * shows the LOCAL record of each payment beside the booking it belongs to,
 * and makes "paid but not finalized" impossible to miss. No refund control:
 * a refund is a business decision made in the provider's own dashboard, and
 * arrives here as a verified event.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const posture = adminPosture();
  const q = (typeof searchParams.q === 'string' ? searchParams.q : '').trim().slice(0, 80);
  const pageRaw = Number.parseInt(typeof searchParams.page === 'string' ? searchParams.page : '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const result = await loadPayments(page, q || null);

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    return `/admin/payments${params.size ? `?${params}` : ''}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Payments"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Local payment records, beside the bookings they settle. PayPal remains the authority on money.</span>
            {posture.paypalMode === 'sandbox' && (
              <span className="bc-badge" data-tone="caution">
                <i className="bc-glyph" data-glyph="alert" aria-hidden="true" />
                Sandbox
              </span>
            )}
            {posture.paypalMode === 'unconfigured' && (
              <span className="bc-badge" data-tone="critical">
                <i className="bc-glyph" data-glyph="alert" aria-hidden="true" />
                Payment mode unconfigured
              </span>
            )}
          </span>
        }
        actions={<RefreshControl loadedAt={result.loadedAt} />}
      />

      <form action="/admin/payments" className="mb-5 flex flex-wrap items-center gap-2" role="search">
        <input type="search" name="q" defaultValue={q} className="bc-input" style={{ maxWidth: 380 }} placeholder="Reference, surname, order or capture id" aria-label="Search payments" />
        <button type="submit" className="bc-btn sm">
          Search
        </button>
        {q && (
          <Link href="/admin/payments" className="bc-btn quiet sm">
            Clear
          </Link>
        )}
      </form>

      {!result.ok ? (
        <ErrorNotice title="Payments could not be loaded.">{result.error}</ErrorNotice>
      ) : result.data.bookings.length === 0 ? (
        <div className="bc-panel">
          <EmptyState title={q ? 'No payments match.' : 'No payment activity yet.'}>{q ? 'Try the booking reference or the PayPal order id.' : 'A booking appears here once a payment order exists for it.'}</EmptyState>
        </div>
      ) : (
        <>
          <div className="hidden md:block bc-table-wrap">
            <table className="bc-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Guest · property</th>
                  <th scope="col">Stay</th>
                  <th scope="col" className="num">
                    Quoted
                  </th>
                  <th scope="col" className="num">
                    Captured
                  </th>
                  <th scope="col">Payment</th>
                  <th scope="col">Booking</th>
                  <th scope="col">Order</th>
                  <th scope="col">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {result.data.bookings.map((b) => {
                  const settled = isPaymentState(b.paymentStatus) && isPaymentSettled(b.paymentStatus);
                  const unfinalized = settled && b.status !== 'confirmed';
                  return (
                    <tr key={b.reference} data-href={`/admin/bookings/${b.reference}`} style={unfinalized ? { background: 'hsl(var(--bc-critical-soft) / 0.45)' } : undefined}>
                      <td className="bc-cover">
                        <Link href={`/admin/bookings/${b.reference}`} className="bc-ref">
                          {b.reference}
                        </Link>
                      </td>
                      <td>
                        <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guestLabel ?? '—'}</div>
                        <div className="bc-meta">{b.unitName}</div>
                      </td>
                      <td className="bc-num dim">{formatStay(b.checkIn, b.checkOut)}</td>
                      <td className="num">{formatMoney(b.quotedTotalCents, b.currency)}</td>
                      <td className="num" style={b.paidAmountCents !== null && b.paidAmountCents !== b.quotedTotalCents ? { color: 'hsl(var(--bc-critical))', fontWeight: 600 } : undefined}>
                        {formatMoney(b.paidAmountCents, b.currency)}
                      </td>
                      <td>
                        <PaymentStateBadge state={b.paymentStatus} />
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <BookingStateBadge state={b.status} />
                          {unfinalized && (
                            <span className="bc-label" style={{ color: 'hsl(var(--bc-critical))', letterSpacing: '0.08em' }}>
                              paid · not finalized
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="relative" style={{ zIndex: 1 }}>
                        {b.hasExternalBooking || b.paymentStatus !== 'not_created' ? <OrderCell reference={b.reference} /> : '—'}
                      </td>
                      <td className="dim">
                        <When value={b.paidAt} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden bc-cards">
            {result.data.bookings.map((b) => {
              const settled = isPaymentState(b.paymentStatus) && isPaymentSettled(b.paymentStatus);
              const unfinalized = settled && b.status !== 'confirmed';
              return (
                <Link key={b.reference} href={`/admin/bookings/${b.reference}`} className="bc-card" style={unfinalized ? { borderColor: 'hsl(var(--bc-critical) / 0.5)' } : undefined}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="bc-ref">{b.reference}</span>
                    <PaymentStateBadge state={b.paymentStatus} />
                  </div>
                  <div className="mt-2 truncate" style={{ fontWeight: 500 }}>
                    {b.guestLabel ?? '—'} · {b.unitName}
                  </div>
                  <div className="bc-meta mt-1">{formatStay(b.checkIn, b.checkOut)}</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <BookingStateBadge state={b.status} />
                    <span className="bc-num">
                      {formatMoney(b.paidAmountCents ?? b.quotedTotalCents, b.currency)}
                      {b.paidAmountCents === null && <span className="bc-meta"> quoted</span>}
                    </span>
                  </div>
                  {unfinalized && (
                    <p className="mt-2" style={{ fontSize: 12, color: 'hsl(var(--bc-critical))', fontWeight: 600 }}>
                      Paid — channel manager not finalized
                    </p>
                  )}
                </Link>
              );
            })}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data.total} hrefFor={hrefFor} />
        </>
      )}

      {result.ok && (
        <Section title="Recent webhook events" meta={<span>Verified events are the settlement evidence</span>} id="events">
          {result.data.events.length === 0 ? (
            <div className="pt-3">
              <Notice tone="neutral">No payment webhook has been received yet.</Notice>
            </div>
          ) : (
            <div className="bc-rows">
              {result.data.events.map((ev) => (
                <div key={ev.id} className="bc-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bc-mono" style={{ fontWeight: 500 }}>
                        {ev.eventType}
                      </span>
                      <Badge p={ev.verification === 'verified' ? { label: 'Verified', tone: 'positive', glyph: 'check', summary: 'Signature verified.' } : { label: `Verification ${ev.verification}`, tone: ev.verification === 'failed' ? 'critical' : 'neutral', glyph: 'alert', summary: 'Stored, not processed.' }} />
                      <JobBadge status={ev.status} />
                      {ev.reference && (
                        <Link href={`/admin/bookings/${ev.reference}`} className="bc-ref">
                          {ev.reference}
                        </Link>
                      )}
                    </div>
                    <div className="bc-meta mt-1 flex flex-wrap gap-x-3">
                      <span>
                        Received <When value={ev.receivedAt} />
                      </span>
                      {ev.amountCents !== null && <span className="bc-num">{formatMoney(ev.amountCents, ev.currency)}</span>}
                      {ev.orderId && <span className="bc-mono">order {ev.orderId}</span>}
                    </div>
                  </div>
                  <CopyButton value={ev.providerEventId} className="bc-mono">
                    {ev.providerEventId.slice(0, 12)}…
                  </CopyButton>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** The order id lives on the detail; the list says only that one exists. */
function OrderCell({ reference }: { reference: string }) {
  return (
    <Link href={`/admin/bookings/${reference}#payment`} className="bc-meta" style={{ color: 'hsl(var(--bc-text-2))' }}>
      On detail →
    </Link>
  );
}
