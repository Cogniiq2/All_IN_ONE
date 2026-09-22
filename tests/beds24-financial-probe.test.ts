/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FINANCIAL SHAPE PROBE — the three rules, proven individually.
 *
 * The route test proves the boundary. This proves the filter itself, which is
 * where the guarantee actually lives: an allow list for values, a forbidden
 * list for keys, and a final sweep that catches what the other two miss.
 *
 * The fixture is a Beds24 booking whose EVERY field carries something a guest
 * would not want published, including financial fields deliberately poisoned
 * with a guest's surname — because that is the failure mode a categoriser
 * alone cannot stop.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  categorise,
  collectPiiNeedles,
  describeFinancialShape,
  redact,
  reportableValue,
  safeFinancialReport,
} from '@/lib/integrations/beds24/financial-probe';

/** Personal data. None of it may appear in any report, under any key. */
const PII = {
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika.mustermann@example.com',
  phone: '+491510000000',
  address: 'Maximilianstrasse 14',
  city: 'Bayreuth',
  postcode: '95444',
  comments: 'Guest asked for a late check-in, call Erika on arrival',
  apiReference: '4123456789',
  reference: 'BLG-AB12CD',
  cardNumber: '4111111111111111',
  cardHolder: 'ERIKA MUSTERMANN',
  cvv: '737',
};

/** A booking as Beds24 might answer it, with invoice items included. */
const BOOKING: Record<string, unknown> = {
  id: 76543210,
  propertyId: 354659,
  roomId: 731147,
  status: 'confirmed',
  arrival: '2026-04-02',
  departure: '2026-04-06',
  numAdult: 2,
  numChild: 0,
  price: '480.00',
  currency: 'EUR',
  commission: '72.00',
  commissionPercent: 15,
  taxAmount: 33.6,
  cityTax: '8.00',
  cleaningFee: '60.00',
  paymentStatus: 'partiallyPaid',
  deposit: 0,
  balanceDue: '480.00',
  payoutAmount: '408.00',
  apiSourceId: 19,
  apiSource: 'booking',
  channel: 'Booking.com',
  ...PII,
  invoiceItems: [
    { id: 1, type: 'charge', amount: '480.00', qty: 1, description: `Room charge for ${PII.lastName}` },
    { id: 2, type: 'payment', amount: '-480.00', qty: 1, description: 'Virtual card' },
  ],
};

const serialise = (value: unknown) => JSON.stringify(value);

describe('categorise', () => {
  it('sorts the financial keys into the categories the finance work asked for', () => {
    expect(categorise('price')).toBe('price');
    expect(categorise('totalAmount')).toBe('price');
    expect(categorise('currency')).toBe('currency');
    expect(categorise('commission')).toBe('commission');
    expect(categorise('commissionPercent')).toBe('commission');
    expect(categorise('taxAmount')).toBe('tax');
    expect(categorise('cityTax')).toBe('tax');
    expect(categorise('cleaningFee')).toBe('fee');
    expect(categorise('paymentStatus')).toBe('payment');
    expect(categorise('balanceDue')).toBe('payment');
    expect(categorise('payoutAmount')).toBe('payout');
    expect(categorise('discountAmount')).toBe('discount');
  });

  it('puts a commission before an amount, and a tax before an amount', () => {
    // `commissionAmount` is a commission; reading it as a generic price would
    // add the channel's cut to BoLaGio's revenue.
    expect(categorise('commissionAmount')).toBe('commission');
    expect(categorise('vatAmount')).toBe('tax');
  });

  it('refuses to categorise a person-shaped key, whatever else it contains', () => {
    // Each of these would otherwise match a financial pattern.
    expect(categorise('guestPaymentCardNumber')).toBeUndefined();
    expect(categorise('invoiceeName')).toBeUndefined();
    expect(categorise('priceComment')).toBeUndefined();
    expect(categorise('feeDescription')).toBeUndefined();
    expect(categorise('payerIban')).toBeUndefined();
  });

  it('says nothing about a key that is not financial', () => {
    expect(categorise('arrival')).toBeUndefined();
    expect(categorise('roomId')).toBeUndefined();
  });
});

describe('reportableValue', () => {
  it('passes the shapes money arrives in', () => {
    expect(reportableValue(480)).toBe(480);
    expect(reportableValue('480.00')).toBe('480.00');
    expect(reportableValue('-72.5')).toBe('-72.5');
    expect(reportableValue('EUR')).toBe('EUR');
    expect(reportableValue('partiallyPaid')).toBe('partiallyPaid');
    expect(reportableValue(true)).toBe(true);
  });

  it('refuses anything that could be a sentence, an address or an object', () => {
    expect(reportableValue('Erika Mustermann')).toBeUndefined();
    expect(reportableValue('erika.mustermann@example.com')).toBeUndefined();
    expect(reportableValue('Maximilianstrasse 14')).toBeUndefined();
    expect(reportableValue('Guest asked for a late check-in')).toBeUndefined();
    expect(reportableValue({ a: 1 })).toBeUndefined();
    expect(reportableValue([1, 2])).toBeUndefined();
    expect(reportableValue(null)).toBeUndefined();
    expect(reportableValue('')).toBeUndefined();
    expect(reportableValue(Number.NaN)).toBeUndefined();
  });

  it('refuses a token longer than an enum ever is', () => {
    expect(reportableValue('a'.repeat(33))).toBeUndefined();
  });
});

describe('collectPiiNeedles', () => {
  it('collects the values and the individual words of person-shaped fields', () => {
    const needles = collectPiiNeedles(BOOKING);
    expect(needles.has('mustermann')).toBe(true);
    expect(needles.has('erika')).toBe(true);
    expect(needles.has('bayreuth')).toBe(true);
    expect(needles.has('maximilianstrasse')).toBe(true);
    expect(needles.has('erika.mustermann@example.com')).toBe(true);
  });

  it('reaches into nested invoice items, as a whole string only', () => {
    const needles = collectPiiNeedles({ invoiceItems: [{ description: 'Room charge for Mustermann' }] });
    expect(needles.has('room charge for mustermann')).toBe(true);
    // Not word by word: `room`, `charge` and `for` would go on to redact
    // `roomId`, the item type `charge` and half the field names in the report.
    expect(needles.has('room')).toBe(false);
    expect(needles.has('charge')).toBe(false);
  });

  it('ignores a short value that would redact half the answer', () => {
    // A two-character country code must not become a needle; it would match
    // every second word in the report.
    expect(collectPiiNeedles({ country: 'DE' }).size).toBe(0);
  });

  it('never makes a needle of a short bare number, which would eat the money', () => {
    // A postcode of `8000` inside a payout of `18000.00` would redact the one
    // number this endpoint exists to read.
    expect(collectPiiNeedles({ postcode: '8000' }).size).toBe(0);
    // A long digit string is still a needle: a card or a phone number.
    expect(collectPiiNeedles({ cardNumber: '4111111111111111' }).size).toBe(1);
  });
});

describe('redact', () => {
  it('replaces a value that carries a needle, and a key that does too', () => {
    const out = redact({ note: 'paid by Mustermann', mustermannField: 1 }, new Set(['mustermann']));
    expect(out).toEqual({ note: REDACTED, [REDACTED]: 1 });
  });

  it('leaves a report alone when there is nothing to find', () => {
    const report = { a: 'EUR', b: [1, 2], c: { d: true } };
    expect(redact(report, new Set())).toEqual(report);
    expect(redact(report, new Set(['mustermann']))).toEqual(report);
  });
});

describe('describeFinancialShape', () => {
  const report = describeFinancialShape(BOOKING);

  it('names the financial fields with their values and categories', () => {
    const byField = Object.fromEntries(report.financialFields.map((f) => [f.field, f]));
    expect(byField.price).toMatchObject({ category: 'price', value: '480.00', type: 'string' });
    expect(byField.commission).toMatchObject({ category: 'commission', value: '72.00' });
    expect(byField.commissionPercent).toMatchObject({ category: 'commission', value: 15 });
    expect(byField.taxAmount).toMatchObject({ category: 'tax', value: 33.6 });
    expect(byField.cityTax).toMatchObject({ category: 'tax', value: '8.00' });
    expect(byField.cleaningFee).toMatchObject({ category: 'fee', value: '60.00' });
    expect(byField.paymentStatus).toMatchObject({ category: 'payment', value: 'partiallyPaid' });
    expect(byField.payoutAmount).toMatchObject({ category: 'payout', value: '408.00' });
    expect(byField.currency).toMatchObject({ category: 'currency', value: 'EUR' });
  });

  it('lists the non-financial fields by name and type only, never by value', () => {
    const arrival = report.otherFields.find((f) => f.field === 'arrival');
    expect(arrival).toEqual({ field: 'arrival', type: 'string' });
    expect(arrival).not.toHaveProperty('value');
  });

  it('drops the forbidden keys entirely and reports only how many there were', () => {
    expect(report.fieldNames).not.toContain('email');
    expect(report.fieldNames).not.toContain('cardNumber');
    expect(report.fieldNames).not.toContain('comments');
    expect(report.withheldFieldCount).toBe(Object.keys(PII).length);
  });

  it('describes the invoice items structurally, with no line text', () => {
    expect(report.invoiceItems).toMatchObject({ present: true, count: 2 });
    const fields = report.invoiceItems.fields.map((f) => f.field);
    expect(fields).toContain('amount');
    expect(fields).toContain('type');
    expect(fields).toContain('qty');
    // `description` is free text an agent typed; it is forbidden outright.
    expect(fields).not.toContain('description');
  });

  it('prefers the invoice-item occurrence that can actually show a value', () => {
    const shape = describeFinancialShape({
      invoiceItems: [{ amount: {} }, { amount: '12.00' }],
    });
    expect(shape.invoiceItems.fields[0]).toMatchObject({ field: 'amount', value: '12.00' });
  });

  it('reports the channel labels, and references only as a presence flag', () => {
    expect(report.sourceIdentifiers).toEqual({
      apiSourceId: 19,
      apiSource: 'booking',
      hasApiReference: true,
      hasChannelReference: false,
      hasReference: true,
    });
    // `channel: 'Booking.com'` is not a single token, so its value is not
    // shown — the numeric `apiSourceId` is the identifier that matters.
    expect(serialise(report.sourceIdentifiers)).not.toContain('Booking.com');
  });

  it('carries the provider status and the currency', () => {
    expect(report.providerStatus).toBe('confirmed');
    expect(report.currency).toBe('EUR');
  });

  it('says honestly when there are no invoice items at all', () => {
    const shape = describeFinancialShape({ id: 1, price: 10 });
    expect(shape.invoiceItems).toEqual({ present: false, count: 0, fields: [] });
  });
});

describe('safeFinancialReport — the whole pipeline', () => {
  const report = safeFinancialReport(BOOKING);
  const text = serialise(report);

  it('contains no personal value the provider sent', () => {
    for (const value of Object.values(PII)) {
      expect(text).not.toContain(value);
      expect(text.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });

  it('contains no personal FIELD NAME either', () => {
    // Every personal key the fixture carried is absent from the inventory.
    for (const field of Object.keys(PII)) {
      expect(report.fieldNames).not.toContain(field);
    }
    // And the names themselves appear nowhere in the serialised answer. Only
    // unambiguous ones are asserted as substrings: `city` would match the
    // legitimate `cityTax`, which is a tax and belongs in the report.
    for (const field of [
      'firstName', 'lastName', 'email', 'phone', 'address', 'postcode',
      'comment', 'cardNumber', 'cardHolder', 'cvv', 'guest', 'raw',
    ]) {
      expect(text.toLowerCase()).not.toContain(field.toLowerCase());
    }
    // `apiReference` survives only as the boolean `hasApiReference`. The
    // channel confirmation NUMBER itself is never in the answer.
    expect(text).toContain('hasApiReference');
    expect(text).not.toContain(PII.apiReference);
  });

  it('never carries the raw reservation object', () => {
    expect(report).not.toHaveProperty('raw');
    expect(report).not.toHaveProperty('booking');
    expect(text).not.toContain('76543210');
  });

  it('catches a guest surname smuggled into a financial field', () => {
    // The categoriser would happily report `payoutNote`… except the key is
    // forbidden. So poison a key that is NOT forbidden and IS financial.
    const poisoned = safeFinancialReport({
      lastName: 'Mustermann',
      payoutStatus: 'Mustermann',
      price: '480.00',
    });
    const field = poisoned.financialFields.find((f) => f.field === 'payoutStatus');
    expect(field?.value).toBe(REDACTED);
    expect(serialise(poisoned)).not.toContain('Mustermann');
    // and the honest financial fact still comes through.
    expect(poisoned.financialFields.find((f) => f.field === 'price')?.value).toBe('480.00');
  });

  it('still answers the questions the finance work asked', () => {
    const categories = new Set(report.financialFields.map((f) => f.category));
    for (const expected of ['price', 'currency', 'commission', 'tax', 'fee', 'payment', 'payout']) {
      expect(categories).toContain(expected);
    }
  });

  it('is stable on an empty booking rather than throwing', () => {
    expect(safeFinancialReport({})).toMatchObject({
      fieldNames: [],
      financialFields: [],
      otherFields: [],
      withheldFieldCount: 0,
    });
  });
});
