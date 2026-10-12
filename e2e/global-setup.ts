/**
 * Start what the suite needs and leave it running: the two simulators (in
 * this process), and the built site served by `next start` (a child process)
 * with an environment that points every provider call at a simulator.
 *
 * The site is built here unless E2E_SKIP_BUILD=1, so a stale `.next` can
 * never make a test pass against yesterday's code.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.E2E_PORT ?? 3100);
const PAYPAL_PORT = 56441;
const BEDS24_PORT = 56442;

export const E2E = {
  app: `http://127.0.0.1:${PORT}`,
  paypal: `http://127.0.0.1:${PAYPAL_PORT}`,
  beds24: `http://127.0.0.1:${BEDS24_PORT}`,
  syncSecret: 'e2e-sync-secret-0123456789abcdef',
  n8nSecret: 'e2e-n8n-secret-0123456789abcdef0123',
  adminSecret: 'e2e-admin-session-secret-0123456789abcdef',
  stateFile: path.join(ROOT, 'e2e', '.artifacts', 'state.json'),
};

function loadStackEnv(): Record<string, string> {
  const file = path.join(process.env.BOLAGIO_STACK_DIR ?? path.join(ROOT, '.stack'), 'env');
  if (!existsSync(file)) throw new Error(`Local stack not running: ${file} missing. Run npm run stack:up`);
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function waitFor(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  let last = '';
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
      last = `status ${r.status}`;
    } catch (cause) {
      last = String(cause);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${url} did not come up: ${last}`);
}

const servers: { close: () => Promise<void> }[] = [];
let child: ChildProcess | null = null;

export default async function globalSetup(): Promise<void> {
  const stack = loadStackEnv();

  const [{ startPayPalSim }, { startBeds24Sim }] = await Promise.all([
    import('../tests/simulators/paypal-sim.mjs'),
    import('../tests/simulators/beds24-sim.mjs'),
  ]);
  const paypal = await startPayPalSim(PAYPAL_PORT);
  const beds24 = await startBeds24Sim(BEDS24_PORT);
  servers.push(paypal, beds24);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ENV: 'local',
    SUPABASE_URL: stack.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: stack.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: stack.SUPABASE_ANON_KEY,
    BEDS24_MODE: 'live',
    BEDS24_API_BASE_URL: E2E.beds24,
    BEDS24_REFRESH_TOKEN: 'sim-refresh-token',
    BEDS24_WEBHOOK_SECRET: 'sim-beds24-webhook-secret',
    BEDS24_CONFIRMED_STATUS: 'confirmed',
    PAYPAL_MODE: 'sandbox',
    PAYPAL_SIMULATOR_URL: E2E.paypal,
    PAYPAL_CLIENT_ID: 'sim-client-id',
    PAYPAL_CLIENT_SECRET: 'sim-client-secret',
    PAYPAL_WEBHOOK_ID: 'WH-SIM-ID',
    DIRECT_BOOKING_ENABLED: 'true',
    BOOKING_SYNC_SECRET: E2E.syncSecret,
    N8N_INTERNAL_SECRET: E2E.n8nSecret,
    ADMIN_SESSION_SECRET: E2E.adminSecret,
    // Test-only switches, permitted on APP_ENV=local and refused elsewhere.
    OPERATOR_PAID_CANCELLATION_ENABLED: 'true',
    // The sandbox legal fixture (lib/legal/readiness.ts): local/staging only.
    BOOKING_TEST_TERMS: 'true',
    MESSAGING_TEST_COMPLETIONS_ALLOWED: 'true',
    MESSAGING_CONTACT_EMAIL: 'stay@example.com',
    PROVIDER_TIMEOUT_MS: '1500',
    BOOKING_HOLD_MINUTES: '5',
    BOOKING_LEASE_GRACE_SECONDS: '30',
    PORT: String(PORT),
  };

  if (process.env.E2E_SKIP_BUILD !== '1') {
    const build = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: ROOT, env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit' });
    if (build.status !== 0) throw new Error('next build failed');
  }

  // Its own process group, so teardown can end next-server and its workers together.
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT), '-H', '127.0.0.1'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child = server;
  const log: string[] = [];
  // The whole server output is kept for a failing run (e2e/.artifacts/server.log).
  mkdirSync(path.dirname(E2E.stateFile), { recursive: true });
  const serverLog = createWriteStream(path.join(path.dirname(E2E.stateFile), 'server.log'), { flags: 'w' });
  server.stdout?.on('data', (d) => { log.push(String(d)); serverLog.write(d); });
  server.stderr?.on('data', (d) => { log.push(String(d)); serverLog.write(d); });
  try {
    await waitFor(`${E2E.app}/api/booking/availability?unit=schulstrasse-i`, 60_000);
  } catch (cause) {
    throw new Error(`${String(cause)}\n${log.join('')}`);
  }

  await fetch(`${E2E.paypal}/__sim/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ webhookTarget: `${E2E.app}/api/webhooks/paypal`, webhookId: 'WH-SIM-ID', autoWebhook: 'immediate' }) });

  // Workers are separate processes: hand them what they need through a file.
  mkdirSync(path.dirname(E2E.stateFile), { recursive: true });
  writeFileSync(E2E.stateFile, JSON.stringify({ ...E2E, databaseUrl: stack.DATABASE_URL, pid: server.pid }), 'utf8');
  process.env.E2E_BASE_URL = E2E.app;

  (globalThis as { __e2e?: unknown }).__e2e = { servers, child };
}
