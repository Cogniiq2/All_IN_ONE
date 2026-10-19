import type { Metadata } from 'next';
import Link from 'next/link';
import { loadVat, loadVatReturn } from '@/lib/finance/queries';
import { one, type Params } from '@/lib/finance/params';
import { periodLabel } from '@/lib/finance/periods';
import { formatIsoDate } from '@/lib/admin/format';
import { PageHeader, Section, ErrorNotice, Notice, When } from '@/components/admin/primitives';
import { Money, StateBadge } from '@/components/admin/finance/primitives';
import { RunTaxEstimatesButton } from '@/components/admin/finance/controls';
import { QuestionList, StayTaxList, VatBoxes, VatReturnHero } from '@/components/admin/finance/stay-tax-view';

export const metadata: Metadata = { title: 'VAT return' };

/**
 * The Umsatzsteuer-Voranmeldung, stay by stay.
 *
 * The answer first (what to pay, and whether that is final), then the boxes
 * to type into ELSTER, then the questions that hold the return, then every
 * stay — each opens to show its full calculation with the law and the
 * source of every number. Nothing is filed from here.
 */
export default async function VatPage({ searchParams }: { searchParams: Params }) {
  const key = one(searchParams, 'period', 10);
  const period = key && /^\d{4}(-Q[1-4]|-\d{2})?$/.test(key) ? key : null;
  const [result, ledger] = await Promise.all([loadVatReturn(period), loadVat(period)]);
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Money · Tax" title="VAT return" />
        <ErrorNotice title="The VAT return could not be calculated.">{result.error}</ErrorNotice>
      </>
    );
  }
  const v = result.data;
  const r = v.vatReturn;
  const stages = ledger.ok ? ledger.data.stages : [];
  const taxPeriod = ledger.ok ? ledger.data.taxPeriod : null;
  const src = v.sources;

  return (
    <>
      <PageHeader
        eyebrow="Money · Tax"
        title="VAT return"
        description="What BoLaGio owes the Finanzamt for each period, calculated stay by stay. Open any stay to see every step, the law behind it and where each number came from."
      />

      <nav className="fx-periods" aria-label="VAT period">
        {v.keys.slice(0, 10).map((k) => (
          <Link key={k} href={`/admin/finance/vat?period=${k}`} aria-current={k === v.periodKey ? 'true' : undefined} replace scroll={false}>
            {periodLabel(k)}
          </Link>
        ))}
      </nav>

      <VatReturnHero vatReturn={r} label={v.label} dueOn={v.deadline?.dueOn ?? null} />

      {src.statementsWaiting.length > 0 && (
        <div className="fx-callout" data-tone="caution">
          <div>
            <strong>
              {src.statementsWaiting.length} Booking.com {src.statementsWaiting.length === 1 ? 'statement was' : 'statements were'} checked but never imported
            </strong>
            <p>Importing writes the exact commission, fee and payout of every stay they cover into the books. Open one and press “Import valid rows”.</p>
          </div>
          <div className="fx-callout-actions">
            {src.statementsWaiting.slice(0, 3).map((b) => (
              <Link key={b.id} href={`/admin/finance/imports/${b.id}`} className="bc-btn sm">
                {b.filename.length > 28 ? `${b.filename.slice(0, 26)}…` : b.filename} · {b.validRows} rows
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="fx-layout">
        <div className="min-w-0">
          <Section title="The form" meta={<span>Umsatzsteuer-Voranmeldung · {v.label}</span>} id="form">
            <VatBoxes vatReturn={r} />
          </Section>

          {r.questions.length > 0 && (
            <Section title="Needs an answer" meta={<span>until then the figure above is provisional</span>} id="questions">
              <QuestionList questions={r.questions} />
            </Section>
          )}

          <Section title="Every stay in this return" meta={<span>{r.stays.length} · tap one to see the calculation</span>} id="stays">
            <StayTaxList stays={r.stays} />
          </Section>
        </div>

        <aside className="fx-side">
          <section className="fx-card" aria-labelledby="fx-sources">
            <h2 id="fx-sources">Where the numbers come from</h2>
            <ul className="fx-sources">
              <li data-state="ok">
                <strong>Stays and prices</strong>
                <span>Beds24, automatic · {src.stays} in this period</span>
              </li>
              <li data-state={src.commissionUnknown === 0 ? 'ok' : 'partial'}>
                <strong>Booking.com commission</strong>
                <span>
                  {src.fromStatement} from statements · {src.commissionFromBeds24} from Beds24
                  {src.commissionUnknown > 0 ? ` · ${src.commissionUnknown} not known yet` : ''}
                </span>
              </li>
              <li data-state={src.fromStatement > 0 ? 'ok' : 'manual'}>
                <strong>Payouts</strong>
                <span>Booking.com statement upload · {src.fromStatement > 0 ? `${src.fromStatement} stays confirmed` : 'none imported yet'}</span>
              </li>
              <li data-state="manual">
                <strong>Purchases (box 66)</strong>
                <span>From the books: expenses with their invoices</span>
              </li>
            </ul>
            {src.unmatchedSettlements > 0 && (
              <p className="fx-note">
                {src.unmatchedSettlements} statement {src.unmatchedSettlements === 1 ? 'line matches' : 'lines match'} no reservation — check them on the Booking.com page.
              </p>
            )}
            <Link href="/admin/finance/imports" className="fx-link">
              Upload a statement →
            </Link>
          </section>

          <section className="fx-card" aria-labelledby="fx-settings">
            <h2 id="fx-settings">Rules this return uses</h2>
            <dl className="fx-settings">
              <div>
                <dt>Filing</dt>
                <dd>
                  {v.frequency === 'monthly' ? 'Monthly' : v.frequency === 'quarterly' ? 'Quarterly' : 'Annual only'}
                  <small>confirm with the Finanzamt</small>
                </dd>
              </div>
              <div>
                <dt>Taxation</dt>
                <dd>
                  On agreed amounts (Soll), VAT in the month the stay ends
                  <small>§ 13 Abs. 1 Nr. 1 a UStG</small>
                </dd>
              </div>
              <div>
                <dt>Prepaid bookings</dt>
                <dd>
                  VAT counted when the stay ends
                  <small>adviser to confirm: when Booking.com collects the price before the stay, VAT may be due on receipt (Mindest-Ist, § 13 Abs. 1 Nr. 1 a S. 4 UStG)</small>
                </dd>
              </div>
              <div>
                <dt>Booking.com payment fee</dt>
                <dd>
                  {v.policy.paymentFee === 'reverse_charge' ? 'Reverse charge, like the commission' : 'Exempt payment service'}
                  <small>{v.decided.paymentFee ? 'company setting' : 'default — adviser to confirm; costs no VAT either way'}</small>
                </dd>
              </div>
              <div>
                <dt>Cancellation charges</dt>
                <dd>
                  {v.policy.cancellationCharge === 'taxable' ? 'Taxed at 7 %' : 'Kept out until decided'}
                  <small>{v.decided.cancellationCharge ? 'company setting' : 'default — adviser decides'}</small>
                </dd>
              </div>
            </dl>
            <Link href="/admin/finance/settings" className="fx-link">
              Change in Settings →
            </Link>
          </section>

          <section className="fx-card" aria-labelledby="fx-filing">
            <h2 id="fx-filing">Filing record</h2>
            <p className="fx-card-line">
              <StateBadge table="taxperiod" value={taxPeriod?.status ?? 'open'} />
              {v.deadline && <span className="bc-meta">due {formatIsoDate(v.deadline.dueOn, 'long')}</span>}
            </p>
            {stages.length === 0 ? (
              <p className="bc-meta mt-2">Nothing recorded yet. Recording saves today&apos;s figure as the system estimate; the adviser records what was filed.</p>
            ) : (
              <div className="bc-timeline mt-2">
                {stages.map((s) => (
                  <div key={s.id} className="bc-tl-item" data-tone={s.stage === 'system_estimate' ? undefined : 'positive'}>
                    <div className="flex items-center justify-between gap-3">
                      <StateBadge table="stage" value={s.stage} />
                      <Money cents={s.amount_cents} />
                    </div>
                    <div className="bc-meta mt-1">
                      <When value={s.computed_at} /> · {s.actor}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <RunTaxEstimatesButton />
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-8">
        <Notice tone="neutral" title="Prepared, not filed.">
          These figures are calculated from the bookings and the books by fixed rules ({r.rulesVersion}); nothing is sent to the Finanzamt from here.
          Each rule is marked “set by law”, “company setting” or “adviser to confirm”. Have the Steuerberater confirm the settings once; after that every
          period is calculated the same way.
        </Notice>
      </div>
    </>
  );
}
