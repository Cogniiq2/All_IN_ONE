/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE INTEGRATION HARNESS — real code, real database, simulated providers.
 *
 * What runs for real: every repository, command, saga and route handler in
 * lib/ and app/api/, `supabase-js` against PostgREST against Postgres with
 * the six migrations applied (scripts/test-stack.sh), the live Beds24
 * adapter and the PayPal adapter with their HTTP clients.
 *
 * What is simulated: the two providers, as HTTP servers with scripted
 * behaviour (tests/simulators). The adapters are pointed at them through the
 * two overrides that only a local deployment honours.
 *
 * Route handlers are served over HTTP by a tiny in-process app server, so a
 * simulated webhook reaches `app/api/webhooks/paypal/route.ts` the way a real
 * one would, and the PayPal-before-return / return-before-webhook orderings
 * are genuine races rather than call sequences.
 *
 * Usage, per test file:
 *   const h = await startHarness();   // beforeAll
 *   await h.resetDb();                // beforeEach
 *   await h.stop();                   // afterAll
 * ══════════════════════════════════════════════════════════════════════════
 */

import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { startPayPalSim } from '../simulators/paypal-sim.mjs';
import { startBeds24Sim } from '../simulators/beds24-sim.mjs';
import { simControl } from '../simulators/control.mjs';

export const SYNC_SECRET = 'integration-sync-secret';
export const N8N_SECRET = 'integration-n8n-secret-with-enough-length';
export const ADMIN_SECRET = 'integration-admin-session-secret-32chars-long';

export interface Harness {
  app: string;
  paypal: ReturnType<typeof simControl> & { url: string };
  beds24: ReturnType<typeof simControl> & { url: string };
  db: SupabaseClient;
  databaseUrl: string;
  sql: (query: string) => string;
  resetDb: () => Promise<void>;
  setBookable: (slug: string, bookable: boolean) => Promise<void>;
  /** Call a route handler over HTTP, as a browser or a scheduler would. */
  call: (method: string, pathname: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Headers }>;
  reconcile: (limit?: number) => Promise<any>;
  dueNow: () => void;
  sync: () => Promise<any>;
  stop: () => Promise<void>;
}

const ROOT = path.resolve(__dirname, '..', '..');

function loadStackEnv(): Record<string, string> {
  const dir = process.env.BOLAGIO_STACK_DIR ?? path.join(ROOT, '.stack');
  const file = path.join(dir, 'env');
  if (!existsSync(file)) {
    throw new Error(`Local stack not running: ${file} missing. Run scripts/test-stack.sh up`);
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

let requestCounter = 0;

export async function startHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const stack = loadStackEnv();
  const paypalSim = await startPayPalSim();
  const beds24Sim = await startBeds24Sim();

  const env: Record<string, string> = {
    APP_ENV: 'local',
    NODE_ENV: 'test',
    SUPABASE_URL: stack.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: stack.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: stack.SUPABASE_ANON_KEY,
    BEDS24_MODE: 'live',
    BEDS24_API_BASE_URL: beds24Sim.url,
    BEDS24_REFRESH_TOKEN: 'sim-refresh-token',
    BEDS24_WEBHOOK_SECRET: 'sim-beds24-webhook-secret',
    BEDS24_CONFIRMED_STATUS: 'confirmed',
    PAYPAL_MODE: 'sandbox',
    PAYPAL_SIMULATOR_URL: paypalSim.url,
    PAYPAL_CLIENT_ID: 'sim-client-id',
    PAYPAL_CLIENT_SECRET: 'sim-client-secret',
    PAYPAL_WEBHOOK_ID: 'WH-SIM-ID',
    DIRECT_BOOKING_ENABLED: 'true',
    // The sandbox legal fixture (lib/legal/readiness.ts `testTermsActive`):
    // honoured on local/staging only, so the checkout gate opens here without
    // an owner-approved production text.
    BOOKING_TEST_TERMS: 'true',
    // Every success heartbeat is written: the tests reset the database between
    // cases, and a per-isolate throttle would remember the previous case.
    OBSERVE_SUCCESS_INTERVAL_MS: '0',
    BOOKING_SYNC_SECRET: SYNC_SECRET,
    N8N_INTERNAL_SECRET: N8N_SECRET,
    ADMIN_SESSION_SECRET: ADMIN_SECRET,
    PROVIDER_TIMEOUT_MS: '1200',
    BOOKING_HOLD_MINUTES: '5',
    BOOKING_LEASE_GRACE_SECONDS: '30',
    MESSAGING_CONTACT_EMAIL: 'stay@example.com',
    ...overrides,
  };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  // Routes are imported AFTER the environment is set; every config value is
  // read at call time, but the Supabase client is cached on first use.
  const routes = await loadRoutes();

  const server = http.createServer((req, res) => {
    dispatch(routes, req, res).catch((cause) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'harness', detail: String(cause) }));
    });
  });
  const app: string = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));

  const paypal = Object.assign(simControl(paypalSim.url), { url: paypalSim.url });
  const beds24 = Object.assign(simControl(beds24Sim.url), { url: beds24Sim.url });
  await paypal.config({ webhookTarget: `${app}/api/webhooks/paypal`, webhookId: 'WH-SIM-ID', autoWebhook: 'immediate' });

  const db = createClient(stack.SUPABASE_URL, stack.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const databaseUrl = stack.DATABASE_URL;
  const sql = (query: string) => execFileSync('psql', [databaseUrl, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();

  const resetDb = async () => {
    // Per-isolate provider token caches would otherwise carry a token across
    // a test that scripts the token endpoint to fail.
    const [{ resetPayPalTokenCache }, { invalidateAccessToken }] = await Promise.all([
      import('@/lib/payments/paypal/client'),
      import('@/lib/integrations/beds24/auth'),
    ]);
    resetPayPalTokenCache();
    invalidateAccessToken();
    sql(`truncate bolagio_booking_intents cascade;
         truncate bolagio_outbox_events, bolagio_payment_events, bolagio_external_operations,
                  bolagio_reconciliation_jobs, bolagio_scheduler_runs, bolagio_integration_events,
                  bolagio_admin_audit_log, bolagio_unit_inventory_days, bolagio_message_deliveries,
                  bolagio_integration_health, bolagio_turnover_events;
         update bolagio_units set is_bookable = (slug = 'schulstrasse-i');`);
    execFileSync('psql', [databaseUrl, '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(ROOT, 'tests', 'sql', 'finance-reset.sql')], { encoding: 'utf8' });
    await paypal.reset();
    await paypal.config({ webhookTarget: `${app}/api/webhooks/paypal`, webhookId: 'WH-SIM-ID', autoWebhook: 'immediate' });
    await beds24.reset();
  };

  const call: Harness['call'] = async (method, pathname, body, headers = {}) => {
    requestCounter += 1;
    // A guest's browser echoes the versions of the terms it was shown. The
    // tests that are not ABOUT the terms send none, so the harness accepts
    // what is in force — exactly what the checkout would have displayed.
    if (pathname === '/api/booking/intent' && body && typeof body === 'object' && !('acceptedTerms' in body)) {
      const { resolveCheckoutTerms } = await import('@/lib/legal/readiness');
      const { versionsOf } = await import('@/lib/legal/booking-terms');
      const terms = resolveCheckoutTerms();
      if (terms) body = { ...(body as Record<string, unknown>), acceptedTerms: versionsOf(terms) };
    }
    const response = await fetch(`${app}${pathname}`, {
      method,
      headers: {
        'content-type': 'application/json',
        // A fresh client per request unless a test wants to hit the limiter.
        'cf-connecting-ip': `10.7.${Math.floor(requestCounter / 250) % 250}.${requestCounter % 250}`,
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: response.status, body: parsed, headers: response.headers };
  };

  /** Make every open reconciliation job due now (the backoff is real; tests skip the wait). */
  const dueNow = () => { sql(`update bolagio_reconciliation_jobs set next_attempt_at = now() where status in ('pending','failed')`); };

  const reconcile = async (limit = 25) => (await call('POST', '/api/booking/reconcile', { limit }, { 'x-bolagio-signature': SYNC_SECRET })).body;
  const syncRun = async () => (await call('POST', '/api/booking/sync', {}, { 'x-bolagio-signature': SYNC_SECRET })).body;

  return {
    app,
    paypal,
    beds24,
    db,
    databaseUrl,
    sql,
    resetDb,
    setBookable: async (slug, bookable) => { sql(`update bolagio_units set is_bookable = ${bookable} where slug = '${slug}'`); },
    call,
    reconcile,
    dueNow,
    sync: syncRun,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await paypalSim.close();
      await beds24Sim.close();
    },
  };
}

type Handler = (request: NextRequest) => Promise<Response>;
interface Routes { [key: string]: Handler }

async function loadRoutes(): Promise<Routes> {
  const [availability, quote, intent, status, order, capture, config, reconcile, sync, paypalWebhook, beds24Webhook, outbox, booking, health, messages, reservationSync, financeBackfill] = await Promise.all([
    import('@/app/api/booking/availability/route'),
    import('@/app/api/booking/quote/route'),
    import('@/app/api/booking/intent/route'),
    import('@/app/api/booking/status/route'),
    import('@/app/api/booking/payment/order/route'),
    import('@/app/api/booking/payment/capture/route'),
    import('@/app/api/booking/payment/config/route'),
    import('@/app/api/booking/reconcile/route'),
    import('@/app/api/booking/sync/route'),
    import('@/app/api/webhooks/paypal/route'),
    import('@/app/api/webhooks/beds24/route'),
    import('@/app/api/internal/outbox/route'),
    import('@/app/api/internal/booking/route'),
    import('@/app/api/internal/health/route'),
    import('@/app/api/internal/messages/route'),
    import('@/app/api/booking/reservations/sync/route'),
    import('@/app/api/booking/finance/backfill/route'),
  ]);
  return {
    'GET /api/booking/availability': availability.GET as Handler,
    'POST /api/booking/quote': quote.POST as Handler,
    'POST /api/booking/intent': intent.POST as Handler,
    'GET /api/booking/status': status.GET as Handler,
    'POST /api/booking/payment/order': order.POST as Handler,
    'POST /api/booking/payment/capture': capture.POST as Handler,
    'GET /api/booking/payment/config': config.GET as Handler,
    'POST /api/booking/reconcile': reconcile.POST as Handler,
    'POST /api/booking/sync': sync.POST as Handler,
    'POST /api/webhooks/paypal': paypalWebhook.POST as Handler,
    'POST /api/webhooks/beds24': beds24Webhook.POST as Handler,
    'POST /api/internal/outbox': outbox.POST as Handler,
    'GET /api/internal/booking': booking.GET as Handler,
    'GET /api/internal/health': health.GET as Handler,
    'POST /api/internal/messages': messages.POST as Handler,
    'POST /api/booking/reservations/sync': reservationSync.POST as Handler,
    'POST /api/booking/finance/backfill': financeBackfill.POST as Handler,
  };
}

async function dispatch(routes: Routes, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://app.local');
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'no route' }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new NextRequest(url.toString(), {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const response = await handler(request);
  const out: Record<string, string> = {};
  response.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/* ── Shared test helpers ────────────────────────────────────────────────── */

export const GUEST = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+49 170 0000000', country: 'DE', locale: 'de' as const };

/** A stay well in the future, so "today" never interferes. */
export function futureStay(offsetDays = 90, nights = 3): { checkIn: string; checkOut: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const checkIn = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + nights);
  return { checkIn, checkOut: d.toISOString().slice(0, 10) };
}

export async function intentRow(h: Harness, reference: string) {
  const { data, error } = await h.db.from('bolagio_booking_intents').select('*').eq('reference', reference).maybeSingle();
  if (error) throw error;
  return data as Record<string, any> | null;
}

export async function outboxTypes(h: Harness, reference: string): Promise<string[]> {
  const { data } = await h.db.from('bolagio_outbox_events').select('event_type').eq('reference', reference).order('created_at');
  return (data ?? []).map((r) => r.event_type as string);
}

export async function operations(h: Harness, reference: string) {
  const row = await intentRow(h, reference);
  if (!row) return [];
  const { data } = await h.db.from('bolagio_external_operations').select('operation_key, operation_type, outcome, attempts, resource_id').eq('intent_id', row.id).order('started_at');
  return data ?? [];
}

export async function jobs(h: Harness, reference: string) {
  const { data } = await h.db.from('bolagio_reconciliation_jobs').select('reason, severity, status, attempts').eq('reference', reference).order('created_at');
  return data ?? [];
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until a predicate over the intent row holds, or time out. */
export async function waitFor(h: Harness, reference: string, predicate: (row: Record<string, any>) => boolean, ms = 4000): Promise<Record<string, any>> {
  const until = Date.now() + ms;
  let last: Record<string, any> | null = null;
  while (Date.now() < until) {
    last = await intentRow(h, reference);
    if (last && predicate(last)) return last;
    await sleep(60);
  }
  throw new Error(`waitFor timed out; last row: ${JSON.stringify(last && { status: last.status, payment_status: last.payment_status })}`);
}

/** Take a booking from nothing to a hold through the real routes. */
export async function holdBooking(h: Harness, stay = futureStay()): Promise<{ reference: string; quote: any; intent: any }> {
  const created = await h.call('POST', '/api/booking/intent', {
    unitSlug: 'schulstrasse-i', ...stay, adults: 2, children: 0, guest: GUEST, attemptId: `attempt-${Date.now()}-${Math.random()}`,
  });
  if (created.status !== 201) throw new Error(`intent failed: ${created.status} ${JSON.stringify(created.body)}`);
  return { reference: created.body.intent.reference, quote: created.body.quote, intent: created.body.intent };
}

/** Create the PayPal order and simulate the buyer approving it. */
export async function approveOrder(h: Harness, reference: string, webhook = true): Promise<string> {
  const order = await h.call('POST', '/api/booking/payment/order', { reference });
  if (order.status !== 201) throw new Error(`order failed: ${order.status} ${JSON.stringify(order.body)}`);
  await h.paypal.approve(order.body.orderId, webhook);
  return order.body.orderId as string;
}

/** Sign an internal-API request the way n8n does. */
export async function signedHeaders(body: string, secret = N8N_SECRET): Promise<Record<string, string>> {
  const { sign } = await import('@/lib/n8n/signing');
  const ts = String(Math.floor(Date.now() / 1000));
  return { 'x-bolagio-timestamp': ts, 'x-bolagio-signature': `v1=${await sign(secret, ts, body)}` };
}
