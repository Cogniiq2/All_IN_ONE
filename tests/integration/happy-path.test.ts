/**
 * The whole direct-booking path, end to end, through the real routes:
 * calendar → quote → intent + hold → order → approval → capture → finalize
 * → confirmed → outbox → operations pass. Every assertion is a database or
 * simulator fact, never a response shape alone.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, futureStay, holdBooking, intentRow, jobs, operations, outboxTypes, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); });

describe('the guest path', () => {
  it('refuses everything while direct booking is disabled', async () => {
    process.env.DIRECT_BOOKING_ENABLED = 'false';
    try {
      const config = await h.call('GET', '/api/booking/payment/config');
      expect(config.status).toBe(403);
      expect(config.body).toEqual({ error: 'booking_disabled' });
      const stay = futureStay();
      const created = await h.call('POST', '/api/booking/intent', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0, guest: { firstName: 'A', lastName: 'B', email: 'a@example.com', phone: '+49123456' } });
      expect(created.status).toBe(403);
      expect(h.sql('select count(*) from bolagio_booking_intents')).toBe('0');
      const calls = await h.beds24.calls();
      expect(calls.filter((c: any) => c.method === 'POST' && c.path === '/bookings')).toHaveLength(0);
    } finally {
      process.env.DIRECT_BOOKING_ENABLED = 'true';
    }
  });

  it('syncs the calendar from the simulated channel manager', async () => {
    const report = await h.sync();
    expect(report.units).toBe(1);
    expect(report.days).toBeGreaterThan(300);
    const calendar = await h.call('GET', '/api/booking/availability?unit=schulstrasse-i');
    expect(calendar.status).toBe(200);
    expect(calendar.body.unsourced).toBeFalsy();
    expect(calendar.body.days.length).toBeGreaterThan(300);
    expect(calendar.body.days.every((d: any) => d.available)).toBe(true);
  });

  it('quotes a live total from the offer and refuses unavailable dates', async () => {
    await h.sync();
    const stay = futureStay(60, 2);
    const quote = await h.call('POST', '/api/booking/quote', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0 });
    expect(quote.status).toBe(200);
    expect(quote.body.totalCents).toBe(14_000 * 2 + 4_500);
    expect(quote.body.components.map((c: any) => c.code)).toEqual(['accommodation', 'fee:endreinigung']);

    // Somebody else (Booking.com) takes one of the nights.
    await h.beds24.block('731147', stay.checkIn, stay.checkOut);
    const taken = await h.call('POST', '/api/booking/quote', { unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0 });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe('availability_conflict');
  });

  it('holds, pays, finalizes and confirms — with exactly one confirmation event', async () => {
    await h.sync();
    // Inside the 60-day turnover horizon, so the operations pass derives it.
    const { reference, quote } = await holdBooking(h, futureStay(30, 3));

    // Hold: the Beds24 booking exists, blocks the nights, and is snapshotted.
    let row = await intentRow(h, reference);
    expect(row!.status).toBe('hold_created');
    expect(row!.beds24_booking_id).toBeTruthy();
    expect(row!.beds24_property_id).toBe('354659');
    expect(row!.beds24_room_id).toBe('731147');
    const sim = await h.beds24.state();
    expect(sim.bookings).toHaveLength(1);
    expect(sim.bookings[0].status).toBe('new');
    expect(sim.bookings[0].reference).toBe(reference);
    expect((await operations(h, reference)).map((o: any) => [o.operation_type, o.outcome])).toEqual([['create_hold', 'succeeded']]);

    // Order: the amount PayPal sees is the quoted total, never a browser value.
    const orderId = await approveOrder(h, reference);
    row = await intentRow(h, reference);
    expect(row!.payment_order_id).toBe(orderId);
    expect(row!.status).toBe('payment_session_created');
    const pp = await h.paypal.state();
    expect(pp.orders[0].amountCents).toBe(quote.totalCents);
    expect(pp.orders[0].customId).toBe(reference);

    // Capture through the browser's route.
    const captured = await h.call('POST', '/api/booking/payment/capture', { reference });
    expect(captured.status).toBe(200);
    expect(captured.body.paymentStatus).toBe('paid');
    expect(captured.body.status).toBe('confirmed');

    row = await intentRow(h, reference);
    expect(row!.status).toBe('confirmed');
    expect(row!.payment_status).toBe('paid');
    expect(row!.paid_amount_cents).toBe(quote.totalCents);
    expect(row!.beds24_status).toBe('confirmed');
    expect(row!.hold_expires_at).toBeNull();
    expect(row!.confirmed_at).not.toBeNull();

    const after = await h.beds24.state();
    expect(after.bookings[0].status).toBe('confirmed');

    // The webhook for the same capture is a duplicate, not a second payment.
    await new Promise((r) => setTimeout(r, 150));
    const events = h.sql(`select event_type || ':' || status || ':' || verification from bolagio_payment_events order by received_at`);
    expect(events).toContain('PAYMENT.CAPTURE.COMPLETED:pending:verified');
    await h.reconcile();
    expect(h.sql(`select count(*) from bolagio_payment_events where status = 'succeeded'`)).toBe('2');
    row = await intentRow(h, reference);
    expect(row!.paid_amount_cents).toBe(quote.totalCents);

    const types = await outboxTypes(h, reference);
    expect(types.filter((t) => t === 'booking.confirmed')).toHaveLength(1);
    expect(types).toEqual(expect.arrayContaining(['booking.held', 'payment.order_created', 'payment.completed', 'booking.confirmed']));
    expect(types.filter((t) => t === 'invoice.required')).toHaveLength(1);

    // The operations pass created the turnover for the confirmed stay.
    expect(h.sql(`select status from bolagio_turnovers`)).toBe('required');
    expect(types.filter((t) => t === 'cleaning.required')).toHaveLength(1);
    expect(await jobs(h, reference)).toEqual([]);
  });

  it('answers the status route without personal data', async () => {
    await h.sync();
    const { reference } = await holdBooking(h);
    const status = await h.call('GET', `/api/booking/status?ref=${reference}`);
    expect(status.status).toBe(200);
    expect(status.body.reference).toBe(reference);
    expect(JSON.stringify(status.body)).not.toContain('ada@example.com');
    expect(JSON.stringify(status.body)).not.toContain('Lovelace');
    const missing = await h.call('GET', '/api/booking/status?ref=BLG-ZZZZZZ');
    expect(missing.status).toBe(400);
  });
});
