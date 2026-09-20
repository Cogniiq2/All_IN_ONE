/**
 * ══════════════════════════════════════════════════════════════════════════
 * INVOICING FOUNDATION — refuses without tax configuration; exact arithmetic
 * once configured; never a guessed rate.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, invoiceReadiness, invoiceTaxConfiguration, InvoiceNotReadyError, prepareInvoiceDraft, splitGross, type InvoiceSource } from '@/lib/invoicing/contract';

const SOURCE: InvoiceSource = {
  reference: 'BLG-AAAAAA', unitSlug: 'schulstrasse-i', checkIn: '2026-11-14', checkOut: '2026-11-16', nights: 2, currency: 'EUR',
  paidAmountCents: 32_500,
  components: [
    { code: 'accommodation', label: { de: 'Unterkunft · 2 Nächte', en: 'Accommodation · 2 nights' }, amountCents: 28_000, mandatory: true, taxCategory: 'accommodation' },
    { code: 'cleaning', label: { de: 'Endreinigung', en: 'Final cleaning' }, amountCents: 4_500, mandatory: true, taxCategory: 'service' },
    { code: 'city_tax', label: { de: 'Kurtaxe vor Ort', en: 'City tax on site' }, amountCents: 600, mandatory: false, taxCategory: 'city_tax' },
  ],
  guest: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'GB' },
};

describe('readiness', () => {
  it('an empty environment blocks on every undecided fact and defaults nothing', () => {
    const r = invoiceReadiness(invoiceTaxConfiguration({}));
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual([
      'SMALL_BUSINESS_STATUS_UNDECIDED',
      'VAT_RATE_ACCOMMODATION_UNDECIDED',
      'VAT_RATE_SERVICE_UNDECIDED',
      'VAT_RATE_CITY_TAX_UNDECIDED',
      'ISSUER_LEGAL_NAME_MISSING',
      'ISSUER_ADDRESS_MISSING',
      'ISSUER_TAX_ID_MISSING',
      'SERIES_MISSING',
    ]);
  });

  it('a small business needs no rates but still needs an issuer and a series', () => {
    const r = invoiceReadiness(invoiceTaxConfiguration({ INVOICE_SMALL_BUSINESS: 'true', INVOICE_ISSUER_LEGAL_NAME: 'BoLaGio GmbH', INVOICE_ISSUER_ADDRESS: 'Schulstraße, 95444 Bayreuth', INVOICE_ISSUER_TAX_ID: 'DE000000000', INVOICE_SERIES: 'BLG-2026' }));
    expect(r).toEqual({ ready: true, blockers: [] });
  });

  it('an out-of-range or non-numeric rate counts as undecided', () => {
    const c = invoiceTaxConfiguration({ INVOICE_VAT_ACCOMMODATION_PERCENT: '107', INVOICE_VAT_SERVICE_PERCENT: 'seven' });
    expect(c.ratesPercent.accommodation).toBeUndefined();
    expect(c.ratesPercent.service).toBeUndefined();
  });
});

describe('the draft', () => {
  const READY = invoiceTaxConfiguration({
    INVOICE_SMALL_BUSINESS: 'false', INVOICE_VAT_ACCOMMODATION_PERCENT: '7', INVOICE_VAT_SERVICE_PERCENT: '19', INVOICE_VAT_CITY_TAX_PERCENT: '0',
    INVOICE_ISSUER_LEGAL_NAME: 'BoLaGio GmbH', INVOICE_ISSUER_ADDRESS: 'Schulstraße, 95444 Bayreuth', INVOICE_ISSUER_TAX_ID: 'DE000000000', INVOICE_SERIES: 'BLG-2026',
  });

  it('refuses without configuration, naming the blockers', () => {
    expect(() => prepareInvoiceDraft(SOURCE, invoiceTaxConfiguration({}))).toThrow(InvoiceNotReadyError);
    try { prepareInvoiceDraft(SOURCE, invoiceTaxConfiguration({})); } catch (e) { expect((e as InvoiceNotReadyError).blockers).toContain('VAT_RATE_ACCOMMODATION_UNDECIDED'); }
  });

  it('invoices the mandatory lines gross as charged, split to the cent, with no number yet', () => {
    const d = prepareInvoiceDraft(SOURCE, READY);
    expect(d.number).toBeNull();
    expect(d.lines.map((l) => l.code)).toEqual(['accommodation', 'cleaning']);
    expect(d.totalGrossCents).toBe(32_500);
    expect(d.totalNetCents + d.totalVatCents).toBe(32_500);
    expect(d.lines[0]).toMatchObject({ vatRatePercent: 7, grossCents: 28_000, netCents: 26_168, vatCents: 1_832 });
    expect(d.lines[1]).toMatchObject({ vatRatePercent: 19, grossCents: 4_500, netCents: 3_782, vatCents: 718 });
    expect(d.smallBusinessNotice).toBe(false);
    expect(d.recipient).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', country: 'GB' });
  });

  it('a small business shows no VAT and carries the § 19 notice', () => {
    const d = prepareInvoiceDraft(SOURCE, invoiceTaxConfiguration({ INVOICE_SMALL_BUSINESS: 'true', INVOICE_ISSUER_LEGAL_NAME: 'x', INVOICE_ISSUER_ADDRESS: 'y', INVOICE_ISSUER_TAX_ID: 'z', INVOICE_SERIES: 'BLG-2026' }));
    expect(d.smallBusinessNotice).toBe(true);
    expect(d.lines.every((l) => l.vatRatePercent === null && l.vatCents === 0)).toBe(true);
  });

  it('a line of unknown tax category is refused rather than guessed', () => {
    const src = { ...SOURCE, components: [{ ...SOURCE.components[0], taxCategory: 'unknown' as const }], paidAmountCents: 28_000 };
    expect(() => prepareInvoiceDraft(src, READY)).toThrow(InvoiceNotReadyError);
  });

  it('lines that do not add up to the capture are refused', () => {
    expect(() => prepareInvoiceDraft({ ...SOURCE, paidAmountCents: 32_400 }, READY)).toThrow(/do not add up/);
  });
});

describe('arithmetic and numbering', () => {
  it('splits gross so that net + VAT equals gross for every rate', () => {
    for (const gross of [1, 99, 100, 4_500, 28_000, 123_457]) {
      for (const rate of [0, 7, 19, null]) {
        const { netCents, vatCents } = splitGross(gross, rate);
        expect(netCents + vatCents).toBe(gross);
      }
    }
  });
  it('formats a gapless number and refuses a non-positive counter', () => {
    expect(formatInvoiceNumber('BLG-2026', 42)).toBe('BLG-2026-000042');
    expect(() => formatInvoiceNumber('BLG-2026', 0)).toThrow();
  });
});
