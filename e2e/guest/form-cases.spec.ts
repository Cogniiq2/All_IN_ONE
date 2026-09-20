/**
 * G18–G20 · The form itself: validation, the party-size clamp, and a
 * guest who abandons a held booking and starts over.
 */

import { expect, test } from '@playwright/test';
import { createOrder, driveToPayment, fillContact, futureStay, installFakePayPal, intent, isolateClient, next, openBooking, pickDates, resetAll, sql, sync } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
  await installFakePayPal(page);
});

test('G18 · contact validation stops the guest before any request: bad email, no intent', async ({ page }) => {
  await openBooking(page);
  await next(page);
  await pickDates(page, futureStay(66, 2));
  await expect(page.getByText('Gesamtpreis')).toBeVisible();
  await next(page);
  await fillContact(page, { name: 'A', email: 'not-an-email', phone: '12' });
  await next(page);
  await expect(page.getByRole('heading', { name: 'Wie erreichen wir Sie?' })).toBeVisible();
  await expect(page.locator('#bk-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#bk-name')).toHaveAttribute('aria-invalid', 'true');
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('0');
});

test('G19 · the party-size stepper clamps at the residence maximum and never below one', async ({ page }) => {
  const max = Number(sql(`select coalesce(max_guests, 4) from bolagio_units where slug='schulstrasse-i'`));
  await openBooking(page);
  const more = page.getByRole('button', { name: 'Mehr' });
  const fewer = page.getByRole('button', { name: 'Weniger' });
  for (let i = 0; i < max + 2; i += 1) {
    if (await more.isDisabled()) break;
    await more.click();
  }
  await expect(more).toBeDisabled();
  for (let i = 0; i < max + 2; i += 1) {
    if (await fewer.isDisabled()) break;
    await fewer.click();
  }
  await expect(fewer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeEnabled();
});

test('G20 · a guest abandons a held booking and starts again for the same nights: their own hold blocks them; the first hold stands', async ({ page }) => {
  const stay = futureStay(68, 2);
  const first = await driveToPayment(page, { stay });
  await createOrder(page);
  await page.keyboard.press('Escape');
  await sync();
  await page.reload();
  await openBooking(page);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Wann möchten Sie kommen?' })).toBeVisible();
  const [y, m, d] = stay.arrival.split('-');
  let shownTaken = false;
  for (let i = 0; i < 4; i += 1) {
    if (await page.getByRole('button', { name: `${d}.${m}.${y} — belegt`, exact: true }).count()) { shownTaken = true; break; }
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
  }
  expect(shownTaken).toBe(true);
  const row = intent(first)!;
  expect(row.status).toBe('payment_session_created');
  expect(row.payment_order_id).toBeTruthy();
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('1');
});
