import Link from 'next/link';
import type { CSSProperties } from 'react';
import { formatMoney } from '@/lib/admin/format';
import type { IncomeReport, IncomePartState } from '@/lib/finance/income';
import type { StayTax } from '@/lib/finance/tax/stay-tax';
import { CountUp } from '@/components/admin/reservations/count-up';
import { StayTaxList } from '@/components/admin/finance/stay-tax-view';

/**
 * Income as one equation an owner can check by eye:
 *   stays (without VAT) + minibar − Booking.com − cleaning = income
 * Each term says where it came from and whether it is known, expected or
 * missing; what is missing is named with the one step that fills it.
 */

const eur = (c: number) => formatMoney(c, 'EUR');

const STATE_WORD: Record<IncomePartState, string> = {
  known: 'known',
  partial: 'partly known',
  expected: 'expected',
  unknown: 'not known yet',
  none: 'none in this period',
};

export function IncomeView({ report, stays }: { report: IncomeReport; stays: StayTax[] }) {
  const r = report;
  return (
    <>
      <section className="fx-hero" aria-label="Income">
        <div className="fx-hero-top">
          <div>
            <p className="fx-eyebrow">Income · {r.stays.count} {r.stays.count === 1 ? 'stay' : 'stays'}</p>
            <p className="fx-hero-value">
              <CountUp id="income" value={r.incomeCents} kind="money" />
            </p>
            <p className="fx-hero-due">The guests paid {eur(r.stays.grossCents)}; {eur(r.stays.vatCents)} of that is VAT for the Finanzamt.</p>
          </div>
          <span className="fx-state" data-state={r.final ? 'complete' : 'questions'}>
            <span aria-hidden="true" />
            {r.final ? 'Complete' : 'Provisional — see below'}
          </span>
        </div>

        <div className="fx-equation" role="list">
          <Term label="Stays, without VAT" value={r.stays.netCents} sub={`${r.stays.count} ${r.stays.count === 1 ? 'stay' : 'stays'} · from Beds24 and Booking.com`} state="known" />
          <Op>+</Op>
          <Term label="Minibar, without VAT" value={r.minibar.netCents} sub={r.minibar.items > 0 ? `${r.minibar.items} items` : 'nothing recorded'} state={r.minibar.state} />
          <Op>−</Op>
          <Term
            label="Booking.com commission & fee"
            value={r.platform.commissionCents + r.platform.feeCents}
            sub={r.platform.staysUnknown > 0 ? `${r.platform.staysUnknown} ${r.platform.staysUnknown === 1 ? 'stay' : 'stays'} not known yet` : r.platform.staysKnown > 0 ? `known for all ${r.platform.staysKnown}` : 'none'}
            state={r.platform.state}
          />
          <Op>−</Op>
          <Term
            label="Cleaning"
            value={r.cleaning.cents}
            sub={
              r.cleaning.source === 'invoices'
                ? 'from the cleaning invoices'
                : r.cleaning.source === 'setting'
                  ? `${r.cleaning.stays} × ${eur(r.cleaning.perStayCents ?? 0)} (your setting)`
                  : r.cleaning.stays > 0
                    ? `${r.cleaning.stays} cleanings, no cost recorded`
                    : 'none'
            }
            state={r.cleaning.state}
          />
        </div>
      </section>

      {r.gaps.length > 0 && (
        <ul className="fx-gaps">
          {r.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
          <li className="fx-gaps-links">
            <Link href="/admin/finance/imports" className="fx-link">
              Upload a Booking.com statement →
            </Link>
            <Link href="/admin/finance/settings" className="fx-link">
              Set the cleaning cost per stay →
            </Link>
            <Link href="/admin/finance/minibar" className="fx-link">
              Minibar →
            </Link>
          </li>
        </ul>
      )}

      {r.byUnit.length > 0 && (
        <section className="fx-units" aria-label="By apartment">
          <div className="fx-units-head" aria-hidden="true">
            <span>Apartment</span>
            <span>Stays, without VAT</span>
            <span>Booking.com</span>
            <span>Cleaning</span>
            <span>Income</span>
          </div>
          {r.byUnit.map((u, i) => (
            <div key={u.unitId ?? 'none'} className="fx-unit" style={{ ['--i' as string]: i } as CSSProperties}>
              <span className="fx-unit-name">
                {u.name}
                <small>
                  {u.stays} {u.stays === 1 ? 'stay' : 'stays'}
                </small>
              </span>
              <span data-label="Stays">{eur(u.netCents)}</span>
              <span data-label="Booking.com">− {eur(u.platformCents)}</span>
              <span data-label="Cleaning">− {eur(u.cleaningCents)}</span>
              <strong data-label="Income">{eur(u.incomeCents)}</strong>
            </div>
          ))}
          {r.minibar.netCents !== 0 && <p className="fx-note">The minibar ({eur(r.minibar.netCents)}) is not assigned to an apartment, so the rows add up to the income without it.</p>}
        </section>
      )}

      <details className="fx-explain">
        <summary>
          Show every stay and its calculation
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="fx-books-body">
          <StayTaxList stays={stays} />
          <p className="fx-note">
            Income = stays without VAT + minibar without VAT − Booking.com commission and fee − cleaning. The reverse-charge VAT on the commission is owed and deducted
            again, so it costs nothing — except on a stay longer than six months, where it is counted as a cost. Calculated by {r.rulesVersion}.
          </p>
        </div>
      </details>
    </>
  );
}

function Term({ label, value, sub, state }: { label: string; value: number; sub: string; state: IncomePartState }) {
  return (
    <div className="fx-term" role="listitem" data-part={state}>
      <span className="fx-term-label">{label}</span>
      <span className="fx-term-value">{state === 'unknown' ? '?' : eur(value)}</span>
      <span className="fx-term-sub">
        {sub}
        {state !== 'known' && state !== 'none' ? ` · ${STATE_WORD[state]}` : ''}
      </span>
    </div>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span className="fx-op" aria-hidden="true">
      {children}
    </span>
  );
}
