/**
 * Beds24 → bolagio_reservations, end to end: the real webhook, sync and
 * reconcile routes against the real database and the Beds24 simulator (which
 * answers `GET /bookings` the way the live account does, 2026-10-13: no
 * cancelled booking unless asked, `status` as a repeated parameter).
 *
 *   new        → webhook imports it within the request
 *   modified   → the same row is updated, never a second one
 *   cancelled  → status_class 'cancelled'; history kept
 *   duplicate / out-of-order deliveries → one row, Beds24's current state
 *   missed webhook → the scheduled import repairs it, cancellations included
 *   provider failure → the delivery is marked failed and retried by reconcile
 *   stale data → visible as an admin alert
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { futureStay, startHarness, SYNC_SECRET, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => {
  await h.resetDb();
  await h.beds24.reset();
  await h.sync();
});

const WEBHOOK_SECRET = 'sim-beds24-webhook-secret';
const APT_II = { roomId: 731146, propertyId: 354658 };

/** A Booking.com reservation arriving at Beds24 (no webhook is sent by this). */
async function channelBooking(stay = futureStay(20, 2), fields: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${h.beds24.url}/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', token: 'sim-beds24-token' },
    body: JSON.stringify([{ ...APT_II, status: 'confirmed', arrival: stay.checkIn, departure: stay.checkOut, numAdult: 2, numChild: 0, price: 300, referer: 'Booking.com', offerId: 0, ...fields }]),
  });
  const body = await res.json();
  const id = String(body[0].new.id);
  // The simulator's create takes only the write fields; channel and guest
  // fields are what Beds24 adds itself, so they are set as an edit.
  await h.beds24.edit(id, { apiSourceId: 19, apiReference: `BDC-${id}`, firstName: 'Max', lastName: 'Mustermann', ...fields });
  return id;
}

const webhook = (bookingId: string, action = 'modified', extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/webhooks/beds24', { action, bookingId, ...extra }, { 'x-bolagio-signature': WEBHOOK_SECRET });
const importNow = () => h.call('POST', '/api/booking/reservations/sync', {}, { 'x-bolagio-signature': SYNC_SECRET });
const row = (id: string) => {
  const out = h.sql(`select concat_ws('|', status_class, check_in, check_out, total_amount_cents, guest_last_name, coalesce(guest_phone, '-'), channel_reference) from bolagio_reservations where external_booking_id = '${id}'`);
  return out ? out.split('\n') : [];
};
const eventStatus = (id: string) => h.sql(`select string_agg(status || ':' || coalesce(error, '-'), ',' order by received_at) from bolagio_integration_events where external_id = '${id}'`);

describe('the webhook path', () => {
  it('imports a new reservation within the request', async () => {
    const stay = futureStay(20, 2);
    const id = await channelBooking(stay);
    expect(row(id)).toEqual([]);
    expect((await webhook(id, 'new')).status).toBe(200);
    expect(row(id)).toEqual([`active|${stay.checkIn}|${stay.checkOut}|30000|Mustermann|-|BDC-${id}`]);
  });

  it('applies a modification to the same row — dates, price and guest data — never a second row', async () => {
    const id = await channelBooking();
    await webhook(id, 'new');
    const moved = futureStay(25, 3);
    await h.beds24.edit(id, { arrival: moved.checkIn, departure: moved.checkOut, price: 450, lastName: 'Musterfrau', mobile: '+49 170 1234567' });
    await webhook(id, 'modified');
    expect(row(id)).toEqual([`active|${moved.checkIn}|${moved.checkOut}|45000|Musterfrau|+49 170 1234567|BDC-${id}`]);
  });

  it('records a cancellation as a status, keeping the reservation', async () => {
    const id = await channelBooking();
    await webhook(id, 'new');
    await h.beds24.edit(id, { status: 'cancelled' });
    await webhook(id, 'cancelled');
    expect(row(id)[0]).toMatch(/^cancelled\|/);
  });

  it('a duplicate delivery is dropped; a late, out-of-order delivery still converges on Beds24\'s current state', async () => {
    const id = await channelBooking();
    await webhook(id, 'new', { sent: 1 });
    await webhook(id, 'new', { sent: 1 }); // byte-identical retry
    expect(Number(h.sql(`select count(*) from bolagio_integration_events where external_id = '${id}'`))).toBe(1);

    await h.beds24.edit(id, { status: 'cancelled' });
    await webhook(id, 'cancelled', { sent: 3 });
    // The older 'modified' notification arrives last: the refresh reads Beds24,
    // which says cancelled — the stale claim cannot resurrect the stay.
    await webhook(id, 'modified', { sent: 2 });
    expect(row(id)).toHaveLength(1);
    expect(row(id)[0]).toMatch(/^cancelled\|/);
  });
});

describe('the scheduled import repairs what a webhook missed', () => {
  it('imports a reservation no webhook announced', async () => {
    const id = await channelBooking();
    const res = await importNow();
    expect(res.status).toBe(200);
    expect(row(id)[0]).toMatch(/^active\|/);
  });

  it('learns a cancellation no webhook announced (Beds24 omits cancelled bookings unless asked)', async () => {
    const id = await channelBooking();
    await webhook(id, 'new');
    await h.beds24.edit(id, { status: 'cancelled' }); // the cancellation webhook is lost
    await importNow();
    expect(row(id)).toHaveLength(1);
    expect(row(id)[0]).toMatch(/^cancelled\|/);
    const search = (await h.beds24.calls()).filter((c: any) => c.method === 'GET' && c.path === '/bookings' && !c.query?.id);
    expect(search.length).toBeGreaterThan(0);
  });

  it('a modification no webhook announced is applied to the existing row', async () => {
    const id = await channelBooking();
    await webhook(id, 'new');
    await h.beds24.edit(id, { price: 333.33 });
    await importNow();
    expect(row(id)).toHaveLength(1);
    expect(row(id)[0]).toContain('|33333|');
  });
});

describe('a failed refresh is visible and retried', () => {
  it('marks the delivery failed, then the reconcile pass repairs it', async () => {
    const id = await channelBooking();
    await h.beds24.mode('read', 'server_error');
    expect((await webhook(id, 'new')).status).toBe(200); // Beds24 is never asked to resend
    expect(row(id)).toEqual([]);
    expect(eventStatus(id)).toBe('failed:reservation_refresh_failed');

    // Still failing: retried, still failed, nothing duplicated.
    await h.reconcile();
    expect(eventStatus(id)).toBe('failed:reservation_refresh_failed');

    await h.beds24.mode('read', 'success');
    const pass = await h.reconcile();
    expect(pass.webhookRetry).toEqual({ retried: 1, repaired: 1 });
    expect(eventStatus(id)).toBe('processed:-');
    expect(row(id)).toHaveLength(1);
    expect(row(id)[0]).toMatch(/^active\|/);
  });
});

describe('stale synchronisation is visible to the admin', () => {
  it('raises RESERVATIONS_STALE for an upcoming reservation no sync has seen for a day, and BEDS24_WEBHOOK_REFRESH_FAILED for an unrepaired delivery', async () => {
    const { loadAlerts } = await import('@/lib/admin/queries');
    const id = await channelBooking();
    await webhook(id, 'new');

    let report = await loadAlerts();
    expect(report.ok).toBe(true);
    const codes = () => (report.ok ? report.data.alerts.map((a) => a.code) : []);
    expect(codes()).not.toContain('RESERVATIONS_STALE');

    h.sql(`update bolagio_reservations set last_seen_at = now() - interval '30 hours' where external_booking_id = '${id}'`);
    await h.beds24.mode('read', 'server_error');
    const other = await channelBooking(futureStay(40, 2));
    await webhook(other, 'new');

    report = await loadAlerts();
    expect(codes()).toContain('RESERVATIONS_STALE');
    expect(codes()).toContain('BEDS24_WEBHOOK_REFRESH_FAILED');
    await h.beds24.mode('read', 'success');
  });
});
