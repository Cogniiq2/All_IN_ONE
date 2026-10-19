import Link from 'next/link';
import type { CSSProperties } from 'react';
import { formatIsoDate, formatMoney } from '@/lib/admin/format';
import { CountUp } from '@/components/admin/reservations/count-up';
import {
  CERTAINTY_LABEL,
  KIND_LABEL,
  SOURCE_LABEL,
  type OpenQuestion,
  type StayTax,
  type TaxStep,
  type VatReturn,
} from '@/lib/finance/tax/stay-tax';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The VAT return and the stay calculation, as an owner reads them.
 *
 * Three layers, each one tap deeper:
 *   1. the answer        — what to pay, and whether that is final
 *   2. the form          — the boxes to type into ELSTER, with what each is
 *   3. the working       — every stay, opened, shows each step: the figures,
 *                          the formula, the law, where the number came from
 *                          and how certain the rule is
 * Expanding uses <details>: no script, keyboard- and screen-reader-native.
 * ══════════════════════════════════════════════════════════════════════════
 */

const eur = (cents: number) => formatMoney(cents, 'EUR');

const CERTAINTY_TONE: Record<TaxStep['certainty'], string> = { law: 'positive', policy: 'neutral', adviser: 'caution' };

export function CertaintyChip({ certainty }: { certainty: TaxStep['certainty'] }) {
  return (
    <span className="fx-chip" data-tone={CERTAINTY_TONE[certainty]}>
      {CERTAINTY_LABEL[certainty]}
    </span>
  );
}

export function SourceChip({ source }: { source: NonNullable<TaxStep['source']> }) {
  return (
    <span className="fx-chip" data-tone={source === 'statement' ? 'positive' : source === 'beds24' ? 'progress' : 'muted'}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/* ── 1. The answer ─────────────────────────────────────────────────────── */

export function VatReturnHero({ vatReturn, label, dueOn }: { vatReturn: VatReturn; label: string; dueOn: string | null }) {
  const box = (kz: string) => vatReturn.boxes.find((b) => b.kz === kz);
  const salesVat = (box('86')?.vatCents ?? 0) + (box('81')?.vatCents ?? 0);
  const rcOwed = box('47')?.vatCents ?? 0;
  const deduct = (box('66')?.vatCents ?? 0) + (box('67')?.vatCents ?? 0);
  const payable = vatReturn.exactPayableCents;
  const blocking = vatReturn.questions.filter((q) => q.blocksReturn).length;
  const state = vatReturn.complete ? 'complete' : vatReturn.openStays > 0 ? 'running' : 'questions';

  return (
    <section className="fx-hero" aria-label={`VAT for ${label}`}>
      <div className="fx-hero-top">
        <div>
          <p className="fx-eyebrow">{payable >= 0 ? 'VAT to pay' : 'VAT refund'} · {label}</p>
          <p className="fx-hero-value">
            <CountUp id={`vat-${vatReturn.periodKey}`} value={Math.abs(payable)} kind="money" />
          </p>
          {dueOn && <p className="fx-hero-due">Return and payment due {formatIsoDate(dueOn, 'long')}</p>}
        </div>
        <span className="fx-state" data-state={state}>
          <span aria-hidden="true" />
          {state === 'complete'
            ? 'Complete — ready to file'
            : state === 'running'
              ? `Provisional — ${vatReturn.openStays} ${vatReturn.openStays === 1 ? 'stay is' : 'stays are'} still running`
              : `${blocking} ${blocking === 1 ? 'question' : 'questions'} to answer first`}
        </span>
      </div>

      <div className="fx-equation" role="list">
        <Term label="VAT on your stays" sub="7 % inside every price" cents={salesVat} />
        <Op>+</Op>
        <Term label="VAT owed on platform fees" sub="reverse charge, § 13b" cents={rcOwed} />
        <Op>−</Op>
        <Term label="VAT you deduct" sub="the same platform VAT, plus purchases" cents={deduct} />
        <Op>=</Op>
        <Term label={payable >= 0 ? 'To pay' : 'Refund'} cents={Math.abs(payable)} strong />
      </div>
    </section>
  );
}

function Term({ label, sub, cents, strong }: { label: string; sub?: string; cents: number; strong?: boolean }) {
  return (
    <div className="fx-term" role="listitem" data-strong={strong ? 'true' : undefined}>
      <span className="fx-term-label">{label}</span>
      <span className="fx-term-value">{eur(cents)}</span>
      {sub && <span className="fx-term-sub">{sub}</span>}
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

/* ── 2. The form ───────────────────────────────────────────────────────── */

const BOX_HELP: Record<string, string> = {
  '81': 'Sales taxed at 19 % — e.g. minibar drinks. Net amount.',
  '86': 'Every short stay that ended in the period, net of its 7 % VAT.',
  '48': 'Stays longer than six months: exempt, no VAT.',
  '46': "Booking.com's commission and fee — services from a company in another EU country. Net.",
  '47': 'The 19 % German VAT you owe on box 46.',
  '66': 'VAT on your purchase invoices (cleaning supplies, repairs…), from the books.',
  '67': 'The same VAT as box 47, deducted again — net effect zero.',
  '83': 'The result: positive is paid to the Finanzamt, negative is refunded.',
};

export function VatBoxes({ vatReturn }: { vatReturn: VatReturn }) {
  const rows = vatReturn.boxes.filter((b) => b.kz === '83' || b.kz === '86' || (b.baseCents ?? 0) !== 0 || (b.vatCents ?? 0) !== 0);
  const differs = vatReturn.formPayableCents !== vatReturn.exactPayableCents;
  return (
    <div className="fx-boxes">
      <div className="fx-boxes-head" aria-hidden="true">
        <span>Box</span>
        <span>What it is</span>
        <span className="num">Enter in ELSTER</span>
      </div>
      {rows.map((b, i) => (
        <div key={b.kz} className="fx-box" data-total={b.kz === '83' ? 'true' : undefined} style={{ ['--i' as string]: i } as CSSProperties}>
          <span className="fx-kz">{b.kz}</span>
          <span className="fx-box-text">
            <strong>{b.label}</strong>
            <small>{BOX_HELP[b.kz]}</small>
          </span>
          <span className="fx-box-value num">
            {b.formBaseEuros !== undefined && b.kz !== '47' && b.kz !== '66' && b.kz !== '67' && b.kz !== '83' ? (
              <>
                {b.formBaseEuros.toLocaleString('de-DE')} €<small>exact {eur(b.baseCents ?? 0)}</small>
                {b.formVatCents !== undefined && <small>VAT the form computes: {eur(b.formVatCents)}</small>}
              </>
            ) : (
              <>
                {eur(b.formVatCents ?? b.vatCents ?? 0)}
                {b.kz === '83' && differs && <small>exact sum {eur(vatReturn.exactPayableCents)}</small>}
              </>
            )}
          </span>
        </div>
      ))}
      <p className="fx-note">
        ELSTER takes bases in whole euros (the cents are dropped) and computes the tax on boxes 81 and 86 itself; boxes 47, 66 and 67 are entered
        to the cent. {differs ? `That is why the form's result differs from the exact sum by ${eur(Math.abs(vatReturn.formPayableCents - vatReturn.exactPayableCents))}.` : ''}
      </p>
    </div>
  );
}

/* ── Questions ─────────────────────────────────────────────────────────── */

const QUESTION_TITLE: Record<OpenQuestion['code'], string> = {
  commission_unknown: 'Commission not known yet',
  payout_unknown: 'Payout not confirmed yet',
  gross_mismatch: 'Beds24 and Booking.com disagree on the price',
  cancellation_charge: 'Cancellation charge to classify',
  small_business_undecided: 'Small-business status not recorded',
  amount_unknown: 'Price not known',
  non_eur: 'Booking not in euros',
};

export function QuestionList({ questions }: { questions: Array<OpenQuestion & { reference: string }> }) {
  const groups = new Map<OpenQuestion['code'], Array<OpenQuestion & { reference: string }>>();
  for (const q of questions) groups.set(q.code, [...(groups.get(q.code) ?? []), q]);
  if (groups.size === 0) return null;
  return (
    <div className="fx-questions">
      {Array.from(groups.entries())
        .sort((a, b) => Number(b[1][0].blocksReturn) - Number(a[1][0].blocksReturn))
        .map(([code, list]) => (
          <details key={code} className="fx-question" data-blocking={list.some((q) => q.blocksReturn) ? 'true' : undefined}>
            <summary>
              <span className="fx-q-dot" aria-hidden="true" />
              <span className="fx-q-title">{QUESTION_TITLE[code]}</span>
              <span className="fx-q-count">
                {list.length} {list.length === 1 ? 'stay' : 'stays'}
                {list.some((q) => q.blocksReturn) ? ' · holds the return' : ''}
              </span>
              <Chevron />
            </summary>
            <ul>
              {list.map((q, i) => (
                <li key={`${q.reference}-${i}`}>{q.text}</li>
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}

/* ── 3. The working ────────────────────────────────────────────────────── */

export function StayTaxList({ stays }: { stays: StayTax[] }) {
  if (stays.length === 0) return <p className="fx-empty">No stay ended in this period, so there is nothing to tax from stays.</p>;
  return (
    <div className="fx-stays">
      {stays.map((t, i) => (
        <details key={t.reservationId} className="fx-stay" style={{ ['--i' as string]: Math.min(i, 14) } as CSSProperties}>
          <summary>
            <span className="fx-stay-ref">
              <strong>{t.reference}</strong>
              <small>{KIND_LABEL[t.kind]}{t.completed ? '' : ' · still running'}</small>
            </span>
            <span className="fx-stay-fig">
              <small>Price</small>
              {t.revenue ? eur(t.revenue.grossCents) : '—'}
            </span>
            <span className="fx-stay-fig">
              <small>VAT</small>
              {t.revenue ? eur(t.revenue.vatCents) : '—'}
            </span>
            <span className="fx-stay-fig fx-hide-sm">
              <small>Commission</small>
              {t.commission ? eur(t.commission.netCents) : t.kind === 'short_stay' || t.kind === 'long_stay' ? <span className="fx-unknown">not known</span> : '—'}
            </span>
            <span className="fx-stay-fig fx-hide-sm">
              <small>Kept</small>
              {t.keptCents !== null ? eur(t.keptCents) : '—'}
            </span>
            <Chevron />
          </summary>
          <StayTaxSteps tax={t} />
        </details>
      ))}
    </div>
  );
}

/** Every step of one stay's calculation. Used in the VAT return and on the reservation page. */
export function StayTaxSteps({ tax, linkToReservation = true }: { tax: StayTax; linkToReservation?: boolean }) {
  return (
    <div className="fx-steps">
      <ol>
        {tax.steps.map((s, i) => (
          <li key={s.key} className="fx-step" data-key={s.key} style={{ ['--i' as string]: i } as CSSProperties}>
            <span className="fx-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="fx-step-body">
              <p className="fx-step-title">{s.title}</p>
              <p className="fx-step-text">{s.text}</p>
              {s.formula && <p className="fx-formula">{s.formula}</p>}
              <p className="fx-step-meta">
                <CertaintyChip certainty={s.certainty} />
                {s.source && <SourceChip source={s.source} />}
                {s.legal && <span className="fx-legal">{s.legal}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {tax.questions.length > 0 && (
        <ul className="fx-step-questions">
          {tax.questions.map((q, i) => (
            <li key={i} data-blocking={q.blocksReturn ? 'true' : undefined}>
              {q.text}
            </li>
          ))}
        </ul>
      )}
      <p className="fx-rules">
        Calculated by {tax.rulesVersion}.{' '}
        {linkToReservation && (
          <Link href={`/admin/reservations/${tax.reservationId}`} className="fx-link">
            Open the reservation
          </Link>
        )}
      </p>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="fx-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
