/**
 * G21 · The whole journey on a phone, with no horizontal overflow at any step.
 */

import { expect, test } from '@playwright/test';
import { approveAndReturn, createOrder, driveToPayment, installFakePayPal, isolateClient, resetAll, waitForIntent } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
  await installFakePayPal(page);
});

async function noOverflow(page: import('@playwright/test').Page): Promise<void> {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, 'horizontal overflow').toBeLessThanOrEqual(inner);
}

test('G21 · on a phone the guest books and pays without horizontal overflow', async ({ page }) => {
  await page.goto('/apartments/schulstrasse-i');
  await noOverflow(page);
  const reference = await driveToPayment(page);
  await noOverflow(page);
  const orderId = await createOrder(page);
  await approveAndReturn(page, orderId, true);
  await expect(page.getByRole('heading', { name: 'Ihre Buchung ist bestätigt' })).toBeVisible();
  await noOverflow(page);
  expect((await waitForIntent(reference, (r) => r.status === 'confirmed')).payment_status).toBe('paid');
});
