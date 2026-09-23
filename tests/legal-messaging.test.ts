/**
 * Guest email, on the legal side.
 *
 *   • A booking confirmation is not sent without its contract terms (§ 312f
 *     Abs. 2 BGB): the template REQUIRES the contracting party, the
 *     cancellation policy and the withdrawal notice, so their absence refuses
 *     to render rather than sending a confirmation with a hole in it.
 *   • A review request is advertising (BGH VI ZR 225/17) and is suppressed
 *     until a legal basis is recorded in lib/legal/messaging.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ claims: 0, failures: [] as Array<{ outcome: string; error?: string }> }));

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => { throw new Error('no db'); }, isSupabaseConfigured: () => true }));
vi.mock('@/lib/booking/repository', () => ({
  findIntentByReference: async () => ({
    id: 'i1', reference: 'BLG-AAAAAA', status: 'confirmed', unitSlug: 'schulstrasse-i',
    checkIn: '2027-03-10', checkOut: '2027-03-12', adults: 2, children: 0, currency: 'EUR',
    quotedTotalCents: 32000, paidAmountCents: 32000, paidCurrency: 'EUR',
    guest: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '1', locale: 'de' },
  }),
  findUnitBySlug: async () => ({ id: 'u', slug: 'schulstrasse-i', displayName: 'Schulstraße I', timezone: 'Europe/Berlin', checkInTime: '15:00', checkOutTime: '11:00' }),
  readTermsEvidence: async () => null,
}));
vi.mock('@/lib/booking/commands', () => ({
  // A render refusal is RECORDED in the ledger (claimed, then failed as not
  // retryable) so an operator sees it. That is the only claim allowed here.
  beginMessageDelivery: async () => { h.claims += 1; return { outcome: 'claimed', id: 'd1', attempt: 1 }; },
  completeMessageDelivery: async (o: { outcome: string; error?: string }) => { h.failures.push(o); },
}));

import { renderMessage, TemplateRenderError } from '@/lib/messaging/render';
import { prepareGuestMessage } from '@/lib/messaging/deliveries';
import { createLogger } from '@/lib/booking/logger';

const BASE = {
  firstName: 'Ada', reference: 'BLG-AAAAAA', unitName: 'Schulstraße I', checkInDate: '10.03.2027', checkOutDate: '12.03.2027',
  brandName: 'BoLaGio', contactEmail: 'info@example.org', nights: 2, totalAmount: '320,00 €', checkInTime: '15:00', checkOutTime: '11:00',
};
const TERMS = {
  contractingParty: 'BoLaGio GmbH, X 1, 95444 Bayreuth', cancellationPolicy: 'Storno-Text', withdrawalNotice: 'Kein Widerrufsrecht',
  termsUrl: 'https://bolagio.de/agb', privacyUrl: 'https://bolagio.de/datenschutz',
};

beforeEach(() => {
  h.claims = 0;
  h.failures.length = 0;
  vi.stubEnv('MESSAGING_CONTACT_EMAIL', 'info@example.org');
});
afterEach(() => vi.unstubAllEnvs());

describe('the booking confirmation', () => {
  it('refuses to render without the cancellation policy', () => {
    expect(() => renderMessage('booking_confirmation', 'de', { ...BASE, ...TERMS, cancellationPolicy: undefined })).toThrow(TemplateRenderError);
  });

  it('refuses to render without the contracting party or the withdrawal notice', () => {
    expect(() => renderMessage('booking_confirmation', 'en', { ...BASE, ...TERMS, contractingParty: undefined })).toThrow(TemplateRenderError);
    expect(() => renderMessage('booking_confirmation', 'en', { ...BASE, ...TERMS, withdrawalNotice: undefined })).toThrow(TemplateRenderError);
  });

  it('carries every contract term when they are present', () => {
    const message = renderMessage('booking_confirmation', 'de', { ...BASE, ...TERMS });
    for (const value of Object.values(TERMS)) expect(message.text).toContain(value);
  });

  it('is refused, not sent, when the booking has no readable terms evidence', async () => {
    const outcome = await prepareGuestMessage({ kind: 'booking_confirmation', reference: 'BLG-AAAAAA' }, createLogger());
    expect(outcome.outcome).toBe('not_retryable');
    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]).toMatchObject({ outcome: 'failed' });
    expect(h.failures[0].error).toMatch(/requires (contractingParty|cancellationPolicy|withdrawalNotice)/);
  });
});

describe('the review request', () => {
  it('is suppressed while no legal basis is recorded', async () => {
    const outcome = await prepareGuestMessage({ kind: 'review_request', reference: 'BLG-AAAAAA' }, createLogger());
    expect(outcome).toMatchObject({ outcome: 'suppressed' });
    expect((outcome as { reason: string }).reason).toMatch(/legal basis/);
    expect(h.claims).toBe(0);
  });
});
