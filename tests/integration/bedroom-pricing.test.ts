/**
 * Bedroom packages and price integrity, end to end through the real routes,
 * against the Beds24 simulator speaking the LIVE offer shape (verified
 * 2026-10-12): Offer 1 "1 Schlafzimmer" ≤ 2 guests, Offer 2 "2 Schlafzimmer"
 * ≤ 4 guests, `numAdults` required.
 *
 *   quote → the package's offer, verbatim
 *   intent → refused with the fresh quote when the confirmed total is stale
 *   hold → offerId + bedroom marker on the Beds24 booking, package persisted
 *   order → PayPal is asked for exactly the verified Beds24 total
 *   reservation import → the setup survives into bolagio_reservations
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, futureStay, GUEST, intentRow, startHarness, SYNC_SECRET, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); });

const body = (stay: { checkIn: string; checkOut: string }, bedroomPackage: string, adults = 2) =>
  ({ unitSlug: 'schulstrasse-i', ...stay, adults, children: 0, bedroomPackage });

const intentsCount = () => Number(h.sql('select count(*) from bolagio_booking_intents'));
const beds24Writes = async () => (await h.beds24.calls()).filter((c: any) => c.method === 'POST' && c.path === '/bookings');

describe('quotes', () => {
  it('prices each package from its own offer, verbatim', async () => {
    const stay = futureStay(60, 3);
    const one = await h.call('POST', '/api/booking/quote', body(stay, 'one_bedroom'));
    const two = await h.call('POST', '/api/booking/quote', body(stay, 'two_bedroom'));
    expect(one.status).toBe(200);
    expect(one.body.totalCents).toBe(120_00 * 3);
    expect(one.body.bedroomPricing).toEqual({ status: 'configured', offerId: 1 });
    expect(two.body.totalCents).toBe(150_00 * 3);
    expect(two.body.bedroomPricing).toEqual({ status: 'configured', offerId: 2 });
  });

  it('refuses 1 Bedroom for three guests, server-side, before Beds24 is asked', async () => {
    const offerCalls = async () => (await h.beds24.calls()).filter((c: any) => String(c.path).startsWith('/inventory/rooms/offers')).length;
    const before = await offerCalls();
    const res = await h.call('POST', '/api/booking/quote', body(futureStay(60, 3), 'one_bedroom', 3));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'occupancy', meta: { maxGuests: 2, bedroomPackage: 'one_bedroom' } });
    expect(await offerCalls()).toBe(before);
  });

  it('quotes 2 Bedrooms for four guests', async () => {
    const res = await h.call('POST', '/api/booking/quote', body(futureStay(60, 2), 'two_bedroom', 4));
    expect(res.status).toBe(200);
    expect(res.body.bedroomPricing.offerId).toBe(2);
  });

  it('answers bedroom_setup_unavailable when the package offer is absent — never the other offer', async () => {
    await h.beds24.config({ offerMaxGuests: { 1: 0, 2: 4 } }); // Beds24 stops offering Offer 1
    try {
      const res = await h.call('POST', '/api/booking/quote', body(futureStay(60, 2), 'one_bedroom'));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('bedroom_setup_unavailable');
    } finally {
      await h.beds24.config({ offerMaxGuests: { 1: 2, 2: 4 } });
    }
  });
});

describe('price integrity', () => {
  it('refuses a stale confirmed total with the fresh quote, creating nothing', async () => {
    const stay = futureStay(45, 2);
    const shown = await h.call('POST', '/api/booking/quote', body(stay, 'two_bedroom'));
    // Beds24 re-prices while the guest types their name.
    await h.beds24.config({ offerNightlyEur: { 1: 120, 2: 175 } });
    try {
      const res = await h.call('POST', '/api/booking/intent', {
        ...body(stay, 'two_bedroom'), guest: GUEST, attemptId: 'stale-1', expectedTotalCents: shown.body.totalCents,
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('price_changed');
      expect(res.body.quote.totalCents).toBe(175_00 * 2);
      expect(res.body.quote.terms).toBeTruthy();
      expect(intentsCount()).toBe(0);
      expect(await beds24Writes()).toHaveLength(0);

      // The guest confirms the new total: now it books, at that total.
      const again = await h.call('POST', '/api/booking/intent', {
        ...body(stay, 'two_bedroom'), guest: GUEST, attemptId: 'stale-1', expectedTotalCents: res.body.quote.totalCents,
      });
      expect(again.status).toBe(201);
      expect(again.body.intent.totalCents).toBe(175_00 * 2);
    } finally {
      await h.beds24.config({ offerNightlyEur: { 1: 120, 2: 150 } });
    }
  });

  it('never takes a total from the browser', async () => {
    const stay = futureStay(50, 2);
    const res = await h.call('POST', '/api/booking/intent', {
      ...body(stay, 'one_bedroom'), guest: GUEST, attemptId: 'override-1', totalCents: 1, price: 1, amountCents: 1,
    });
    expect(res.status).toBe(201);
    const row = await intentRow(h, res.body.intent.reference);
    expect(Number(row!.quoted_total_cents)).toBe(120_00 * 2);
    const sim = await h.beds24.state();
    expect(sim.bookings[0].price).toBe(240);
  });

  it('a confirmed total that is absent is treated as stale, never as accepted', async () => {
    const res = await h.call('POST', '/api/booking/intent', {
      ...body(futureStay(55, 2), 'two_bedroom'), guest: GUEST, attemptId: 'absent-1', expectedTotalCents: 'free',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('price_changed');
    expect(intentsCount()).toBe(0);
  });
});

describe('hold, payment, reservation', () => {
  it('persists the package, writes the offer and marker to Beds24, and charges the verified total', async () => {
    const stay = futureStay(40, 3);
    const created = await h.call('POST', '/api/booking/intent', { ...body(stay, 'one_bedroom'), guest: GUEST, attemptId: 'full-1' });
    expect(created.status).toBe(201);
    const reference = created.body.intent.reference;

    const row = await intentRow(h, reference);
    expect(h.sql(`select bedroom_package || ':' || beds24_offer_id from bolagio_booking_intents where reference = '${reference}'`)).toBe('one_bedroom:1');
    expect(Number(row!.quoted_total_cents)).toBe(120_00 * 3);

    const sim = await h.beds24.state();
    const booking = sim.bookings[0];
    expect(booking.offerId).toBe(1);
    expect(booking.price).toBe(360);
    expect(booking.infoItems).toEqual([{ code: 'BOLAGIO_BEDROOM_SETUP', text: 'Bedroom setup: 1 Schlafzimmer' }]);
    expect(booking.notes).toContain('Bedroom setup: 1 Schlafzimmer');

    // PayPal is asked for exactly the verified Beds24 total.
    await approveOrder(h, reference);
    const paypal = await h.paypal.state();
    expect(paypal.orders).toHaveLength(1);
    expect(paypal.orders[0].amountCents).toBe(120_00 * 3);

    // The reservation import carries the setup Beds24 recorded.
    const sync = await h.call('POST', '/api/booking/reservations/sync', {}, { 'x-bolagio-signature': SYNC_SECRET });
    expect(sync.status).toBe(200);
    expect(h.sql(`select bedroom_package || ':' || external_offer_id from bolagio_reservations where check_in = '${stay.checkIn}'`)).toBe('one_bedroom:1');
  });

  it('leaves a channel reservation\'s setup unknown', async () => {
    const arrival = futureStay(80, 2);
    await fetch(`${h.beds24.url}/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', token: 'sim-beds24-token' },
      body: JSON.stringify([{ roomId: 731147, propertyId: 354659, status: 'confirmed', arrival: arrival.checkIn, departure: arrival.checkOut, numAdult: 3, numChild: 0, price: 500, referer: 'Booking.com', offerId: 0 }]),
    });
    const sync = await h.call('POST', '/api/booking/reservations/sync', {}, { 'x-bolagio-signature': SYNC_SECRET });
    expect(sync.status).toBe(200);
    expect(h.sql(`select coalesce(bedroom_package, 'unknown') || ':' || external_offer_id from bolagio_reservations where check_in = '${arrival.checkIn}'`)).toBe('unknown:0');
  });
});
