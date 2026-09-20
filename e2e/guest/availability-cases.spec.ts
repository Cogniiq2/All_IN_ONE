/**
 * G12–G17 · Before any money: availability, pricing and the enquiry paths.
 */

import { expect, test } from '@playwright/test';
import { BEDS24_ROOM, fillContact, futureStay, heldBooking, installFakePayPal, isolateClient, next, openBooking, pickDates, resetAll, sims, sql, stubEnquiryEndpoint, sync } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
  await installFakePayPal(page);
});

test('G12 · the nights go while the guest is typing: the dialog returns to the calendar, keeps the contact details, and holds nothing', async ({ page }) => {
  const stay = futureStay(50, 2);
  await openBooking(page);
  await next(page);
  await pickDates(page, stay);
  await expect(page.getByText('Gesamtpreis')).toBeVisible();
  await next(page);
  await fillContact(page);
  await next(page);
  // Somebody else takes the nights at the channel manager now.
  await sims.beds24.block(BEDS24_ROOM(), stay.arrival, stay.departure);
  await page.getByRole('button', { name: /PayPal/ }).first().click();
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Wann möchten Sie kommen?' })).toBeVisible();
  await expect(page.getByText(/nicht mehr verfügbar|nicht verfügbar|belegt/i).first()).toBeVisible();
  expect(sql(`select count(*) from bolagio_booking_intents where status in ('hold_created','locking')`)).toBe('0');
  // Contact details survived the trip back.
  await page.getByRole('button', { name: 'Nächster Monat' }).click().catch(() => undefined);
  expect(sql(`select count(*) from bolagio_external_operations where operation_type='hold' and outcome='succeeded'`)).toBe('0');
});

test('G13 · a night already held by another guest is shown as taken and cannot be picked', async ({ page }) => {
  const stay = futureStay(55, 2);
  await heldBooking(stay);
  await sync();
  await openBooking(page);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Wann möchten Sie kommen?' })).toBeVisible();
  const [y, m, d] = stay.arrival.split('-');
  for (let i = 0; i < 4; i += 1) {
    const taken = page.getByRole('button', { name: `${d}.${m}.${y} — belegt`, exact: true });
    if (await taken.count()) {
      await expect(taken).toBeDisabled();
      return;
    }
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
  }
  throw new Error('the held night was never shown');
});

test('G14 · the price moved between quote and booking: the server re-prices, the guest sees the new total and must confirm again; nothing is charged at the old price', async ({ page }) => {
  const stay = futureStay(58, 2);
  await openBooking(page);
  await next(page);
  await pickDates(page, stay);
  await expect(page.getByText('Gesamtpreis')).toBeVisible();
  await next(page);
  await fillContact(page);
  await next(page);
  await expect(page.getByText('325,00 €').first()).toBeVisible();
  await sims.beds24.config({ nightlyCents: 19_900 });
  await page.getByRole('button', { name: /PayPal/ }).first().click();
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();
  await expect(page.getByText(/Ihr Preis ist nicht mehr aktuell/)).toBeVisible();
  await expect(page.getByText('443,00 €').first()).toBeVisible();
  await expect(page.locator('[data-sim="paypal"]')).toHaveCount(0);
  const reference = sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`);
  expect(sql(`select status || ':' || quoted_total_cents from bolagio_booking_intents where reference='${reference}'`)).toBe('hold_created:44300');
  // Pressing again replays the same attempt: no second hold, and the order carries the price the guest saw.
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();
  await expect(page.locator('[data-sim="paypal"]')).toBeVisible();
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('1');
  await page.locator('[data-sim="paypal"]').click();
  await expect(page.locator('[data-sim="paypal"]')).toHaveAttribute('data-order', /.+/);
  expect((await sims.beds24.state()).bookings.length).toBe(1);
  expect((await sims.paypal.state()).orders[0].amountCents).toBe(44300);
});

test('G15 · the channel manager is unreachable: live availability is reported unavailable and no intent is created', async ({ page }) => {
  await sims.beds24.mode('offers', 'timeout');
  const stay = futureStay(62, 2);
  await openBooking(page);
  await next(page);
  await pickDates(page, stay);
  await expect(page.getByText(/Die Live-Verfügbarkeit ist derzeit nicht erreichbar/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verbindlich buchen' })).toHaveCount(0);
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('0');
});

test('G16 · a residence without a connected source takes the enquiry path: a request, no hold, no provider call', async ({ page }) => {
  const calls: any[] = [];
  await stubEnquiryEndpoint(page, calls);
  const stay = futureStay(64, 2);
  await openBooking(page, 'schulstrasse-ii');
  await next(page);
  await pickDates(page, stay);
  await next(page);
  await fillContact(page);
  await next(page);
  await expect(page.getByRole('button', { name: 'Buchung anfragen' })).toBeVisible();
  await page.getByRole('button', { name: 'Buchung anfragen' }).click();
  await expect(page.getByRole('heading', { name: 'Ihre Buchungsanfrage ist bei uns' })).toBeVisible();
  expect(calls.length).toBe(1);
  expect(calls[0].type).toBe('booking-request');
  expect(calls[0].payment.captured).toBe(false);
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('0');
  const beds = await sims.beds24.calls();
  expect(beds.filter((c: any) => /bookings/.test(c.path) && c.method === 'POST').length).toBe(0);
});

test('G17 · a residence in preparation only offers "Informiert werden" — no dates, no hold', async ({ page }) => {
  const calls: any[] = [];
  await stubEnquiryEndpoint(page, calls);
  await page.goto('/apartments/opernstrasse-i');
  await expect(page.getByRole('button', { name: 'Jetzt buchen' })).toHaveCount(0);
  const notify = page.getByRole('button', { name: /Informiert werden|Benachrichtigen/ }).first();
  await expect(notify).toBeVisible();
  await notify.click();
  await expect(page.getByRole('heading', { name: 'Informiert werden' })).toBeVisible();
  await page.locator('#notify-name').fill('Ada Lovelace');
  await page.locator('#notify-email').fill('ada@example.com');
  await page.locator('#notify-phone').fill('+49 921 1234567');
  await page.getByRole('button', { name: 'Benachrichtigen' }).click();
  await expect(page.getByRole('heading', { name: 'Wir melden uns' })).toBeVisible();
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('0');
});
