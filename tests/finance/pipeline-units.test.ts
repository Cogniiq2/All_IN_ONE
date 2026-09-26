/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PIPELINE'S SMALL PARTS — what each must do on its own.
 *
 *   • the pass falls back to the bounded scan, and says so, when migration
 *     20260927 is not applied; a pass that cannot run records a failure
 *   • refund events become cash facts keyed like the saga's refunds
 *   • a validated-but-never-imported file is an inbox item
 *   • success heartbeats are throttled; failures never are
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ── A chainable stand-in for the Supabase client ─────────────────────── */

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcAnswer: (fn: string) => { data: unknown; error: { code: string; message: string } | null } = () => ({ data: null, error: null });

function query(): unknown {
  const result = { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: null, error: null });
      return () => self;
    },
  });
  return self;
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    from: () => query(),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return rpcAnswer(fn);
    },
  }),
}));

beforeEach(() => { calls.length = 0; rpcAnswer = () => ({ data: null, error: null }); });
afterEach(() => vi.unstubAllEnvs());

const observed = () => calls.filter((c) => c.fn === 'bolagio_observe_integration').map((c) => c.args.p_signal);

describe('runFinanceIngestionPass', () => {
  it('without migration 20260927 it runs the bounded scan and records that the pipeline is missing', async () => {
    rpcAnswer = (fn) => (fn === 'bolagio_finance_enqueue_missing' ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: null, error: null });
    const { runFinanceIngestionPass } = await import('@/lib/finance/commands');
    const r = await runFinanceIngestionPass({ actor: 'system:test' });
    expect(r.mode).toBe('scan');
    expect(observed()).toContain('pipeline.unavailable');
    expect(observed()).toContain('booking_ingestion.success');
    expect(calls.some((c) => c.fn === 'bolagio_finance_claim_ingestion')).toBe(false);
  });

  it('with the queue it claims a bounded batch: FINANCE_INGESTION_BATCH, default 5, never above 200', async () => {
    const { runFinanceIngestionPass, financeIngestionBatch } = await import('@/lib/finance/commands');
    rpcAnswer = (fn) => ({ data: fn === 'bolagio_finance_enqueue_missing' ? 0 : [], error: null });
    expect(financeIngestionBatch()).toBe(5);
    vi.stubEnv('FINANCE_INGESTION_BATCH', '500');
    expect(financeIngestionBatch()).toBe(200);
    vi.stubEnv('FINANCE_INGESTION_BATCH', '12');
    const r = await runFinanceIngestionPass({ actor: 'system:test' });
    expect(r).toMatchObject({ mode: 'queue', claimed: 0 });
    expect(calls.find((c) => c.fn === 'bolagio_finance_claim_ingestion')?.args.p_limit).toBe(12);
    expect(calls.find((c) => c.fn === 'bolagio_finance_enqueue_missing')?.args.p_force).toBe(false);
  });

  it('a pass that cannot run at all records booking_ingestion.failure and rethrows', async () => {
    rpcAnswer = (fn) => (fn === 'bolagio_finance_enqueue_missing' ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: null, error: null });
    const { runFinanceIngestionPass } = await import('@/lib/finance/commands');
    await expect(runFinanceIngestionPass({ actor: 'system:test' })).rejects.toThrow();
    expect(observed()).toContain('booking_ingestion.failure');
  });
});

describe('refund events → cash facts', () => {
  const booking = { intentId: 'i-1', reference: 'BLG-ABCDEF', paidCurrency: 'EUR', currency: 'EUR' };

  it('a REFUNDED event is outgoing cash keyed by the refund id, the saga’s own key', async () => {
    const { refundEventCashFact } = await import('@/lib/finance/ingestion-rules');
    expect(refundEventCashFact({ event_type: 'PAYMENT.CAPTURE.REFUNDED', provider_reference: 'REF-1', amount_cents: 5000, currency: 'EUR', occurred_at: '2026-09-20T10:00:00Z' }, booking)).toMatchObject({
      direction: 'out', source: 'paypal', provider_reference: 'REF-1', amount_cents: 5000, kind: 'refund', booking_intent_id: 'i-1', value_date: '2026-09-20',
    });
  });

  it('a REVERSED event is keyed apart from the capture it reverses, and says reversal', async () => {
    const { refundEventCashFact } = await import('@/lib/finance/ingestion-rules');
    const fact = refundEventCashFact({ event_type: 'PAYMENT.CAPTURE.REVERSED', provider_reference: 'reversal:CAP-1', amount_cents: 12000, currency: null, occurred_at: '2026-09-20T10:00:00Z' }, booking);
    expect(fact).toMatchObject({ provider_reference: 'reversal:CAP-1', currency: 'EUR', reference_text: 'reversal BLG-ABCDEF' });
  });

  it('no amount, no fact', async () => {
    const { refundEventCashFact } = await import('@/lib/finance/ingestion-rules');
    expect(refundEventCashFact({ event_type: 'PAYMENT.CAPTURE.REFUNDED', provider_reference: 'REF-1', amount_cents: 0, currency: 'EUR', occurred_at: '2026-09-20T10:00:00Z' }, booking)).toBeNull();
  });
});

describe('the Finance Inbox', () => {
  it('a statement validated and never imported is a HIGH item that says nothing of it is in the ledger', async () => {
    const { deriveInbox } = await import('@/lib/finance/inbox');
    const items = deriveInbox({
      today: '2026-09-26', transactions: [], lines: [], payments: [], pendingMatches: [], notices: [], deadlines: [], reserve: null, minibarMovements: [],
      imports: [{ id: 'b-1', source_type: 'booking_com_finance_statement', adapter: 'booking_com_finance_statement', adapter_version: '1', filename: 'statement.csv', sha256: 'x', byte_size: 1, row_count: 5, valid_rows: 5, error_rows: 0, duplicate_rows: 0, status: 'validated', error: null, imported_at: null, created_by: 'ops', created_at: '2026-09-23T17:56:22Z' }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'import_pending', level: 'high', href: '/admin/finance/imports/b-1' });
    expect(items[0].why).toMatch(/5 valid rows/);
  });
});

describe('integration heartbeats', () => {
  it('a success is recorded at most once a minute per provider; failures and other signals always', async () => {
    const { shouldObserve } = await import('@/lib/booking/commands');
    const t = 1_000_000;
    expect(shouldObserve('beds24', 'last_success', t)).toBe(true);
    expect(shouldObserve('beds24', 'last_success', t + 5_000)).toBe(false);
    expect(shouldObserve('paypal', 'last_success', t + 5_000)).toBe(true);
    expect(shouldObserve('beds24', 'last_failure', t + 5_000)).toBe(true);
    expect(shouldObserve('beds24', 'last_failure', t + 6_000)).toBe(true);
    expect(shouldObserve('paypal', 'last_verified_webhook', t + 6_000)).toBe(true);
    expect(shouldObserve('beds24', 'last_success', t + 61_000)).toBe(true);
    vi.stubEnv('OBSERVE_SUCCESS_INTERVAL_MS', '0');
    expect(shouldObserve('beds24', 'last_success', t + 61_001)).toBe(true);
  });
});
