/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATEV — the mapping layer, behind an explicit validation gate.
 *
 * What exists: a mapping from BoLaGio categories and tax codes to SKR03 /
 * SKR04 account PROPOSALS and DATEV BU-Schlüssel, plus a builder for the
 * row shape of a DATEV-Format "Buchungsstapel" (EXTF, format version 700,
 * category 21). What does NOT exist: a file this code will call DATEV-valid.
 *
 * Why the gate: the current DATEV-Format specification (header record with
 * consultant/client numbers, fiscal-year start, account length, the exact
 * 125-field record layout, encoding and date formats) must be verified
 * against DATEV's published document for the version in use, and the file
 * must be test-imported into the adviser's DATEV before it is trusted. Until
 * `FINANCE_DATEV_EXPORT_ENABLED=true` AND the adviser has confirmed the
 * account mapping (`datev_confirmed` on each category), `buildBuchungsstapel`
 * refuses and says why. The refusal is the feature.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { CategoryRow, LineRow, TransactionRow } from '@/lib/finance/rows';

export const DATEV_FORMAT_VERSION = '700';
export const DATEV_STATUS = 'mapping layer only — export gated until validated against the current DATEV-Format specification and a test import at the adviser';

/** Proposed BU-Schlüssel per tax code (SKR03/04 automatic accounts differ; the adviser confirms). */
export const BU_KEY_PROPOSAL: Record<string, { bu: string; note: string }> = {
  DE_STANDARD: { bu: '9', note: '19 % Vorsteuer / Umsatzsteuer (automatic account or BU 9)' },
  DE_REDUCED: { bu: '8', note: '7 % Vorsteuer / Umsatzsteuer' },
  DE_ACCOMMODATION_REDUCED: { bu: '8', note: '7 % Umsatzsteuer (Beherbergung)' },
  DE_FOOD_REDUCED: { bu: '8', note: '7 % (Anlage 2)' },
  DE_BEVERAGE_STANDARD: { bu: '9', note: '19 %' },
  DE_ANCILLARY_STANDARD: { bu: '9', note: '19 %' },
  DE_REVERSE_CHARGE: { bu: '94', note: '§ 13b UStG 19 % with input-VAT deduction (BU 94 in SKR03/04; confirm)' },
  DE_EXEMPT: { bu: '', note: 'steuerfrei ohne Vorsteuerabzug — account decides' },
  DE_OUTSIDE_SCOPE: { bu: '', note: 'nicht steuerbar' },
  DE_REVIEW_REQUIRED: { bu: '', note: 'NOT EXPORTABLE — classify first' },
  DE_ANCILLARY_REVIEW: { bu: '', note: 'NOT EXPORTABLE — classify first' },
};

export interface DatevRowProposal {
  umsatz: string;
  sollHaben: 'S' | 'H';
  konto: string;
  gegenkonto: string;
  buSchluessel: string;
  belegdatum: string; // DDMM
  belegfeld1: string;
  buchungstext: string;
  kost1: string;
  /** Why this row cannot be exported yet, if anything. */
  blockers: string[];
}

export interface DatevGate {
  enabled: boolean;
  reasons: string[];
}

export function datevGate(input: { flagEnabled: boolean; categories: readonly CategoryRow[]; usedCategories: ReadonlySet<string>; skr: 'SKR03' | 'SKR04' | null }): DatevGate {
  const reasons: string[] = [];
  if (!input.flagEnabled) reasons.push('FINANCE_DATEV_EXPORT_ENABLED is not set: the DATEV-Format has not been validated against the current specification and a test import.');
  if (!input.skr) reasons.push('No Kontenrahmen (SKR03/SKR04) configured (FINANCE_DATEV_SKR).');
  const unconfirmed = input.categories.filter((c) => input.usedCategories.has(c.code) && (!c.datev_confirmed || !(input.skr === 'SKR04' ? c.datev_account_skr04 : c.datev_account_skr03)));
  if (unconfirmed.length > 0) reasons.push(`${unconfirmed.length} categor${unconfirmed.length === 1 ? 'y has' : 'ies have'} no adviser-confirmed account: ${unconfirmed.map((c) => c.code).join(', ')}.`);
  return { enabled: reasons.length === 0, reasons };
}

/** Build row proposals for the accountant's review. Never a file until the gate is open. */
export function proposeDatevRows(lines: ReadonlyArray<LineRow & { transaction: TransactionRow }>, categories: readonly CategoryRow[], skr: 'SKR03' | 'SKR04'): DatevRowProposal[] {
  return lines.map((l) => {
    const cat = categories.find((c) => c.code === l.category);
    const account = skr === 'SKR04' ? cat?.datev_account_skr04 : cat?.datev_account_skr03;
    const bu = BU_KEY_PROPOSAL[l.tax_code];
    const blockers: string[] = [];
    if (!account) blockers.push(`no ${skr} account for ${l.category}`);
    if (!cat?.datev_confirmed) blockers.push('account not confirmed by the adviser');
    if (!bu || l.tax_code.includes('REVIEW')) blockers.push('tax code not exportable');
    if (l.transaction.document_state === 'missing') blockers.push('document missing');
    const d = l.transaction.booked_on;
    return {
      umsatz: (Math.abs(l.gross_cents) / 100).toFixed(2).replace('.', ','),
      sollHaben: (l.transaction.kind === 'revenue' ? l.gross_cents >= 0 : l.gross_cents < 0) ? 'H' : 'S',
      konto: account ?? '',
      gegenkonto: '',
      buSchluessel: bu?.bu ?? '',
      belegdatum: `${d.slice(8, 10)}${d.slice(5, 7)}`,
      belegfeld1: (l.transaction.supplier_invoice_no ?? l.transaction.booking_reference ?? '').slice(0, 36),
      buchungstext: `${l.transaction.counterparty_label ?? ''} ${l.description ?? l.transaction.description}`.trim().slice(0, 60),
      kost1: (l.unit_id ?? l.transaction.unit_id ?? '').slice(0, 8),
      blockers,
    };
  });
}
