/**
 * G05–G11 · What the payment step does when PayPal misbehaves. Every case
 * ends with the database in a state a person can explain, and the screen
 * saying what is true.
 */

import { expect, test } from '@playwright/test';
import { approveAndReturn, captureViaApi, createOrder, driveToPayment, dueNow, installFakePayPal, intent, isolateClient, lapseHold, reconcile, resetAll, sims, sql, sweepLapsed, waitForIntent } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
  await installFakePayPal(page);
});

test('G05 · declined instrument: "nichts abgebucht", payment denied, hold intact, the button is offered again', async ({ page }) => {
  await sims.paypal.mode('capture', 'decline');
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, false);
  await expect(page.getByText('Die sichere Zahlungsseite konnte nicht geöffnet werden. Es wurde nichts abgebucht.')).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.payment_status === 'denied');
  expect(row.status).toBe('payment_failed');
  expect(row.payment_capture_id).toBeNull();
  // The guest tries again: the same attempt is replayed (no second hold), the same order is reused, and the capture succeeds.
  await sims.paypal.mode('capture', 'success');
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();
  await expect(page.locator('[data-sim="paypal"]')).toBeVisible();
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('1');
  const again = await createOrder(page);
  expect(again).toBe(orderId);
  await approveAndReturn(page, orderId, false);
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toBeVisible();
  expect((await waitForIntent(reference, (r) => r.status === 'confirmed')).payment_status).toBe('paid');
});

test('G06 · capture answer lost: the guest is told to wait and not retry; reconciliation reads the order and confirms', async ({ page }) => {
  await sims.paypal.mode('capture', 'response_lost');
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, false);
  await expect(page.getByText(/Wir prüfen gerade den Stand Ihrer Buchung/)).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.payment_status === 'unknown');
  expect(row.status).toBe('payment_session_created');
  expect(sql(`select count(*) from bolagio_external_operations where outcome='outcome_unknown'`)).toBe('1');

  await sims.paypal.mode('capture', 'success');
  dueNow();
  await reconcile();
  const after = await waitForIntent(reference, (r) => r.status === 'confirmed');
  expect(after.payment_status).toBe('paid');
  // The capture was executed once at the provider; the second was a read, not a resend.
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /capture$/.test(c.path)).length).toBe(1);
});

test('G07 · the webhook lands before the browser returns: the inbox applies the capture first and the browser\'s own capture is a harmless duplicate', async ({ page }) => {
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  await sims.paypal.approve(orderId, false);
  // A slow browser: the capture runs server-side and the webhook is processed before the page acts on the answer.
  expect((await captureViaApi(reference)).status).toBe(200);
  await reconcile();
  await waitForIntent(reference, (r) => r.payment_status === 'paid');
  await page.evaluate(() => (window as any).__paypal.opts.onApprove({ orderID: (window as any).__paypal.orderId }));
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.status === 'confirmed');
  expect(row.payment_status).toBe('paid');
  expect(sql(`select count(*) from bolagio_booking_intent_events where to_status = 'paid'`)).toBe('1');
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /capture$/.test(c.path)).length).toBe(1);
});

test('G08 · a double click on the payment button creates one order, and one approval confirms one booking', async ({ page }) => {
  const reference = await driveToPayment(page);
  const button = page.locator('[data-sim="paypal"]');
  await button.dblclick();
  await expect(button).toHaveAttribute('data-order', /.+/);
  const orderId = (await button.getAttribute('data-order')) as string;
  await page.waitForTimeout(300);
  expect((await sims.paypal.state()).orders.length).toBe(1);
  expect(intent(reference)?.payment_order_id).toBe(orderId);
  await approveAndReturn(page, orderId, false);
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toBeVisible();
  await waitForIntent(reference, (r) => r.status === 'confirmed');
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /capture$/.test(c.path)).length).toBe(1);
  expect(sql(`select count(*) from bolagio_booking_intents`)).toBe('1');
});

test('G09 · the hold lapsed while the guest dawdled at PayPal: the capture is refused, nothing is charged, the guest is told why', async ({ page }) => {
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  lapseHold(reference);
  await sweepLapsed();
  await waitForIntent(reference, (r) => r.status === 'released');
  await approveAndReturn(page, orderId, false);
  await expect(page.getByText(/Ihre Reservierung ist abgelaufen/)).toBeVisible();
  const row = intent(reference)!;
  expect(row.status).toBe('released');
  expect(row.payment_capture_id).toBeNull();
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /capture$/.test(c.path)).length).toBe(0);
});

test('G10 · PENDING capture: "Zahlung erhalten" is not shown as confirmed; a later COMPLETED webhook confirms', async ({ page }) => {
  await sims.paypal.config({ autoWebhook: 'none' });
  await sims.paypal.mode('capture', 'pending');
  const reference = await driveToPayment(page);
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, false);
  await expect(page.getByRole('heading', { name: 'Zahlung erhalten' })).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.payment_status === 'capture_pending');
  expect(row.status).toBe('payment_pending');
  // The eCheck clears at the provider.
  const captureId = (await sims.paypal.state()).captures[0].id;
  await sims.paypal.webhook({ captureId, type: 'PAYMENT.CAPTURE.COMPLETED', resourceOverride: { status: 'COMPLETED' } });
  await reconcile();
  expect((await waitForIntent(reference, (r) => r.status === 'confirmed')).payment_status).toBe('paid');
});

test('G11 · the PayPal SDK cannot load: the guest is told nothing was charged; the hold stands; no order exists', async ({ page }) => {
  await page.unroute('https://www.paypal.com/sdk/js**');
  await installFakePayPal(page, 'unavailable');
  await driveToPayment(page, { expectPayPal: false });
  await expect(page.getByText('Die sichere Zahlungsseite konnte nicht geöffnet werden. Es wurde nichts abgebucht.')).toBeVisible();
  const reference = sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`);
  const row = await waitForIntent(reference, (r) => r.status === 'hold_created');
  expect(row.status).toBe('hold_created');
  expect(row.payment_order_id).toBeNull();
});
