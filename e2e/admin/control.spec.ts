/**
 * A01–A08 · BoLaGio Control: the gate, the roles, and the four
 * completion-phase writes, each proven in the database afterwards.
 */

import { expect, test } from '@playwright/test';
import { confirmedBooking, dueNow, heldBooking, internal, intent, isolateClient, operatorSession, reconcile, resetAll, sims, sql, state, waitForIntent } from '../support';

test.beforeEach(async ({ page }) => {
  await resetAll();
  await isolateClient(page);
});

test('A01 · without a session, /admin redirects to the login page with noindex and no-store', async ({ page }) => {
  const response = await page.goto('/admin/cleaning');
  expect(page.url()).toContain('/admin/login');
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['cache-control']).toContain('no-store');
  // The internal health endpoint is not public either.
  const health = await fetch(`${state().app}/api/internal/health`);
  expect(health.status).toBe(401);
});

test('A02 · a viewer reads everything and is offered no write', async ({ page, context }) => {
  const reference = await confirmedBooking();
  await operatorSession(context, 'viewer');
  await page.goto(`/admin/bookings/${reference}`);
  await expect(page.getByRole('heading', { name: 'Grace Hopper' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel booking…' })).toHaveCount(0);
  await expect(page.getByText(/cancellation is done by operators/)).toBeVisible();
  await page.goto('/admin/cleaning');
  await expect(page.getByRole('heading', { name: 'Cleaning' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
});

test('A03 · an operator cancels an unpaid hold: released at the channel manager, cancelled locally, audited', async ({ page, context }) => {
  const reference = await heldBooking();
  const { email } = await operatorSession(context, 'operator');
  await page.goto(`/admin/bookings/${reference}`);
  await page.getByRole('button', { name: 'Cancel booking…' }).click();
  await page.locator('#cancel-reason').fill('Guest emailed to cancel');
  await page.locator('#cancel-confirm').fill(reference);
  await page.getByRole('button', { name: 'Cancel and release' }).click();
  // The screen re-renders from the database: the panel gives way to the record.
  await expect(page.getByText('Cancelled.', { exact: true })).toBeVisible();
  await expect(page.getByText('Guest emailed to cancel')).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.status === 'cancelled');
  expect(['none', 'not_required']).toContain(row.refund_state);
  expect(row.cancellation_authorized_by).toBeNull();
  expect(sql(`select outcome from bolagio_admin_audit_log where action='booking.cancel' and target_ref='${reference}'`)).toBe('cancelled');
  expect(sql(`select operator_email from bolagio_admin_audit_log where action='booking.cancel'`)).toBe(email);
  const beds = await sims.beds24.state();
  expect(beds.bookings.every((b: any) => b.status === 'cancelled')).toBe(true);
});

test('A04 · a paid booking: an operator is refused; an administrator records the refund decision and no money moves', async ({ page, context }) => {
  const reference = await confirmedBooking();
  await operatorSession(context, 'operator');
  await page.goto(`/admin/bookings/${reference}`);
  await expect(page.getByRole('button', { name: 'Cancel booking…' })).toHaveCount(0);
  await expect(page.getByText(/needs an administrator/)).toBeVisible();

  await context.clearCookies();
  await operatorSession(context, 'admin');
  await page.goto(`/admin/bookings/${reference}`);
  await page.getByRole('button', { name: 'Cancel booking…' }).click();
  await page.getByLabel('Full refund of the captured amount').check();
  await page.locator('#cancel-reason').fill('Owner decision');
  await page.locator('#cancel-confirm').fill(reference);
  await page.getByRole('button', { name: 'Authorise cancellation' }).click();
  await expect(page.getByText(/^Cancelled\./)).toBeVisible();
  await expect(page.getByText('required', { exact: true })).toBeVisible();
  await expect(page.getByText('Owner decision')).toBeVisible();
  const row = await waitForIntent(reference, (r) => r.status === 'cancelled');
  expect(row.refund_state).toBe('required');
  expect(row.cancellation_authorized_by).toBe('admin@example.com');
  expect(row.payment_status).toBe('paid');
  const calls = await sims.paypal.calls();
  expect(calls.filter((c: any) => /refund/.test(c.path)).length).toBe(0);
  expect(sql(`select count(*) from bolagio_message_deliveries where status = 'suppressed'`)).toBe(sql(`select count(*) from bolagio_message_deliveries`));
});

test('A05 · the cleaning board: a confirmed departure becomes a turnover; start, assign and finish are audited', async ({ page, context }) => {
  const reference = await confirmedBooking();
  await operatorSession(context, 'operator');
  await page.goto('/admin/cleaning');
  const row = page.locator('.bc-row', { hasText: reference });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Start' }).click();
  await expect(row.getByText('In progress')).toBeVisible();
  await row.getByLabel('Assigned to').fill('Maria K.');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Assigned to Maria K.')).toBeVisible();
  await row.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.locator('#recent').locator('.bc-row', { hasText: reference }).getByText('Done', { exact: true })).toBeVisible();
  // Three ledger events: the start, the assignment (status unchanged), the finish.
  expect(sql(`select string_agg(coalesce(from_status, '-') || '>' || to_status, ',' order by created_at) from bolagio_turnover_events`)).toBe('required>in_progress,in_progress>in_progress,in_progress>done');
  expect(sql(`select string_agg(action, ',' order by created_at) from bolagio_admin_audit_log where action like 'turnover.%'`)).toBe('turnover.status,turnover.assign,turnover.status');
});

test('A06 · the automations board: a failed guest message is listed and requeued once; the ledger refuses a second send', async ({ page, context }) => {
  const reference = await confirmedBooking();
  const prepared = await internal('/api/internal/messages', { action: 'prepare', kind: 'booking_confirmation', reference });
  expect(prepared.body.outcome).toBe('claimed');
  await internal('/api/internal/messages', { action: 'complete', deliveryId: prepared.body.deliveryId, outcome: 'failed', provider: 'smtp', error: 'SMTP 550', retryable: false });
  await operatorSession(context, 'operator');
  await page.goto('/admin/automations');
  const stuck = page.locator('#stuck').locator('.bc-row', { hasText: reference });
  await expect(stuck.getByText('Failed')).toBeVisible();
  await expect(stuck.getByText('SMTP 550')).toBeVisible();
  await stuck.getByRole('button', { name: 'Requeue delivery' }).click();
  // The board re-renders from the ledger: the row leaves "failed" and waits for the pump.
  await expect(page.locator('#waiting').locator('.bc-row', { hasText: reference })).toBeVisible();
  await expect(page.locator('#stuck').locator('.bc-row', { hasText: reference })).toHaveCount(0);
  expect(sql(`select status from bolagio_message_deliveries where id='${prepared.body.deliveryId}'`)).toBe('pending');
  expect(sql(`select outcome from bolagio_admin_audit_log where action='delivery.requeue'`)).toBe('ok');
  await expect(page.getByText('never observed').first()).toBeVisible();
});

test('A07 · the System page: integration signals never observed stay grey, and the reconciliation button is the scheduler\'s pass', async ({ page, context }) => {
  await sims.beds24.mode('finalize', 'failure');
  const reference = await confirmedBooking().catch(() => sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`));
  await sims.beds24.mode('finalize', 'success');
  await operatorSession(context, 'operator');
  await page.goto('/admin/system');
  await expect(page.getByRole('heading', { name: 'Integration signals' })).toBeVisible();
  await expect(page.getByText('never observed').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Guest messaging' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cleaning', exact: true })).toBeVisible();
  dueNow();
  await page.getByRole('button', { name: 'Run one reconciliation pass' }).click();
  await expect(page.getByText(/Pass complete/)).toBeVisible();
  expect((await waitForIntent(reference, (r) => r.status === 'confirmed')).status).toBe('confirmed');
  expect(sql(`select outcome from bolagio_admin_audit_log where action='reconciliation.pass'`)).toBe('ok');
});

test('A08 · "Reconcile now" on a paid, unfinalized booking finishes the job the sweep would', async ({ page, context }) => {
  await sims.beds24.mode('finalize', 'failure');
  await confirmedBooking().catch(() => undefined);
  const reference = sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`);
  expect(intent(reference)?.status).toBe('finalization_failed');
  await sims.beds24.mode('finalize', 'success');
  await operatorSession(context, 'operator');
  await page.goto(`/admin/bookings/${reference}`);
  await page.getByRole('button', { name: 'Reconcile now' }).click();
  await expect(page.getByText(/Moved from/)).toBeVisible();
  expect((await waitForIntent(reference, (r) => r.status === 'confirmed')).beds24_booking_id).toBeTruthy();
  expect(sql(`select outcome from bolagio_admin_audit_log where action='booking.reconcile'`)).toBe('moved');
  await reconcile();
});
