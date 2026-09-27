/**
 * ══════════════════════════════════════════════════════════════════════════
 * SUCCESS SCREENS — the receipt hand-off and the scene copy.
 *
 * The receipt is what makes a success page personal without putting a name
 * or a date in a URL. These pin: it expires, it is re-validated on the way
 * back in, and it never holds more than a first name. The scene tests pin
 * the honesty rules of lib/content/success.ts: every scene is bilingual, only
 * one scene may say "confirmed", and every request says it binds nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstNameOf, readReceipt, RECEIPT_TTL_MS, sanitizeReceipt, saveReceipt } from '@/lib/success/receipt';
import { resolveScene, SUCCESS_SCENES, THANK_YOU_KINDS, isThankYouKind } from '@/lib/content/success';
import { nextBookingPage } from '@/components/success/booking-routing';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

describe('the receipt', () => {
  beforeEach(() => {
    (globalThis as any).window = { sessionStorage: new MemoryStorage() };
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('keeps only the first word of a name', () => {
    expect(firstNameOf('  Ada   Lovelace ')).toBe('Ada');
    expect(firstNameOf('   ')).toBeUndefined();
  });

  it('round-trips within its lifetime and expires after it', () => {
    const t0 = 1_800_000_000_000;
    saveReceipt('stay-enquiry', { firstName: 'Ada', arrival: '2026-10-01', departure: '2026-10-04', guests: 2 }, t0);
    expect(readReceipt('stay-enquiry', t0 + 60_000)).toEqual({
      firstName: 'Ada', arrival: '2026-10-01', departure: '2026-10-04', guests: 2,
    });
    expect(readReceipt('stay-enquiry', t0 + RECEIPT_TTL_MS + 1)).toBeNull();
    // A clock that went backwards is not trusted either.
    expect(readReceipt('stay-enquiry', t0 - 1)).toBeNull();
  });

  it('is per kind: one journey never personalises another', () => {
    saveReceipt('message', { firstName: 'Ada' });
    expect(readReceipt('rental-enquiry')).toBeNull();
  });

  it('survives storage that refuses to work', () => {
    (globalThis as any).window = {
      sessionStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } },
    };
    expect(() => saveReceipt('message', { firstName: 'Ada' })).not.toThrow();
    expect(readReceipt('message')).toBeNull();
  });

  it('re-validates every field it reads back and drops the rest', () => {
    expect(
      sanitizeReceipt({
        firstName: 'x'.repeat(200),
        unitSlug: '../../etc',
        arrival: 'tomorrow',
        departure: '2026-10-04',
        guests: 9999,
        party: 'government',
        request: 'viewing',
        interest: 'long-term-commercial',
        reference: 'BLG-abc',
        email: 'ada@example.com',
      })
    ).toEqual({
      firstName: 'x'.repeat(40),
      departure: '2026-10-04',
      request: 'viewing',
      interest: 'long-term-commercial',
    });
    expect(sanitizeReceipt('nope')).toBeNull();
    expect(sanitizeReceipt({ reference: 'BLG-7K2M9Q' })).toEqual({ reference: 'BLG-7K2M9Q' });
  });
});

describe('the scenes', () => {
  const scenes = Object.values(SUCCESS_SCENES);

  it('exist for every thank-you kind, and only those are routable there', () => {
    for (const kind of THANK_YOU_KINDS) expect(SUCCESS_SCENES[kind]).toBeDefined();
    expect(isThankYouKind('booking-confirmed')).toBe(false);
    expect(isThankYouKind('rental-enquiry')).toBe(true);
  });

  it('are fully bilingual, variants included', () => {
    const check = (value: { de: string; en: string } | undefined) => {
      if (!value) return;
      expect(value.de.trim()).not.toBe('');
      expect(value.en.trim()).not.toBe('');
    };
    for (const scene of scenes) {
      const copies = [scene, ...Object.values(scene.variants ?? {})];
      for (const copy of copies) {
        check(copy!.eyebrow);
        check(copy!.title);
        check(copy!.lede);
        check(copy!.note);
        for (const step of copy!.steps ?? []) {
          check(step.title);
          check(step.body);
        }
      }
      check(scene.documentTitle);
    }
  });

  it('say "confirmed" on exactly one scene — the one the backend gates', () => {
    const saysConfirmed = scenes.filter((s) => /\bbestätigt\b/i.test(s.title.de) || /\bconfirmed\b/i.test(s.title.en));
    expect(saysConfirmed.map((s) => s.id)).toEqual(['booking-confirmed']);
  });

  it('tell every requester that nothing is binding or charged', () => {
    for (const id of ['booking-request', 'stay-enquiry', 'waitlist'] as const) {
      expect(SUCCESS_SCENES[id].note?.de).toMatch(/nichts/);
    }
    for (const id of ['rental-enquiry', 'business-enquiry', 'appointment-request'] as const) {
      expect(SUCCESS_SCENES[id].note?.de).toMatch(/unverbindlich/);
      expect(SUCCESS_SCENES[id].note?.en).toMatch(/non-binding/);
    }
  });

  it('have one step happening now at most, and it is never behind a finished one', () => {
    for (const scene of scenes) {
      for (const copy of [scene, ...Object.values(scene.variants ?? {})]) {
        const states = (copy!.steps ?? []).map((s) => s.state);
        expect(states.filter((s) => s === 'active').length).toBeLessThanOrEqual(1);
        const order = { done: 0, active: 1, next: 2 } as const;
        const ranks = states.map((s) => order[s]);
        expect([...ranks].sort()).toEqual(ranks);
      }
    }
  });

  it('keep the headings the guest journeys are addressed by', () => {
    expect(SUCCESS_SCENES['booking-confirmed'].title.de).toBe('Ihre Buchung ist bestätigt');
    expect(SUCCESS_SCENES['payment-received'].title.de).toBe('Zahlung erhalten');
    expect(SUCCESS_SCENES['booking-request'].title.de).toBe('Ihre Buchungsanfrage ist bei uns');
    expect(SUCCESS_SCENES.waitlist.title.de).toBe('Wir melden uns');
  });

  it('lay a variant over its scene and ignore an unknown one', () => {
    expect(resolveScene('rental-enquiry', 'viewing').lede.de).toMatch(/Besichtigung/);
    expect(resolveScene('rental-enquiry', 'nonsense')).toBe(SUCCESS_SCENES['rental-enquiry']);
    expect(resolveScene('appointment-request', 'company').note?.de).toMatch(/Nutzung/);
  });
});

describe('which booking page tells the truth', () => {
  const view = (status: string, paymentStatus: string) =>
    ({ reference: 'BLG-7K2M9Q', status, paymentStatus }) as any;

  it('sends a confirmed booking to /booking/confirmed', () => {
    expect(nextBookingPage(view('confirmed', 'paid'))).toBe('/booking/confirmed?ref=BLG-7K2M9Q');
  });

  it('sends money that arrived or is clearing to /booking/payment-received', () => {
    expect(nextBookingPage(view('paid', 'paid'))).toBe('/booking/payment-received?ref=BLG-7K2M9Q');
    expect(nextBookingPage(view('payment_pending', 'capture_pending'))).toBe('/booking/payment-received?ref=BLG-7K2M9Q');
    // Denied first attempt, capture still on its way: never "failed".
    expect(nextBookingPage(view('payment_failed', 'capture_pending'))).toBe('/booking/payment-received?ref=BLG-7K2M9Q');
  });

  it('leaves everything else to the return page', () => {
    expect(nextBookingPage(view('payment_failed', 'failed'))).toBe('/booking/return?ref=BLG-7K2M9Q');
    expect(nextBookingPage(view('released', 'none'))).toBe('/booking/return?ref=BLG-7K2M9Q');
    expect(nextBookingPage(view('awaiting_payment', 'order_created'))).toBe('/booking/return?ref=BLG-7K2M9Q');
  });
});
