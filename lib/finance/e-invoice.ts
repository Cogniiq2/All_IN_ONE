/**
 * ══════════════════════════════════════════════════════════════════════════
 * E-INVOICE (XRechnung / ZUGFeRD) — the gate, the model, no false claim.
 *
 * Since 1 January 2025 every German business must be able to RECEIVE
 * e-invoices (EN 16931) for domestic B2B supplies (§ 14 Abs. 1, Abs. 2 UStG
 * as amended by the Wachstumschancengesetz); the obligation to ISSUE them
 * phases in from 2027 (prior-year turnover > € 800,000) and 2028 (all).
 * BoLaGio's guests are mostly consumers (B2C) — no e-invoice duty — but a
 * corporate guest with a German business address is B2B.
 *
 * What this module does:
 *   • receive: the document registry accepts XML and PDF/A-3 with embedded
 *     XML, sniffs the format (documents.ts) and keeps the ORIGINAL bytes —
 *     the XML is the invoice, the PDF is a view (§ 14b: keep the original)
 *   • model: `EInvoiceModel` is the EN 16931 core subset an invoice draft
 *     maps to, so a generator can be added without touching the ledger
 *   • gate: `eInvoiceGate` refuses generation until the validator is wired
 *     to the official KoSIT schematron and the flag is set
 *
 * What it does NOT do: generate a file it calls XRechnung- or
 * ZUGFeRD-compliant. There is no schematron here; a file produced without
 * one would be an invalid invoice with a valid-looking name.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { InvoiceDraft } from '@/lib/finance/invoices';

export const EINVOICE_STANDARDS = {
  xrechnung: { name: 'XRechnung', versionAssumed: '3.0.x', spec: 'https://xeinkauf.de/xrechnung/', note: 'CIUS of EN 16931 for the German public sector; accepted B2B format. Version to be verified before generation.' },
  zugferd: { name: 'ZUGFeRD / Factur-X', versionAssumed: '2.3.x', spec: 'https://www.ferd-net.de/standards/zugferd-2.3', note: 'Profiles EN 16931, EXTENDED and XRECHNUNG satisfy § 14 UStG; MINIMUM and BASIC WL do not.' },
} as const;

export interface EInvoiceModel {
  /** BT-1 */ invoiceNumber: string;
  /** BT-2 */ issueDate: string;
  /** BT-3 */ typeCode: '380' | '381';
  /** BT-5 */ currency: string;
  /** BT-27 / BT-35.. */ seller: { name: string; address: string; vatId: string | null; taxNumber: string | null; country: 'DE' };
  /** BT-44 / BT-50.. */ buyer: { name: string; address: string | null; vatId: string | null; country: string | null };
  /** BT-73/74 */ servicePeriod: { from: string; to: string } | null;
  /** BG-25 */ lines: Array<{ id: string; name: string; quantity: number; unitCode: 'C62' | 'DAY'; netUnitPriceCents: number; netCents: number; vatCategory: 'S' | 'E' | 'AE' | 'O'; ratePercent: number }>;
  /** BG-23 */ vatBreakdown: Array<{ vatCategory: 'S' | 'E' | 'AE' | 'O'; ratePercent: number; taxableCents: number; taxCents: number }>;
  /** BG-22 */ totals: { netCents: number; vatCents: number; grossCents: number; dueCents: number };
}

function vatCategoryFor(taxCode: string): EInvoiceModel['lines'][number]['vatCategory'] {
  if (taxCode === 'DE_EXEMPT') return 'E';
  if (taxCode === 'DE_REVERSE_CHARGE') return 'AE';
  if (taxCode === 'DE_OUTSIDE_SCOPE') return 'O';
  return 'S';
}

/** Map an issued draft to the EN 16931 core model. Pure; makes no compliance claim. */
export function toEInvoiceModel(draft: InvoiceDraft, issued: { number: string; issueDate: string; seller: EInvoiceModel['seller'] }): EInvoiceModel {
  const lines = draft.lines.map((l) => ({ id: String(l.lineNo), name: l.description, quantity: l.quantity, unitCode: l.category === 'accommodation_revenue' ? ('DAY' as const) : ('C62' as const), netUnitPriceCents: Math.round(l.netCents / Math.max(1, l.quantity)), netCents: l.netCents, vatCategory: vatCategoryFor(l.taxCode), ratePercent: l.rateBp / 100 }));
  const breakdown = new Map<string, { vatCategory: EInvoiceModel['vatBreakdown'][number]['vatCategory']; ratePercent: number; taxableCents: number; taxCents: number }>();
  for (const l of draft.lines) {
    const key = `${vatCategoryFor(l.taxCode)}:${l.rateBp}`;
    const cur = breakdown.get(key) ?? { vatCategory: vatCategoryFor(l.taxCode), ratePercent: l.rateBp / 100, taxableCents: 0, taxCents: 0 };
    cur.taxableCents += l.netCents;
    cur.taxCents += l.vatCents;
    breakdown.set(key, cur);
  }
  return {
    invoiceNumber: issued.number, issueDate: issued.issueDate, typeCode: draft.kind === 'credit_note' ? '381' : '380', currency: draft.currency,
    seller: issued.seller,
    buyer: { name: draft.recipient.company ?? draft.recipient.name, address: draft.recipient.address, vatId: draft.recipient.vatId, country: draft.recipient.country },
    servicePeriod: draft.serviceFrom && draft.serviceTo ? { from: draft.serviceFrom, to: draft.serviceTo } : null,
    lines, vatBreakdown: Array.from(breakdown.values()),
    totals: { netCents: draft.netCents, vatCents: draft.vatCents, grossCents: draft.grossCents, dueCents: draft.grossCents },
  };
}

export interface EInvoiceGate { enabled: boolean; reasons: string[] }

export function eInvoiceGate(flagEnabled: boolean, validatorConfigured: boolean): EInvoiceGate {
  const reasons: string[] = [];
  if (!validatorConfigured) reasons.push('No EN 16931 / XRechnung validator (KoSIT schematron) is configured; a generated file could not be proven valid.');
  if (!flagEnabled) reasons.push('FINANCE_EINVOICE_GENERATION_ENABLED is not set.');
  return { enabled: reasons.length === 0, reasons };
}

/** Whether a recipient is B2B for the e-invoice duty (German business recipient). */
export function isDomesticB2B(recipient: InvoiceDraft['recipient']): boolean {
  return Boolean(recipient.company || recipient.vatId) && (recipient.country ?? 'DE') === 'DE';
}
