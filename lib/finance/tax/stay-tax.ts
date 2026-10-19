/**
 * ══════════════════════════════════════════════════════════════════════════
 * STAY TAX — the German VAT consequences of one guest stay, explained.
 *
 * Pure and deterministic. For one reservation (with, when available, the
 * Booking.com statement line that settled it) it answers:
 *
 *   what was sold         short-term accommodation (7 %), long-term letting
 *                         (exempt), or a cancellation charge (adviser)
 *   the taxable amount    the full price the guest paid — the platform's
 *                         commission never reduces it (§ 10 Abs. 1 UStG)
 *   net and VAT           gross ÷ 1.07, the remainder is VAT, to the cent
 *   which return          Sollversteuerung: the month the stay ended
 *   the platform's cut    commission and payment fee from Booking.com B.V.
 *                         (NL): reverse charge — owed AND deducted (§ 13b)
 *   the money             what is paid out, when, under which payout id
 *
 * …and writes every step down: the figures, the formula, the legal basis,
 * where each number came from and how certain the rule is. Anything the law
 * leaves to the company's adviser is never decided silently: it is a policy
 * switch with a stated default, or an open question with its amount.
 *
 * This module never reads or writes the database. The same function feeds
 * the VAT return, the booking page and the ledger posting, so the three
 * cannot disagree.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { roundHalfUp, splitGross, vatFromNet, type Cents } from '@/lib/finance/money';

export const STAY_TAX_RULES_VERSION = 'stay-tax-2026-10-19.1';

/** How sure a rule is. Shown next to every step. */
export type Certainty = 'law' | 'policy' | 'adviser';

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  law: 'Set by law',
  policy: 'Company setting',
  adviser: 'Adviser to confirm',
};

/** Where an amount came from, strongest first. */
export type AmountSource = 'statement' | 'beds24' | 'none';

export const SOURCE_LABEL: Record<AmountSource, string> = {
  statement: 'Booking.com statement',
  beds24: 'Beds24 booking',
  none: 'not known yet',
};

/* ── Inputs ────────────────────────────────────────────────────────────── */

export interface StaySettlement {
  payoutId: string;
  payoutDate: string;
  grossCents: Cents;
  /** Positive cost. */
  commissionCents: Cents;
  /** Positive cost. */
  paymentFeeCents: Cents;
  netCents: Cents;
  /** Booking.com's word: `ok`, `cancelled`, `no_show`… */
  reservationStatus: string;
}

export interface StayTaxInput {
  reservationId: string;
  reference: string;
  unitName: string;
  /** booking_com | airbnb | direct | manual | unknown */
  source: string;
  /** active | cancelled | provisional | blocked | unknown */
  statusClass: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  /** What Beds24 says the guest pays. */
  beds24GrossCents: Cents | null;
  /** What Beds24 says the platform keeps (Booking.com sends it since 17 Oct 2026). */
  beds24CommissionCents: Cents | null;
  settlement: StaySettlement | null;
}

export interface StayTaxPolicy {
  /** § 19 UStG. A GmbH in regular taxation: false. Null = not decided → everything is provisional. */
  smallBusinessScheme: boolean | null;
  /**
   * Booking.com's "Payments Service Fee": a taxable service under reverse
   * charge (like the commission), or an exempt payment service (§ 4 Nr. 8).
   * Either way it costs no VAT while every stay is taxable — only the boxes
   * it is reported in differ. Default: reverse charge, the conservative reading.
   */
  paymentFee: 'reverse_charge' | 'exempt';
  /** A charge kept on a cancelled reservation: taxable consideration at the stay's rate, or not yet decided (excluded, listed). */
  cancellationCharge: 'taxable' | 'undecided';
}

export const DEFAULT_STAY_TAX_POLICY: StayTaxPolicy = { smallBusinessScheme: false, paymentFee: 'reverse_charge', cancellationCharge: 'undecided' };

/* ── Outputs ───────────────────────────────────────────────────────────── */

export type StayKind = 'short_stay' | 'long_stay' | 'cancellation_charge' | 'cancelled' | 'not_a_stay' | 'unknown_amount';

export const KIND_LABEL: Record<StayKind, string> = {
  short_stay: 'Short stay · 7 %',
  long_stay: 'Long-term letting · exempt',
  cancellation_charge: 'Cancellation charge',
  cancelled: 'Cancelled · nothing to tax',
  not_a_stay: 'Not a stay',
  unknown_amount: 'Amount not known',
};

/** UStVA boxes (Kennzahlen) this stay contributes to. Bases and VAT in cents, exact. */
export interface UstvaContribution {
  /** Kz 86: 7 % sales, net. */
  kz86BaseCents: Cents;
  kz86VatCents: Cents;
  /** Kz 81: 19 % sales, net. */
  kz81BaseCents: Cents;
  kz81VatCents: Cents;
  /** Kz 48: exempt sales without input-VAT deduction (§ 4 Nr. 12). */
  kz48BaseCents: Cents;
  /** Kz 46/47: services received from an EU entrepreneur (§ 13b Abs. 1): base and the VAT owed on it. */
  kz46BaseCents: Cents;
  kz47VatCents: Cents;
  /** Kz 67: input VAT on those services (§ 15 Abs. 1 Nr. 4). */
  kz67VatCents: Cents;
}

export interface TaxStep {
  key: string;
  title: string;
  /** Plain sentence. */
  text: string;
  /** "1.620,00 € ÷ 1,07 = 1.514,02 €" */
  formula?: string;
  legal?: string;
  certainty: Certainty;
  source?: AmountSource;
}

export interface OpenQuestion {
  code: 'commission_unknown' | 'payout_unknown' | 'gross_mismatch' | 'cancellation_charge' | 'small_business_undecided' | 'amount_unknown' | 'non_eur';
  text: string;
  /** Amount at stake, if any. */
  amountCents?: Cents;
  /** Whether the VAT return is incomplete until it is answered. */
  blocksReturn: boolean;
}

export interface StayTax {
  rulesVersion: string;
  reservationId: string;
  reference: string;
  kind: StayKind;
  /** `YYYY-MM` — the VAT month (Sollversteuerung: when the stay ended). Null when nothing is taxable. */
  vatMonth: string | null;
  /** The stay has ended on or before `today`: the VAT is owed, not just expected. */
  completed: boolean;
  revenue: { grossCents: Cents; netCents: Cents; vatCents: Cents; rateBp: number; source: AmountSource } | null;
  commission: { netCents: Cents; reverseChargeVatCents: Cents; deductibleVatCents: Cents; source: AmountSource } | null;
  paymentFee: { netCents: Cents; reverseChargeVatCents: Cents; deductibleVatCents: Cents; treatment: StayTaxPolicy['paymentFee']; source: AmountSource } | null;
  payout: { netCents: Cents | null; date: string | null; payoutId: string | null; state: 'paid_out' | 'expected' | 'unknown' };
  /** VAT this stay adds to the return: output VAT + reverse charge owed − deductible. */
  vatPayableCents: Cents;
  /** What stays with the company before income taxes: gross − output VAT − commission − fee − non-deductible VAT. */
  keptCents: Cents | null;
  ustva: UstvaContribution;
  steps: TaxStep[];
  questions: OpenQuestion[];
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
export const eur = (cents: number) => EUR.format(cents / 100);
const pct = (bp: number) => `${(bp / 100).toLocaleString('de-DE')} %`;
const rateFactor = (bp: number) => (1 + bp / 10000).toLocaleString('de-DE', { minimumFractionDigits: 2 });

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Short-term letting ("kurzfristige Beherbergung") is a stay of not more than
 * six months (Abschn. 4.12.9 UStAE). A longer one is long-term residential
 * letting: exempt under § 4 Nr. 12 S. 1 a UStG, and the 7 % rate cannot apply.
 */
export function isLongTermLetting(checkIn: string, checkOut: string): boolean {
  return checkOut > addMonths(checkIn, 6);
}

const EMPTY_USTVA: UstvaContribution = { kz86BaseCents: 0, kz86VatCents: 0, kz81BaseCents: 0, kz81VatCents: 0, kz48BaseCents: 0, kz46BaseCents: 0, kz47VatCents: 0, kz67VatCents: 0 };

const PLATFORM: Record<string, { name: string; country: string } | undefined> = {
  booking_com: { name: 'Booking.com B.V.', country: 'the Netherlands' },
  airbnb: { name: 'Airbnb Ireland UC', country: 'Ireland' },
};

/* ── The engine ────────────────────────────────────────────────────────── */

export function computeStayTax(input: StayTaxInput, today: string, policy: StayTaxPolicy = DEFAULT_STAY_TAX_POLICY): StayTax {
  const steps: TaxStep[] = [];
  const questions: OpenQuestion[] = [];
  const ustva: UstvaContribution = { ...EMPTY_USTVA };
  const s = input.settlement;
  const platform = PLATFORM[input.source];
  const completed = input.checkOut <= today;
  const vatMonth = input.checkOut.slice(0, 7);
  const base = { rulesVersion: STAY_TAX_RULES_VERSION, reservationId: input.reservationId, reference: input.reference, completed };

  if (input.currency && input.currency.toUpperCase() !== 'EUR') {
    questions.push({ code: 'non_eur', text: `The booking is in ${input.currency}. Every tax figure is in euros and nothing here converts currency; this stay is excluded until it is converted at the official rate.`, blocksReturn: true });
    return { ...base, kind: 'unknown_amount', vatMonth: null, revenue: null, commission: null, paymentFee: null, payout: { netCents: null, date: null, payoutId: null, state: 'unknown' }, vatPayableCents: 0, keptCents: null, ustva, steps, questions };
  }

  if (input.statusClass === 'blocked' || input.statusClass === 'provisional') {
    steps.push({ key: 'kind', title: 'Not a sale', text: input.statusClass === 'blocked' ? 'An owner block or maintenance period: nobody paid, nothing is taxable.' : 'A request that was never accepted: nothing was sold.', certainty: 'law', legal: '§ 1 Abs. 1 Nr. 1 UStG' });
    return { ...base, kind: 'not_a_stay', vatMonth: null, revenue: null, commission: null, paymentFee: null, payout: { netCents: null, date: null, payoutId: null, state: 'unknown' }, vatPayableCents: 0, keptCents: null, ustva, steps, questions };
  }

  // ── 1. What was sold ──────────────────────────────────────────────────
  const cancelled = input.statusClass === 'cancelled' || (s !== null && s.reservationStatus !== 'ok');
  const longTerm = isLongTermLetting(input.checkIn, input.checkOut);

  // ── 2. The taxable amount and its source ──────────────────────────────
  const grossSource: AmountSource = s ? 'statement' : input.beds24GrossCents !== null ? 'beds24' : 'none';
  const gross = s ? s.grossCents : input.beds24GrossCents;
  if (s && input.beds24GrossCents !== null && !cancelled && Math.abs(s.grossCents - input.beds24GrossCents) > 1) {
    questions.push({
      code: 'gross_mismatch',
      text: `Beds24 says ${eur(input.beds24GrossCents)}, Booking.com's statement says ${eur(s.grossCents)}. The statement is what the guest actually paid, so it is used; check why they differ (a changed booking, a discount, a refund).`,
      amountCents: s.grossCents - input.beds24GrossCents,
      blocksReturn: false,
    });
  }

  if (cancelled) {
    const kept = s ? s.grossCents : 0;
    if (kept === 0) {
      steps.push({ key: 'kind', title: 'Cancelled', text: s ? 'Booking.com settled this reservation with no charge to the guest: nothing was sold, nothing is taxable.' : 'The reservation was cancelled. Beds24 does not say whether the guest was charged anything; Booking.com\'s statement will. Until then nothing is taxable.', certainty: 'law', legal: '§ 1 Abs. 1 Nr. 1 UStG', source: s ? 'statement' : 'beds24' });
      return { ...base, kind: 'cancelled', vatMonth: null, revenue: null, commission: null, paymentFee: null, payout: { netCents: s ? s.netCents : null, date: s?.payoutDate ?? null, payoutId: s?.payoutId ?? null, state: s ? 'paid_out' : 'unknown' }, vatPayableCents: 0, keptCents: s ? s.netCents : null, ustva, steps, questions };
    }
    // A cancellation or no-show charge the company keeps.
    const split = splitGross(kept, 700);
    steps.push({
      key: 'kind',
      title: 'A cancellation charge',
      text: `The guest cancelled (or did not arrive) and paid ${eur(kept)} anyway. Whether that is payment for the stay that was booked (taxable at 7 %) or compensation (not taxable) is a question the adviser decides; ${policy.cancellationCharge === 'taxable' ? 'the company setting treats it as taxable at the stay\'s rate.' : 'until then it is listed with its amount and kept out of the return.'}`,
      formula: `${eur(kept)} ÷ ${rateFactor(700)} = ${eur(split.net)} net + ${eur(split.vat)} VAT (if taxable)`,
      legal: '§ 10 Abs. 1 UStG; EuGH C-295/17 (MEO); Abschn. 1.3 Abs. 13 UStAE',
      certainty: policy.cancellationCharge === 'taxable' ? 'policy' : 'adviser',
      source: 'statement',
    });
    if (policy.cancellationCharge === 'undecided') {
      questions.push({ code: 'cancellation_charge', text: `Cancellation charge of ${eur(kept)} on ${input.reference}: taxable at 7 % or untaxed compensation? Kept out of the VAT return until decided (VAT at stake: ${eur(split.vat)}).`, amountCents: split.vat, blocksReturn: true });
    } else {
      ustva.kz86BaseCents = split.net;
      ustva.kz86VatCents = split.vat;
    }
    const platformCosts = platformCostSteps(input, s, policy, steps, questions, ustva, false, platform, today);
    const outputVat = policy.cancellationCharge === 'taxable' ? split.vat : 0;
    return {
      ...base,
      kind: 'cancellation_charge',
      vatMonth,
      revenue: { grossCents: kept, netCents: policy.cancellationCharge === 'taxable' ? split.net : kept, vatCents: outputVat, rateBp: policy.cancellationCharge === 'taxable' ? 700 : 0, source: 'statement' },
      ...platformCosts,
      payout: { netCents: s!.netCents, date: s!.payoutDate, payoutId: s!.payoutId, state: 'paid_out' },
      vatPayableCents: outputVat + ustva.kz47VatCents - ustva.kz67VatCents,
      keptCents: kept - outputVat - (platformCosts.commission?.netCents ?? 0) - (platformCosts.paymentFee?.netCents ?? 0) - nonDeductible(platformCosts),
      ustva,
      steps,
      questions,
    };
  }

  if (gross === null) {
    questions.push({ code: 'amount_unknown', text: `Neither Beds24 nor a Booking.com statement states a price for ${input.reference}. The stay cannot be taxed until one does.`, blocksReturn: completed });
    steps.push({ key: 'kind', title: 'Price not known', text: 'No source states what the guest paid.', certainty: 'law', source: 'none' });
    return { ...base, kind: 'unknown_amount', vatMonth, revenue: null, commission: null, paymentFee: null, payout: { netCents: null, date: null, payoutId: null, state: 'unknown' }, vatPayableCents: 0, keptCents: null, ustva, steps, questions };
  }

  if (policy.smallBusinessScheme === null) {
    questions.push({ code: 'small_business_undecided', text: 'The company has not recorded whether it uses the small-business scheme (§ 19 UStG). A GmbH in regular taxation charges VAT; the figures assume that.', blocksReturn: false });
  }

  // ── 3. The rate and the split ──────────────────────────────────────────
  let revenue: StayTax['revenue'];
  let outputVat = 0;
  if (policy.smallBusinessScheme === true) {
    steps.push({ key: 'kind', title: 'Small business: no VAT charged', text: `The company uses the small-business scheme, so the ${eur(gross)} the guest paid carries no VAT.`, legal: '§ 19 Abs. 1 UStG', certainty: 'policy', source: grossSource });
    revenue = { grossCents: gross, netCents: gross, vatCents: 0, rateBp: 0, source: grossSource };
  } else if (longTerm) {
    steps.push({
      key: 'kind',
      title: 'Long-term letting: exempt',
      text: `${input.nights} nights (${input.checkIn} to ${input.checkOut}) is longer than six months. Letting a home for that long is exempt from VAT, so the 7 % rate does not apply and the guest's ${eur(gross)} carries no VAT. Costs belonging to this stay give no input-VAT deduction.`,
      legal: '§ 4 Nr. 12 S. 1 a, S. 2 UStG; Abschn. 4.12.9 UStAE; § 15 Abs. 2 Nr. 1 UStG',
      certainty: 'law',
      source: grossSource,
    });
    revenue = { grossCents: gross, netCents: gross, vatCents: 0, rateBp: 0, source: grossSource };
    ustva.kz48BaseCents = gross;
  } else {
    const split = splitGross(gross, 700);
    steps.push({
      key: 'kind',
      title: 'Short stay: 7 %',
      text: `${input.nights} ${input.nights === 1 ? 'night' : 'nights'} in ${input.unitName} is short-term accommodation, taxed at the reduced rate of 7 %. Cleaning, linen and towels belong to the stay and share its rate.`,
      legal: '§ 12 Abs. 2 Nr. 11 S. 1 UStG; Abschn. 12.16 UStAE',
      certainty: 'law',
    });
    steps.push({
      key: 'amount',
      title: 'The taxable amount is the full price',
      text: `The guest paid ${eur(gross)} for the stay. That whole amount is the price of BoLaGio's sale — ${platform ? `${platform.name} only arranged it, and its commission is a separate cost that never reduces the taxable amount` : 'there is no intermediary to deduct'}. The price already includes the VAT.`,
      legal: '§ 10 Abs. 1 S. 2 UStG',
      certainty: 'law',
      source: grossSource,
    });
    steps.push({
      key: 'split',
      title: 'Net and VAT',
      text: 'The VAT is taken out of the price, not added on top: the price is divided by 1.07, the rest is VAT.',
      formula: `${eur(gross)} ÷ ${rateFactor(700)} = ${eur(split.net)} net · ${eur(gross)} − ${eur(split.net)} = ${eur(split.vat)} VAT`,
      legal: '§ 12 Abs. 2 Nr. 11 UStG; rounding half-up to the cent',
      certainty: 'law',
    });
    revenue = { grossCents: gross, netCents: split.net, vatCents: split.vat, rateBp: 700, source: grossSource };
    outputVat = split.vat;
    ustva.kz86BaseCents = split.net;
    ustva.kz86VatCents = split.vat;
  }

  // ── 4. Which return ────────────────────────────────────────────────────
  steps.push({
    key: 'period',
    title: completed ? `Belongs to the ${monthName(vatMonth)} return` : `Will belong to the ${monthName(vatMonth)} return`,
    text: `VAT is owed for the month in which the stay was completed — check-out on ${input.checkOut} — not when it was booked or paid out (taxation on agreed amounts). ${completed ? '' : 'The stay has not ended yet, so this is expected VAT, not owed VAT.'}`.trim(),
    legal: '§ 13 Abs. 1 Nr. 1 a S. 1 UStG; § 16 Abs. 1 UStG',
    certainty: 'law',
  });

  // ── 5. The platform's costs ────────────────────────────────────────────
  const platformCosts = platformCostSteps(input, s, policy, steps, questions, ustva, longTerm, platform, today);

  // ── 6. The money ───────────────────────────────────────────────────────
  const payout: StayTax['payout'] = s
    ? { netCents: s.netCents, date: s.payoutDate, payoutId: s.payoutId, state: 'paid_out' }
    : platformCosts.commission
      ? { netCents: gross - platformCosts.commission.netCents - (platformCosts.paymentFee?.netCents ?? 0), date: null, payoutId: null, state: 'expected' }
      : { netCents: null, date: null, payoutId: null, state: 'unknown' };
  if (s) {
    steps.push({ key: 'payout', title: 'Paid out', text: `Booking.com paid ${eur(s.netCents)} on ${s.payoutDate} (payout ${s.payoutId}): the price minus its commission and payment fee. The bank statement is the proof of receipt.`, formula: `${eur(s.grossCents)} − ${eur(s.commissionCents)} − ${eur(s.paymentFeeCents)} = ${eur(s.netCents)}`, certainty: 'law', source: 'statement' });
  } else if (input.source === 'booking_com') {
    questions.push({ code: 'payout_unknown', text: `No Booking.com statement covers ${input.reference} yet, so the payout date and the exact fee are not known. Import the statement once Booking.com has paid out.`, blocksReturn: false });
  }

  const vatPayable = outputVat + ustva.kz47VatCents - ustva.kz67VatCents;
  const kept = revenue.grossCents - outputVat - (platformCosts.commission?.netCents ?? 0) - (platformCosts.paymentFee?.netCents ?? 0) - nonDeductible(platformCosts);
  const commissionKnown = !platform || platformCosts.commission !== null;
  steps.push({
    key: 'result',
    title: 'Result',
    text: `This stay adds ${eur(vatPayable)} to the VAT to pay${ustva.kz47VatCents ? ` (${eur(outputVat)} on the sale; the ${eur(ustva.kz47VatCents)} reverse charge is owed and deducted in the same return)` : ''}.${commissionKnown ? ` After VAT and the platform's costs, ${eur(kept)} stays with the company before income taxes.` : ''}`,
    certainty: questions.some((q) => q.blocksReturn) ? 'adviser' : 'law',
  });

  return {
    ...base,
    kind: longTerm && policy.smallBusinessScheme !== true ? 'long_stay' : 'short_stay',
    vatMonth,
    revenue,
    ...platformCosts,
    payout,
    vatPayableCents: vatPayable,
    keptCents: commissionKnown ? kept : null,
    ustva,
    steps,
    questions,
  };
}

function nonDeductible(c: Pick<StayTax, 'commission' | 'paymentFee'>): Cents {
  return (c.commission ? c.commission.reverseChargeVatCents - c.commission.deductibleVatCents : 0) + (c.paymentFee ? c.paymentFee.reverseChargeVatCents - c.paymentFee.deductibleVatCents : 0);
}

/**
 * Commission and payment fee: services an EU platform supplies to the
 * company. The company owes the German VAT on them (reverse charge) and
 * deducts it again where its own sales are taxable — on an exempt long-term
 * letting it may not (§ 15 Abs. 2 Nr. 1), and the VAT becomes a cost.
 */
function platformCostSteps(
  input: StayTaxInput,
  s: StaySettlement | null,
  policy: StayTaxPolicy,
  steps: TaxStep[],
  questions: OpenQuestion[],
  ustva: UstvaContribution,
  exemptStay: boolean,
  platform: { name: string; country: string } | undefined,
  today: string
): Pick<StayTax, 'commission' | 'paymentFee'> {
  if (!platform) {
    if (input.source === 'direct' || input.source === 'manual') steps.push({ key: 'commission', title: 'No platform commission', text: 'Booked directly: no platform took a commission.', certainty: 'law' });
    return { commission: null, paymentFee: null };
  }
  const deductible = policy.smallBusinessScheme !== true && !exemptStay;
  const commissionSource: AmountSource = s ? 'statement' : input.beds24CommissionCents !== null && input.beds24CommissionCents > 0 ? 'beds24' : 'none';
  const commissionNet = s ? s.commissionCents : commissionSource === 'beds24' ? (input.beds24CommissionCents as number) : null;

  let commission: StayTax['commission'] = null;
  if (commissionNet === null) {
    questions.push({
      code: 'commission_unknown',
      text: `${platform.name}'s commission on ${input.reference} is not known yet. ${input.source === 'booking_com' ? 'Booking.com has only sent it to Beds24 since 17 October 2026; for earlier bookings it comes from the Booking.com statement.' : 'It comes from the platform\'s statement.'} The VAT on the sale is unaffected; the reverse charge cannot be reported until it is known.`,
      blocksReturn: input.checkOut <= today,
    });
    steps.push({ key: 'commission', title: 'Commission: not known yet', text: `The platform's commission is not in any source yet. It will come from the ${input.source === 'booking_com' ? 'Booking.com' : 'platform'} statement.`, certainty: 'law', source: 'none' });
  } else {
    const rc = vatFromNet(commissionNet, 1900);
    const ded = deductible ? rc : 0;
    commission = { netCents: commissionNet, reverseChargeVatCents: rc, deductibleVatCents: ded, source: commissionSource };
    ustva.kz46BaseCents += commissionNet;
    ustva.kz47VatCents += rc;
    ustva.kz67VatCents += ded;
    steps.push({
      key: 'commission',
      title: 'Commission: reverse charge',
      text: `${platform.name} (${platform.country}) charged ${eur(commissionNet)} commission, without VAT. Because the platform is abroad, BoLaGio owes the German 19 % on it itself ${deductible ? '— and deducts exactly the same amount as input VAT in the same return. Net effect: zero, but both boxes must be filled.' : '— and may not deduct it, because the stay it belongs to is exempt (or the company is a small business). The VAT is a real cost.'}`,
      formula: `${eur(commissionNet)} × 19 % = ${eur(rc)} owed (box 47)${deductible ? ` · ${eur(rc)} deducted (box 67)` : ' · 0,00 € deducted'}`,
      legal: '§ 13b Abs. 1, Abs. 5 S. 1 UStG; § 15 Abs. 1 S. 1 Nr. 4 UStG' + (deductible ? '' : '; § 15 Abs. 2 Nr. 1 UStG'),
      certainty: 'law',
      source: commissionSource,
    });
    if (commissionSource === 'beds24') {
      steps.push({ key: 'commission-source', title: 'Commission as reported to Beds24', text: 'This commission is what Booking.com reported to Beds24 when the booking was made. The monthly commission invoice from Booking.com is the legal document; the statement import confirms the exact figure.', certainty: 'law', source: 'beds24' });
    }
  }

  let paymentFee: StayTax['paymentFee'] = null;
  if (s && s.paymentFeeCents > 0) {
    const rcFee = policy.paymentFee === 'reverse_charge' ? vatFromNet(s.paymentFeeCents, 1900) : 0;
    const dedFee = policy.paymentFee === 'reverse_charge' && deductible ? rcFee : 0;
    paymentFee = { netCents: s.paymentFeeCents, reverseChargeVatCents: rcFee, deductibleVatCents: dedFee, treatment: policy.paymentFee, source: 'statement' };
    if (policy.paymentFee === 'reverse_charge') {
      ustva.kz46BaseCents += s.paymentFeeCents;
      ustva.kz47VatCents += rcFee;
      ustva.kz67VatCents += dedFee;
    }
    steps.push({
      key: 'fee',
      title: `Payment fee: ${policy.paymentFee === 'reverse_charge' ? 'reverse charge' : 'exempt'}`,
      text:
        policy.paymentFee === 'reverse_charge'
          ? `Booking.com also kept ${eur(s.paymentFeeCents)} for handling the guest's payment. Treated like the commission: 19 % owed and deducted again${deductible ? ', net effect zero' : ''}.`
          : `Booking.com also kept ${eur(s.paymentFeeCents)} for handling the guest's payment, treated as an exempt payment service: no VAT, nothing to report in boxes 46/47.`,
      formula: policy.paymentFee === 'reverse_charge' ? `${eur(s.paymentFeeCents)} × 19 % = ${eur(rcFee)}` : undefined,
      legal: policy.paymentFee === 'reverse_charge' ? '§ 13b Abs. 1, Abs. 5 UStG' : '§ 4 Nr. 8 a/d UStG',
      certainty: 'adviser',
      source: 'statement',
    });
  }
  return { commission, paymentFee };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthName(ym: string): string {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/* ── The VAT return (Umsatzsteuer-Voranmeldung) ────────────────────────── */

export type VatPeriodKind = 'month' | 'quarter';

export function periodMonths(periodKey: string): string[] {
  if (/^\d{4}$/.test(periodKey)) return Array.from({ length: 12 }, (_, i) => `${periodKey}-${String(i + 1).padStart(2, '0')}`);
  const q = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  if (q) {
    const first = (Number(q[2]) - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${q[1]}-${String(first + i).padStart(2, '0')}`);
  }
  return [periodKey];
}

export function periodOf(month: string, kind: VatPeriodKind): string {
  if (kind === 'month') return month;
  return `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;
}

export function periodLabel(periodKey: string): string {
  if (/^\d{4}$/.test(periodKey)) return `Year ${periodKey}`;
  const q = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  return q ? `Q${q[2]} ${q[1]}` : monthName(periodKey);
}

export interface OtherVatInputs {
  /** Kz 66: deductible input VAT from purchase invoices (the ledger's expense lines). */
  kz66VatCents: Cents;
  /** Other 19 % / 7 % sales from the ledger (e.g. minibar), net and VAT. */
  kz81BaseCents: Cents;
  kz81VatCents: Cents;
  otherKz86BaseCents: Cents;
  otherKz86VatCents: Cents;
}

export interface VatReturnBox {
  kz: string;
  label: string;
  /** Exact, to the cent. */
  baseCents?: Cents;
  vatCents?: Cents;
  /** What goes into the ELSTER form: bases in whole euros (cents dropped), tax as the form computes it. */
  formBaseEuros?: number;
  formVatCents?: Cents;
}

export interface VatReturn {
  periodKey: string;
  months: string[];
  boxes: VatReturnBox[];
  /** Exact: sum of every stay's VAT and the other inputs. Positive = to pay. */
  exactPayableCents: Cents;
  /** As the ELSTER form computes it from whole-euro bases (Kz 83). */
  formPayableCents: Cents;
  stays: StayTax[];
  /** Stays in the period that have not ended yet (only in a period still running). */
  openStays: number;
  questions: Array<OpenQuestion & { reference: string }>;
  complete: boolean;
  rulesVersion: string;
}

/**
 * The boxes of one return from the stays whose VAT month falls in it.
 *
 * The form takes bases in whole euros (the cents are dropped) and computes
 * the tax on boxes 81 and 86 itself; boxes 47, 66 and 67 are entered to the
 * cent. Both the exact figure and the form figure are kept, so a rounding
 * difference of a few cents is visible, never mysterious.
 */
export function buildVatReturn(periodKey: string, stays: readonly StayTax[], other: OtherVatInputs): VatReturn {
  const months = periodMonths(periodKey);
  const inPeriod = stays.filter((t) => t.vatMonth !== null && months.includes(t.vatMonth));
  const sum = (f: (u: UstvaContribution) => number) => inPeriod.reduce((a, t) => a + f(t.ustva), 0);
  const kz86Base = sum((u) => u.kz86BaseCents) + other.otherKz86BaseCents;
  const kz86Vat = sum((u) => u.kz86VatCents) + other.otherKz86VatCents;
  const kz81Base = sum((u) => u.kz81BaseCents) + other.kz81BaseCents;
  const kz81Vat = sum((u) => u.kz81VatCents) + other.kz81VatCents;
  const kz48Base = sum((u) => u.kz48BaseCents);
  const kz46Base = sum((u) => u.kz46BaseCents);
  const kz47Vat = sum((u) => u.kz47VatCents);
  const kz67Vat = sum((u) => u.kz67VatCents);
  const kz66Vat = other.kz66VatCents;

  const euros = (c: number) => Math.trunc(c / 100);
  const form81 = roundHalfUp(euros(kz81Base) * 100 * 0.19);
  const form86 = roundHalfUp(euros(kz86Base) * 100 * 0.07);
  const boxes: VatReturnBox[] = [
    { kz: '81', label: 'Sales at 19 %', baseCents: kz81Base, vatCents: kz81Vat, formBaseEuros: euros(kz81Base), formVatCents: form81 },
    { kz: '86', label: 'Sales at 7 % (short stays)', baseCents: kz86Base, vatCents: kz86Vat, formBaseEuros: euros(kz86Base), formVatCents: form86 },
    { kz: '48', label: 'Exempt sales without input-VAT deduction (long-term letting)', baseCents: kz48Base, formBaseEuros: euros(kz48Base) },
    { kz: '46', label: 'Services from EU companies, reverse charge — net', baseCents: kz46Base, formBaseEuros: euros(kz46Base) },
    { kz: '47', label: 'VAT owed on those services', vatCents: kz47Vat, formVatCents: kz47Vat },
    { kz: '66', label: 'Input VAT from purchase invoices', vatCents: kz66Vat, formVatCents: kz66Vat },
    { kz: '67', label: 'Input VAT on reverse-charge services', vatCents: kz67Vat, formVatCents: kz67Vat },
  ];
  const exact = kz81Vat + kz86Vat + kz47Vat - kz66Vat - kz67Vat;
  const form = form81 + form86 + kz47Vat - kz66Vat - kz67Vat;
  boxes.push({ kz: '83', label: 'VAT to pay (negative: refund)', vatCents: exact, formVatCents: form });

  const questions = inPeriod.flatMap((t) => t.questions.map((q) => ({ ...q, reference: t.reference })));
  const openStays = inPeriod.filter((t) => !t.completed).length;
  return {
    periodKey,
    months,
    boxes,
    exactPayableCents: exact,
    formPayableCents: form,
    stays: inPeriod,
    openStays,
    questions,
    complete: openStays === 0 && !questions.some((q) => q.blocksReturn),
    rulesVersion: STAY_TAX_RULES_VERSION,
  };
}

/** The structured basis stored beside a recorded estimate: every box, both ways, and what was still open. */
export function vatReturnBasis(r: VatReturn, adjustmentsCents = 0): Record<string, unknown> {
  return {
    rules: r.rulesVersion,
    months: r.months,
    boxes: Object.fromEntries(r.boxes.map((b) => [b.kz, { base: b.baseCents ?? null, vat: b.vatCents ?? null, form_base_eur: b.formBaseEuros ?? null, form_vat: b.formVatCents ?? null }])),
    stays: r.stays.length,
    open_stays: r.openStays,
    open_questions: r.questions.length,
    complete: r.complete,
    adjustments: adjustmentsCents,
  };
}
