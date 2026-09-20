/**
 * G01–G04 · The booking dialog end to end: a confirmed stay in German, in
 * English, on a paid-but-unfinalized reservation, and with the buyer
 * walking away at PayPal.
 */

import { expect, test } from '@playwright/test';
import { approveAndReturn, buyerCancels, createOrder, driveToPayment, dueNow, installFakePayPal, intent, isolateClient, lapseHold, reconcile, resetAll, sims, sql, sweepLapsed, waitForIntent } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
  await installFakePayPal(page);
});

test('G01 · a guest books, pays and sees "bestätigt" only once the server confirmed — with a turnover and an outbox event behind it', async ({ page }) => {
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  expect(intent(reference)?.payment_order_id).toBe(orderId);

  await approveAndReturn(page, orderId, true);
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toBeVisible();
  await expect(page.getByText(`Referenz · ${reference}`)).toBeVisible();

  const row = await waitForIntent(reference, (r) => r.status === 'confirmed');
  expect(row.payment_status).toBe('paid');
  expect(row.beds24_booking_id).toBeTruthy();
  expect(row.payment_capture_id).toBeTruthy();
  expect(row.paid_amount_cents).toBeGreaterThan(0);
  expect(sql(`select count(*) from bolagio_outbox_events where reference='${reference}' and event_type='booking.confirmed'`)).toBe('1');
  // The scheduled pass derives the turnover from the confirmed departure.
  await reconcile();
  expect(sql(`select count(*) from bolagio_turnovers t join bolagio_booking_intents i on i.id=t.intent_id where i.reference='${reference}' and t.status='required'`)).toBe('1');
  // The simulator saw exactly one capture — no retry, no duplicate.
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /capture$/.test(c.path)).length).toBe(1);
});

test('G02 · the same journey in English records the locale and renders English copy', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bolagio-locale', 'en'));
  await page.goto('/apartments/schulstrasse-i');
  await page.getByRole('button', { name: 'Book now' }).first().click();
  await expect(page.getByRole('heading', { name: 'How many of you are coming?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'When would you like to come?' })).toBeVisible();
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 45);
  const a = d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 2); const b = d.toISOString().slice(0, 10);
  const lab = (iso: string) => { const [y, m, dd] = iso.split('-'); return `${dd}.${m}.${y} — available`; };
  for (const iso of [a, b]) {
    for (let i = 0; i < 4; i += 1) {
      const day = page.getByRole('button', { name: lab(iso), exact: true });
      if (await day.count()) { await day.click(); break; }
      await page.getByRole('button', { name: 'Next month' }).click();
    }
  }
  await expect(page.getByText('Total')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#bk-name').fill('Grace Hopper');
  await page.locator('#bk-email').fill('grace@example.com');
  await page.locator('#bk-phone').fill('+1 555 0100');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /PayPal/ }).first().click();
  await page.getByRole('button', { name: 'Book now' }).click();
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, true);
  await expect(page.getByRole('heading', { name: 'Your booking is confirmed' })).toBeVisible();
  const reference = sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`);
  const row = await waitForIntent(reference, (r) => r.status === 'confirmed');
  expect(row.locale).toBe('en');
  expect(row.guest_email).toBe('grace@example.com');
});

test('G03 · finalization fails at the channel manager: the guest is told "Zahlung erhalten", never "bestätigt"; one pass later it is confirmed', async ({ page }) => {
  await sims.beds24.mode('finalize', 'failure');
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, true);
  await expect(page.getByRole('heading', { name: 'Zahlung erhalten' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toHaveCount(0);
  const row = await waitForIntent(reference, (r) => r.status === 'finalization_failed');
  expect(row.payment_status).toBe('paid');
  expect(row.beds24_booking_id).toBeTruthy();

  await sims.beds24.mode('finalize', 'success');
  dueNow();
  await reconcile();
  const after = await waitForIntent(reference, (r) => r.status === 'confirmed');
  expect(after.beds24_booking_id).toBeTruthy();
});

test('G04 · the buyer cancels at PayPal: the dialog returns to the payment step, the hold stands, and only the lapsed lease releases it', async ({ page }) => {
  const reference = await driveToPayment(page);
  await createOrder(page);
  await buyerCancels(page);
  await expect(page.getByRole('button', { name: 'Verbindlich buchen' })).toBeVisible();
  expect(intent(reference)?.status).toBe('payment_session_created');
  expect(intent(reference)?.payment_status).toBe('order_created');

  lapseHold(reference);
  await sweepLapsed();
  const row = await waitForIntent(reference, (r) => r.status === 'released');
  // An order that was never approved is simply left behind; nothing was captured.
  expect(['order_created', 'cancelled']).toContain(row.payment_status);
  expect(row.payment_capture_id).toBeNull();
  expect((await sims.paypal.state()).captures.length).toBe(0);
  const beds = await sims.beds24.state();
  expect(beds.bookings.every((b: any) => b.status === 'cancelled')).toBe(true);
});
