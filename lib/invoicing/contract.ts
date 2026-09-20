/**
 * ══════════════════════════════════════════════════════════════════════════
 * INVOICING — the foundation, and nothing that guesses.
 *
 * A German invoice (§ 14 UStG) needs facts this repository does not hold:
 * the VAT treatment of accommodation and of each ancillary line, whether the
 * company is a small business under § 19 UStG, the issuer's tax number or
 * VAT id, and the numbering series the accountant expects. None of these is
 * inferred from a booking, a Beds24 fee name or a default. Until they are
 * configured, `invoiceReadiness()` says exactly what is missing and
 * `prepareInvoiceDraft()` refuses.
 *
 * What IS decided here, because it is arithmetic and not tax law:
 *   • the booking's quote lines are the invoice lines, in the booking's
 *     currency, gross as charged — a guest is invoiced what they paid;
 *   • a gapless sequence per series (`bolagio_next_invoice_number`), drawn
 *     only at issue time (`lib/invoicing/numbering.ts`), never at draft time;
 *   • gross-to-net splitting once a rate is configured: net = round(gross /
 *     (1 + rate)), VAT = gross − net, so the invoice total equals the capture
 *     to the cent.
 *
 * Nothing here writes, sends, renders a PDF or touches the payment provider.
 * The `invoice.required` outbox event (emitted once per confirmed, paid
 * direct booking) is the hook the automation platform uses to ask for a
 * draft once this module is configured.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { QuoteComponent } from '@/lib/booking/types';

export type TaxCategory = NonNullable<QuoteComponent['taxCategory']>;

export interface InvoiceTaxConfiguration {
  /** Percent, e.g. 7 for the reduced German rate. Null when not decided. */
  ratesPercent: Partial<Record<TaxCategory, number>>;
  /** § 19 UStG small-business status. Null when not decided. */
  smallBusiness: boolean | null;
  issuer: {
    legalName: string | null;
    address: string | null;
    /** Steuernummer or USt-IdNr. Null when not supplied. */
    taxId: string | null;
  };
  /** The series invoice numbers are drawn from, e.g. `BLG-2026`. */
  series: string | null;
}

export type ReadinessBlocker =
  | 'VAT_RATE_ACCOMMODATION_UNDECIDED'
  | 'VAT_RATE_SERVICE_UNDECIDED'
  | 'VAT_RATE_CITY_TAX_UNDECIDED'
  | 'SMALL_BUSINESS_STATUS_UNDECIDED'
  | 'ISSUER_LEGAL_NAME_MISSING'
  | 'ISSUER_ADDRESS_MISSING'
  | 'ISSUER_TAX_ID_MISSING'
  | 'SERIES_MISSING';

export interface InvoiceReadiness {
  ready: boolean;
  blockers: ReadinessBlocker[];
}

function percent(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

/**
 * Read the configuration from the environment. Every value is optional and
 * absence is reported, never defaulted: a missing rate is a missing rate.
 */
export function invoiceTaxConfiguration(env: Record<string, string | undefined> = process.env): InvoiceTaxConfiguration {
  const small = env.INVOICE_SMALL_BUSINESS;
  return {
    ratesPercent: {
      accommodation: percent(env.INVOICE_VAT_ACCOMMODATION_PERCENT),
      service: percent(env.INVOICE_VAT_SERVICE_PERCENT),
      city_tax: percent(env.INVOICE_VAT_CITY_TAX_PERCENT),
      deposit: percent(env.INVOICE_VAT_DEPOSIT_PERCENT),
    },
    smallBusiness: small === 'true' ? true : small === 'false' ? false : null,
    issuer: {
      legalName: env.INVOICE_ISSUER_LEGAL_NAME?.trim() || null,
      address: env.INVOICE_ISSUER_ADDRESS?.trim() || null,
      taxId: env.INVOICE_ISSUER_TAX_ID?.trim() || null,
    },
    series: env.INVOICE_SERIES?.trim() || null,
  };
}

/** What still stands between a booking and an invoice. Empty means ready. */
export function invoiceReadiness(config: InvoiceTaxConfiguration): InvoiceReadiness {
  const blockers: ReadinessBlocker[] = [];
  if (config.smallBusiness === null) blockers.push('SMALL_BUSINESS_STATUS_UNDECIDED');
  // A small business under § 19 UStG shows no VAT at all; rates are then not needed.
  if (config.smallBusiness !== true) {
    if (config.ratesPercent.accommodation === undefined) blockers.push('VAT_RATE_ACCOMMODATION_UNDECIDED');
    if (config.ratesPercent.service === undefined) blockers.push('VAT_RATE_SERVICE_UNDECIDED');
    if (config.ratesPercent.city_tax === undefined) blockers.push('VAT_RATE_CITY_TAX_UNDECIDED');
  }
  if (!config.issuer.legalName) blockers.push('ISSUER_LEGAL_NAME_MISSING');
  if (!config.issuer.address) blockers.push('ISSUER_ADDRESS_MISSING');
  if (!config.issuer.taxId) blockers.push('ISSUER_TAX_ID_MISSING');
  if (!config.series) blockers.push('SERIES_MISSING');
  return { ready: blockers.length === 0, blockers };
}

export interface InvoiceLine {
  code: string;
  label: string;
  taxCategory: TaxCategory;
  grossCents: number;
  /** Null under § 19 UStG (no VAT shown). */
  vatRatePercent: number | null;
  netCents: number;
  vatCents: number;
}

export interface InvoiceDraft {
  reference: string;
  series: string;
  currency: string;
  recipient: { name: string; email: string; country: string | null };
  stay: { unitSlug: string; checkIn: string; checkOut: string; nights: number };
  lines: InvoiceLine[];
  totalGrossCents: number;
  totalNetCents: number;
  totalVatCents: number;
  /** The § 19 UStG notice must appear on the document when true. */
  smallBusinessNotice: boolean;
  /** Not drawn yet: numbers are allocated at issue time, gaplessly. */
  number: null;
}

export class InvoiceNotReadyError extends Error {
  constructor(readonly blockers: ReadinessBlocker[]) {
    super(`Invoicing is not configured: ${blockers.join(', ')}`);
    this.name = 'InvoiceNotReadyError';
  }
}

export interface InvoiceSource {
  reference: string;
  unitSlug: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  /** The amount actually captured; the lines must add up to it. */
  paidAmountCents: number;
  components: QuoteComponent[];
  guest: { firstName: string; lastName: string; email: string; country: string | null };
}

/** net = round(gross / (1 + r)); VAT is the remainder, so lines add up to the cent. */
export function splitGross(grossCents: number, ratePercent: number | null): { netCents: number; vatCents: number } {
  if (ratePercent === null || ratePercent === 0) return { netCents: grossCents, vatCents: 0 };
  const netCents = Math.round(grossCents / (1 + ratePercent / 100));
  return { netCents, vatCents: grossCents - netCents };
}

/**
 * Build the draft, or refuse. The draft carries no number: the sequence is
 * drawn when the document is issued, so an abandoned draft leaves no gap.
 */
export function prepareInvoiceDraft(source: InvoiceSource, config: InvoiceTaxConfiguration): InvoiceDraft {
  const readiness = invoiceReadiness(config);
  if (!readiness.ready) throw new InvoiceNotReadyError(readiness.blockers);

  const mandatory = source.components.filter((c) => c.mandatory !== false);
  const lines: InvoiceLine[] = mandatory.map((c) => {
    const category: TaxCategory = c.taxCategory ?? 'unknown';
    if (category === 'unknown' && config.smallBusiness !== true) {
      throw new InvoiceNotReadyError(['VAT_RATE_SERVICE_UNDECIDED']);
    }
    const rate = config.smallBusiness === true ? null : (config.ratesPercent[category] ?? null);
    if (rate === null && config.smallBusiness !== true) throw new InvoiceNotReadyError(['VAT_RATE_SERVICE_UNDECIDED']);
    const split = splitGross(c.amountCents, rate);
    return { code: c.code, label: c.label.de, taxCategory: category, grossCents: c.amountCents, vatRatePercent: rate, ...split };
  });

  const totalGrossCents = lines.reduce((n, l) => n + l.grossCents, 0);
  if (totalGrossCents !== source.paidAmountCents) {
    throw new Error(`Invoice lines (${totalGrossCents}) do not add up to the captured amount (${source.paidAmountCents})`);
  }
  return {
    reference: source.reference,
    series: config.series as string,
    currency: source.currency,
    recipient: { name: `${source.guest.firstName} ${source.guest.lastName}`.trim(), email: source.guest.email, country: source.guest.country },
    stay: { unitSlug: source.unitSlug, checkIn: source.checkIn, checkOut: source.checkOut, nights: source.nights },
    lines,
    totalGrossCents,
    totalNetCents: lines.reduce((n, l) => n + l.netCents, 0),
    totalVatCents: lines.reduce((n, l) => n + l.vatCents, 0),
    smallBusinessNotice: config.smallBusiness === true,
    number: null,
  };
}

/** `BLG-2026-000042`: the series, then a zero-padded gapless counter. */
export function formatInvoiceNumber(series: string, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) throw new Error('invoice counter must be a positive integer');
  return `${series}-${String(counter).padStart(6, '0')}`;
}
