/**
 * ══════════════════════════════════════════════════════════════════════════
 * OTA SETTLEMENTS — Booking.com statement lines against local reservations.
 *
 * Pure. Three questions, each answered deterministically and explainably:
 *
 *   1. WHICH local reservation is this statement line about?
 *      Exact Booking.com reservation number against the reservation's
 *      persisted channel reference (Beds24 `apiReference`, stored as
 *      `bolagio_reservations.channel_reference`). One candidate → matched;
 *      none → unmatched (kept, visible, re-matchable later); several →
 *      ambiguous (never picked). A guest name, a date or a unit is NEVER an
 *      identity key: those are shown to a person as evidence, nothing more.
 *
 *   2. Does the statement GROSS agree with the local reservation gross?
 *      Both are kept; neither overwrites the other. The delta is
 *      statement − local. Tolerance is zero cents unless configured.
 *
 *   3. What do the lines add up to — per filter, per payout?
 *      A payout is a GROUP of lines sharing a payout ID, never one payout per
 *      line. Payout cash is not a finance fact here at all: the bank is the
 *      cash authority, and one bank receipt reconciles against one group.
 *
 * Only `current` lines count. A `conflict` (an amended line awaiting review)
 * and a `superseded` one are evidence, not money, and summing them would
 * double count the reservation.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type MatchState = 'matched' | 'unmatched' | 'ambiguous';
export type GrossState = 'exact' | 'discrepancy' | 'no_local_gross' | 'not_applicable';
export type AmendmentState = 'current' | 'conflict' | 'superseded';
export type LedgerState = 'pending' | 'posted' | 'not_posted' | 'legacy_posted';
/** One word for a person: the state a line is in, worst first. */
export type SettlementReconState = 'reconciled' | 'discrepancy' | 'no_local_gross' | 'unmatched' | 'ambiguous';

export const SETTLEMENT_RULES_VERSION = 'bcom-settlement-2026-09-23.1';

/** What matching needs of a local reservation — no guest data. */
export interface ReservationCandidate {
  id: string;
  unit_id: string;
  channel_reference: string | null;
  source: string;
  provider_status: string;
  status_class: string;
  check_in: string;
  check_out: string;
  currency: string | null;
  total_amount_cents: number | null;
}

export interface MatchResult {
  state: MatchState;
  reservation: ReservationCandidate | null;
  candidates: number;
}

/** Normalise a reference for comparison: trimmed, nothing else. A Booking.com number is digits; no fuzzy folding. */
export function normaliseReference(ref: string | null | undefined): string | null {
  const t = (ref ?? '').trim();
  return t ? t : null;
}

/**
 * Rule 1 — exact reservation number. The candidate list is whatever the
 * source returned for that number; this function re-checks equality itself
 * so a sloppy query can never widen a match.
 */
export function matchReservation(bookingNumber: string, candidates: readonly ReservationCandidate[]): MatchResult {
  const want = normaliseReference(bookingNumber);
  const hits = want ? candidates.filter((c) => normaliseReference(c.channel_reference) === want) : [];
  if (hits.length === 1) return { state: 'matched', reservation: hits[0], candidates: 1 };
  return { state: hits.length === 0 ? 'unmatched' : 'ambiguous', reservation: null, candidates: hits.length };
}

export interface GrossComparison {
  state: GrossState;
  localGrossCents: number | null;
  localCurrency: string | null;
  deltaCents: number | null;
}

/**
 * Statement gross against the local (Beds24) gross. The local amount is
 * "gross as the provider states it" and nothing more; a difference is a
 * finding for a person — an adjustment, a cancellation charge, a changed
 * price — never something to fix by writing either side.
 */
export function compareGross(statementGrossCents: number, statementCurrency: string, reservation: ReservationCandidate | null, toleranceCents = 0): GrossComparison {
  if (!reservation) return { state: 'not_applicable', localGrossCents: null, localCurrency: null, deltaCents: null };
  const local = reservation.total_amount_cents;
  const localCurrency = reservation.currency ? reservation.currency.toUpperCase() : null;
  if (local === null || local === undefined) return { state: 'no_local_gross', localGrossCents: null, localCurrency, deltaCents: null };
  if (localCurrency && localCurrency !== statementCurrency) return { state: 'discrepancy', localGrossCents: local, localCurrency, deltaCents: null };
  const delta = statementGrossCents - local;
  return { state: Math.abs(delta) <= toleranceCents ? 'exact' : 'discrepancy', localGrossCents: local, localCurrency, deltaCents: delta };
}

export function reconState(match: MatchState, gross: GrossState): SettlementReconState {
  if (match === 'ambiguous') return 'ambiguous';
  if (match === 'unmatched') return 'unmatched';
  if (gross === 'exact') return 'reconciled';
  if (gross === 'no_local_gross') return 'no_local_gross';
  return 'discrepancy';
}

/* ── Rows as persisted ──────────────────────────────────────────────── */

export interface SettlementRow {
  id: string;
  provider: string;
  identity_key: string;
  content_sha256: string;
  row_type: string;
  booking_number: string;
  payout_id: string;
  payout_date: string;
  check_in: string;
  check_out: string;
  currency: string;
  gross_cents: number;
  commission_cents: number;
  payment_service_fee_cents: number;
  net_cents: number;
  source_commission_cents: number;
  source_payment_service_fee_cents: number;
  reservation_status: string;
  payment_status: string | null;
  payments_service_provider: string | null;
  reservation_id: string | null;
  unit_id: string | null;
  match_state: MatchState;
  match_candidates: number;
  local_gross_cents: number | null;
  local_currency: string | null;
  gross_delta_cents: number | null;
  gross_state: GrossState;
  matched_at: string | null;
  amendment_state: AmendmentState;
  supersedes_id: string | null;
  ledger_state: LedgerState;
  revenue_transaction_id: string | null;
  commission_transaction_id: string | null;
  fee_transaction_id: string | null;
  import_batch_id: string;
  import_row_id: string | null;
  created_by: string;
  created_at: string;
}

export interface SettlementFilter {
  /** Inclusive start, exclusive end. */
  from?: string | null;
  to?: string | null;
  /** Which date the period applies to. */
  basis?: 'payout' | 'checkout';
  unitId?: string | null;
  payoutId?: string | null;
  state?: SettlementReconState | 'amendment' | null;
}

/** Filter lines for a screen. Amendments awaiting review are included only when asked for; they never enter totals. */
export function filterSettlements(rows: readonly SettlementRow[], f: SettlementFilter): SettlementRow[] {
  const basis = f.basis ?? 'payout';
  return rows.filter((r) => {
    if (f.state === 'amendment') { if (r.amendment_state !== 'conflict') return false; } else if (r.amendment_state !== 'current') return false;
    const d = basis === 'payout' ? r.payout_date : r.check_out;
    if (f.from && d < f.from) return false;
    if (f.to && d >= f.to) return false;
    if (f.unitId && r.unit_id !== f.unitId) return false;
    if (f.payoutId && r.payout_id !== f.payoutId) return false;
    if (f.state && f.state !== 'amendment' && reconState(r.match_state, r.gross_state) !== f.state) return false;
    return true;
  });
}

export interface SettlementSummary {
  lines: number;
  grossCents: number;
  commissionCents: number;
  paymentServiceFeeCents: number;
  totalFeesCents: number;
  netCents: number;
  /** (commission + payment-service fee) / gross, as a ratio; null on zero gross. */
  effectiveFeeRatio: number | null;
  payouts: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  discrepancies: number;
  noLocalGross: number;
  /** Σ statement − local over matched lines with a comparable local gross. */
  grossDeltaCents: number;
  currencies: string[];
}

/** Totals over CURRENT lines only; anything else passed in is ignored, never summed. */
export function summarizeSettlements(rows: readonly SettlementRow[]): SettlementSummary {
  const cur = rows.filter((r) => r.amendment_state === 'current');
  const sum = (k: 'gross_cents' | 'commission_cents' | 'payment_service_fee_cents' | 'net_cents') => cur.reduce((s, r) => s + Number(r[k]), 0);
  const gross = sum('gross_cents');
  const commission = sum('commission_cents');
  const fee = sum('payment_service_fee_cents');
  return {
    lines: cur.length,
    grossCents: gross,
    commissionCents: commission,
    paymentServiceFeeCents: fee,
    totalFeesCents: commission + fee,
    netCents: sum('net_cents'),
    effectiveFeeRatio: gross !== 0 ? (commission + fee) / gross : null,
    payouts: new Set(cur.map((r) => r.payout_id)).size,
    matched: cur.filter((r) => r.match_state === 'matched').length,
    unmatched: cur.filter((r) => r.match_state === 'unmatched').length,
    ambiguous: cur.filter((r) => r.match_state === 'ambiguous').length,
    discrepancies: cur.filter((r) => r.match_state === 'matched' && r.gross_state === 'discrepancy').length,
    noLocalGross: cur.filter((r) => r.match_state === 'matched' && r.gross_state === 'no_local_gross').length,
    grossDeltaCents: cur.reduce((s, r) => s + (r.gross_delta_cents === null ? 0 : Number(r.gross_delta_cents)), 0),
    currencies: Array.from(new Set(cur.map((r) => r.currency))).sort(),
  };
}

/** Effective fee as a percentage with exact integer inputs; formatting is the caller's. */
export function effectiveFeePercent(s: Pick<SettlementSummary, 'commissionCents' | 'paymentServiceFeeCents' | 'grossCents'>): number | null {
  return s.grossCents !== 0 ? ((s.commissionCents + s.paymentServiceFeeCents) / s.grossCents) * 100 : null;
}

export interface PayoutGroup {
  payoutId: string;
  /** The payout date the lines agree on; `dateConflict` when they do not. */
  payoutDate: string;
  dateConflict: boolean;
  currency: string;
  lines: number;
  grossCents: number;
  commissionCents: number;
  paymentServiceFeeCents: number;
  netCents: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  discrepancies: number;
  state: 'reconciled' | 'attention';
  bookingNumbers: string[];
}

/**
 * Group current lines by payout ID. Five lines under three payout IDs are
 * three payouts. The group's net is what Booking.com says it transferred;
 * it is the one number a bank receipt is reconciled against.
 */
export function groupPayouts(rows: readonly SettlementRow[]): PayoutGroup[] {
  const groups = new Map<string, SettlementRow[]>();
  for (const r of rows) {
    if (r.amendment_state !== 'current') continue;
    const k = `${r.provider}|${r.payout_id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return Array.from(groups.values()).map((g) => {
    const s = summarizeSettlements(g);
    const dates = Array.from(new Set(g.map((r) => r.payout_date))).sort();
    const attention = s.unmatched + s.ambiguous + s.discrepancies + s.noLocalGross > 0 || dates.length > 1 || s.currencies.length > 1;
    return {
      payoutId: g[0].payout_id, payoutDate: dates[dates.length - 1], dateConflict: dates.length > 1, currency: s.currencies.join('/'),
      lines: g.length, grossCents: s.grossCents, commissionCents: s.commissionCents, paymentServiceFeeCents: s.paymentServiceFeeCents, netCents: s.netCents,
      matched: s.matched, unmatched: s.unmatched, ambiguous: s.ambiguous, discrepancies: s.discrepancies,
      state: attention ? 'attention' : 'reconciled', bookingNumbers: g.map((r) => r.booking_number).sort(),
    } satisfies PayoutGroup;
  }).sort((a, b) => b.payoutDate.localeCompare(a.payoutDate) || a.payoutId.localeCompare(b.payoutId));
}

/* ── Staged preview (before commit) ──────────────────────────────────── */

export interface StagedSettlementLike {
  bookingNumber: string;
  payoutId: string;
  payoutDate: string;
  currency: string;
  grossCents: number;
  commissionCents: number;
  paymentServiceFeeCents: number;
  netCents: number;
}

export interface PreviewLine<T extends StagedSettlementLike = StagedSettlementLike> {
  line: T;
  match: MatchResult;
  gross: GrossComparison;
  state: SettlementReconState;
}

/** The preview a person sees before committing: the same rules the commit applies, against the reservations as they are now. */
export function previewSettlements<T extends StagedSettlementLike>(lines: readonly T[], reservations: readonly ReservationCandidate[], toleranceCents = 0): { lines: Array<PreviewLine<T>>; summary: SettlementSummary; payouts: PayoutGroup[] } {
  const byRef = new Map<string, ReservationCandidate[]>();
  for (const r of reservations) {
    const k = normaliseReference(r.channel_reference);
    if (k) byRef.set(k, [...(byRef.get(k) ?? []), r]);
  }
  const out = lines.map((line) => {
    const match = matchReservation(line.bookingNumber, byRef.get(line.bookingNumber.trim()) ?? []);
    const gross = compareGross(line.grossCents, line.currency, match.reservation, toleranceCents);
    return { line, match, gross, state: reconState(match.state, gross.state) };
  });
  const asRows = out.map((p, i) => ({
    id: String(i), provider: 'booking_com', identity_key: '', content_sha256: '', row_type: 'reservation', booking_number: p.line.bookingNumber, payout_id: p.line.payoutId,
    payout_date: p.line.payoutDate, check_in: '', check_out: '', currency: p.line.currency, gross_cents: p.line.grossCents, commission_cents: p.line.commissionCents,
    payment_service_fee_cents: p.line.paymentServiceFeeCents, net_cents: p.line.netCents, source_commission_cents: -p.line.commissionCents,
    source_payment_service_fee_cents: -p.line.paymentServiceFeeCents, reservation_status: '', payment_status: null, payments_service_provider: null,
    reservation_id: p.match.reservation?.id ?? null, unit_id: p.match.reservation?.unit_id ?? null, match_state: p.match.state, match_candidates: p.match.candidates,
    local_gross_cents: p.gross.localGrossCents, local_currency: p.gross.localCurrency, gross_delta_cents: p.gross.deltaCents, gross_state: p.gross.state, matched_at: null,
    amendment_state: 'current', supersedes_id: null, ledger_state: 'pending', revenue_transaction_id: null, commission_transaction_id: null, fee_transaction_id: null,
    import_batch_id: '', import_row_id: null, created_by: '', created_at: '',
  } satisfies SettlementRow));
  return { lines: out, summary: summarizeSettlements(asRows), payouts: groupPayouts(asRows) };
}
