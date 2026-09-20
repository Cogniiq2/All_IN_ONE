/**
 * Shared machinery for the Playwright suite: the database, the simulators,
 * the fake PayPal SDK, the booking dialog driver and forged operator
 * sessions. Every helper is deliberately thin so a failing test reads like
 * the case it covers.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { simControl } from '../tests/simulators/control.mjs';
import { E2E } from './global-setup';

interface State {
  app: string;
  paypal: string;
  beds24: string;
  syncSecret: string;
  n8nSecret: string;
  adminSecret: string;
  databaseUrl: string;
}

let cached: State | null = null;
export function state(): State {
  if (!cached) cached = JSON.parse(readFileSync(E2E.stateFile, 'utf8')) as State;
  return cached;
}

/* ── Database ─────────────────────────────────────────────────────────── */

export function sql(query: string): string {
  return execFileSync('psql', [state().databaseUrl, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

export interface IntentRow {
  reference: string;
  status: string;
  payment_status: string;
  beds24_booking_id: string | null;
  payment_order_id: string | null;
  payment_capture_id: string | null;
  paid_amount_cents: number | null;
  locale: string | null;
  refund_state: string | null;
  cancellation_authorized_by: string | null;
  guest_email: string | null;
}

export function intent(reference: string): IntentRow | null {
  const raw = sql(`select row_to_json(t) from (select reference, status, payment_status, beds24_booking_id, payment_order_id, payment_capture_id, paid_amount_cents, locale, refund_state, cancellation_authorized_by, guest_email from bolagio_booking_intents where reference = '${reference}') t`);
  return raw ? (JSON.parse(raw) as IntentRow) : null;
}

export function latestReference(): string {
  const ref = sql(`select reference from bolagio_booking_intents order by created_at desc limit 1`);
  if (!ref) throw new Error('no booking intent has been created');
  return ref;
}

export async function waitForIntent(reference: string, predicate: (row: IntentRow) => boolean, ms = 15_000): Promise<IntentRow> {
  const until = Date.now() + ms;
  let last: IntentRow | null = null;
  while (Date.now() < until) {
    last = intent(reference);
    if (last && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`waitForIntent timed out; last: ${JSON.stringify(last)}`);
}

/* ── Simulators and scheduled routes ─────────────────────────────────── */

export const sims = {
  get paypal() { return simControl(state().paypal); },
  get beds24() { return simControl(state().beds24); },
};

export async function resetAll(): Promise<void> {
  sql(`truncate bolagio_booking_intents cascade;
       truncate bolagio_outbox_events, bolagio_payment_events, bolagio_external_operations,
                bolagio_reconciliation_jobs, bolagio_scheduler_runs, bolagio_integration_events,
                bolagio_admin_audit_log, bolagio_unit_inventory_days, bolagio_message_deliveries,
                bolagio_integration_health, bolagio_turnover_events, bolagio_operators;
       update bolagio_units set is_bookable = (slug = 'schulstrasse-i');`);
  await sims.paypal.reset();
  await sims.paypal.config({ webhookTarget: `${state().app}/api/webhooks/paypal`, webhookId: 'WH-SIM-ID', autoWebhook: 'immediate' });
  await sims.beds24.reset();
  await sync();
}

async function scheduled(pathname: string, body: unknown): Promise<any> {
  const r = await fetch(`${state().app}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bolagio-signature': state().syncSecret }, body: JSON.stringify(body) });
  return r.json();
}
export const sync = () => scheduled('/api/booking/sync', {});
export const reconcile = (limit = 25) => scheduled('/api/booking/reconcile', { limit });
export const dueNow = () => { sql(`update bolagio_reconciliation_jobs set next_attempt_at = now() where status in ('pending','failed')`); };
export const lapseHold = (reference: string) => { sql(`update bolagio_booking_intents set hold_expires_at = now() - interval '10 minutes' where reference = '${reference}'`); };

/** What a lapsed lease goes through in production: the sweep, then the read of the provider, then the sweep again. */
export async function sweepLapsed(): Promise<void> {
  await sync();
  await reconcile();
  dueNow();
  await reconcile();
  await sync();
}

export async function captureViaApi(reference: string): Promise<{ status: number; body: any }> {
  ipCounter += 1;
  const r = await fetch(`${state().app}/api/booking/payment/capture`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.7.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}` }, body: JSON.stringify({ reference }) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/** A request the automation platform would make: HMAC-SHA256 over `v1:<ts>:<body>`, as n8n/README.md specifies. */
export async function internal(pathname: string, body: unknown): Promise<{ status: number; body: any }> {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const mac = createHmac('sha256', state().n8nSecret).update(`v1:${ts}:${raw}`).digest('hex');
  const r = await fetch(`${state().app}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bolagio-timestamp': ts, 'x-bolagio-signature': `v1=${mac}` },
    body: raw,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/* ── The browser ──────────────────────────────────────────────────────── */

let ipCounter = 0;
/** A distinct client per test, so the per-IP limiter never couples two cases. */
export async function isolateClient(page: Page): Promise<void> {
  ipCounter += 1;
  await page.setExtraHTTPHeaders({ 'cf-connecting-ip': `10.9.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}` });
}

/**
 * Replace PayPal's hosted SDK with a stand-in that exposes the same three
 * callbacks. It renders one button; clicking it asks OUR server for an
 * order exactly as the real SDK would, then leaves the buyer's decision to
 * the test, which approves at the simulator and triggers `onApprove`.
 */
export async function installFakePayPal(page: Page, variant: 'ok' | 'unavailable' = 'ok'): Promise<void> {
  await page.route('https://www.paypal.com/sdk/js**', async (route) => {
    if (variant === 'unavailable') return route.abort('failed');
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.paypal = { Buttons: function (opts) { return { render: function (el) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Simulated PayPal'; b.setAttribute('data-sim', 'paypal');
          var busy = false;
          b.onclick = function () { if (busy) return; busy = true; opts.createOrder().then(function (id) { window.__paypal = { orderId: id, opts: opts }; b.setAttribute('data-order', id); }).catch(function (e) { if (opts.onError) opts.onError(e); }).then(function () { busy = false; }); };
          el.appendChild(b); return Promise.resolve(); }, close: function () {} }; } };`,
    });
  });
}

/** The site's enquiry endpoint is a real external webhook: never let a test reach it. */
export async function stubEnquiryEndpoint(page: Page, calls: unknown[]): Promise<void> {
  await page.route('https://n8n.cogniiq.co/**', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

export function futureStay(offsetDays = 40, nights = 2): { arrival: string; departure: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const arrival = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + nights);
  return { arrival, departure: d.toISOString().slice(0, 10) };
}

export const GUEST = { name: 'Ada Lovelace', email: 'ada@example.com', phone: '+49 921 1234567' };

const dayLabel = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

export async function openBooking(page: Page, slug = 'schulstrasse-i'): Promise<void> {
  await page.goto(`/apartments/${slug}`);
  await page.getByRole('button', { name: 'Jetzt buchen' }).first().click();
  await expect(page.getByRole('heading', { name: 'Wie viele Personen reisen an?' })).toBeVisible();
}

export async function next(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Weiter' }).click();
}

/** Pick arrival and departure on the calendar, paging forward until the month is on screen. */
export async function pickDates(page: Page, stay: { arrival: string; departure: string }): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Wann möchten Sie kommen?' })).toBeVisible();
  for (const iso of [stay.arrival, stay.departure]) {
    const label = `${dayLabel(iso)} — frei`;
    for (let i = 0; i < 4; i += 1) {
      const day = page.getByRole('button', { name: label, exact: true });
      if (await day.count()) { await day.click(); break; }
      await page.getByRole('button', { name: 'Nächster Monat' }).click();
    }
  }
  // The grid may have paged to the departure's month; the summary line is the proof of selection.
  await expect(page.getByText(/Nächte gewählt|nights selected/)).toBeVisible();
}

export async function fillContact(page: Page, guest = GUEST): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Wie erreichen wir Sie?' })).toBeVisible();
  await page.locator('#bk-name').fill(guest.name);
  await page.locator('#bk-email').fill(guest.email);
  await page.locator('#bk-phone').fill(guest.phone);
}

/**
 * Drive the dialog to the payment step and submit: the intent is created,
 * the nights are held, and the (fake) PayPal button is on screen.
 */
export async function driveToPayment(page: Page, opts: { stay?: { arrival: string; departure: string }; guest?: typeof GUEST; slug?: string; expectPayPal?: boolean } = {}): Promise<string> {
  const stay = opts.stay ?? futureStay();
  await openBooking(page, opts.slug);
  await next(page);
  await pickDates(page, stay);
  await expect(page.getByText('Gesamtpreis')).toBeVisible();
  await next(page);
  await fillContact(page, opts.guest);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Wie möchten Sie zahlen?' })).toBeVisible();
  await page.getByRole('button', { name: /PayPal/ }).first().click();
  await page.getByRole('button', { name: 'Verbindlich buchen' }).click();
  if (opts.expectPayPal === false) return '';
  await expect(page.locator('[data-sim="paypal"]')).toBeVisible();
  const reference = latestReference();
  expect(intent(reference)?.status).toBe('hold_created');
  return reference;
}

/** Click the stand-in button: our server creates the order. */
export async function createOrder(page: Page): Promise<string> {
  const button = page.locator('[data-sim="paypal"]');
  await button.click();
  await expect(button).toHaveAttribute('data-order', /.+/);
  return (await button.getAttribute('data-order')) as string;
}

/** The buyer approves at PayPal (simulated) and returns to the page. */
export async function approveAndReturn(page: Page, orderId: string, webhook = true): Promise<void> {
  await sims.paypal.approve(orderId, webhook);
  await page.evaluate(() => (window as any).__paypal.opts.onApprove({ orderID: (window as any).__paypal.orderId }));
}

export async function buyerCancels(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__paypal.opts.onCancel());
}

/* ── BoLaGio Control ──────────────────────────────────────────────────── */

export async function operatorSession(context: BrowserContext, role: 'viewer' | 'operator' | 'admin', email = `${role}@example.com`): Promise<{ email: string }> {
  const { signSession } = await import('../lib/admin/session');
  const sub = randomUUID();
  sql(`insert into bolagio_operators (auth_user_id, email, display_name, role, active) values ('${sub}', '${email}', '${role} person', '${role}', true)
       on conflict (email) do update set auth_user_id = excluded.auth_user_id, role = excluded.role, active = true`);
  const token = await signSession({ sub, email }, state().adminSecret);
  await context.addCookies([{ name: 'bolagio_control_session', value: token, url: `${state().app}/admin`, httpOnly: true, sameSite: 'Lax' }]);
  return { email };
}

/* ── Fast fixtures through the public API ─────────────────────────────── */

async function api(pathname: string, body: unknown, ip: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${state().app}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

/** A confirmed booking made through the real routes, for admin cases that need one. */
export async function confirmedBooking(stay = futureStay(30, 2), guest = { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: '+1 555 0100', locale: 'de' }): Promise<string> {
  ipCounter += 1;
  const ip = `10.8.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`;
  const created = await api('/api/booking/intent', { unitSlug: 'schulstrasse-i', checkIn: stay.arrival, checkOut: stay.departure, adults: 2, children: 0, guest, attemptId: randomUUID() }, ip);
  if (created.status !== 201) throw new Error(`intent: ${created.status} ${JSON.stringify(created.body)}`);
  const reference = created.body.intent.reference as string;
  const order = await api('/api/booking/payment/order', { reference }, ip);
  await sims.paypal.approve(order.body.orderId, false);
  await api('/api/booking/payment/capture', { reference }, ip);
  await waitForIntent(reference, (r) => r.status === 'confirmed');
  // The operations pass derives the turnover the cleaning cases rely on.
  await reconcile();
  return reference;
}

export async function heldBooking(stay = futureStay(70, 2)): Promise<string> {
  ipCounter += 1;
  const ip = `10.8.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`;
  const created = await api('/api/booking/intent', { unitSlug: 'schulstrasse-i', checkIn: stay.arrival, checkOut: stay.departure, adults: 2, children: 0, guest: { firstName: 'Held', lastName: 'Guest', email: 'held@example.com', phone: '+49 921 000', locale: 'de' }, attemptId: randomUUID() }, ip);
  if (created.status !== 201) throw new Error(`intent: ${created.status} ${JSON.stringify(created.body)}`);
  return created.body.intent.reference as string;
}

export const BEDS24_ROOM = () => sql(`select external_room_id from bolagio_unit_integrations i join bolagio_units u on u.id = i.unit_id where u.slug = 'schulstrasse-i'`);
