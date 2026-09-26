/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FINANCE HEALTH CARD TELLS THE TRUTH ABOUT THE PIPELINE.
 *
 * A dashboard whose ledger has stopped keeping up must say so before anyone
 * reads a figure from it. Each case below is a way the pipeline can be
 * broken or incomplete, and the verdict the card must reach.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinancePipelineStatus, FinanceRowSource } from '@/lib/finance/rows';

let pipeline: FinancePipelineStatus | null = null;
vi.mock('@/lib/finance/source', async () => {
  const { fixtureFinanceSource } = await import('@/lib/finance/fixtures');
  const { AdminUnconfiguredError } = await import('@/lib/admin/source');
  return {
    AdminUnconfiguredError,
    financeRowSource: async (): Promise<FinanceRowSource> => ({ ...fixtureFinanceSource(), pipelineStatus: async () => pipeline }),
  };
});

const NOW = new Date();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function healthy(): FinancePipelineStatus {
  return {
    observed_at: NOW.toISOString(), queue_pending: 0, queue_failed: 0, queue_oldest_at: null, queue_last_error: null, ledger_gaps: 0, revenue_intents: 3, booking_revenue_posted: 3,
    payment_events_unprocessed: 0, payment_events_oldest_at: null, payment_event_last_verified_at: minutesAgo(60), refund_events_unattributed: 0,
    import_batches_awaiting_commit: 0, import_rows_awaiting_commit: 0, settlements_ledger_pending: 0, settlements_unmatched: 0,
    reservations: 16, reservations_last_synced_at: minutesAgo(30), reconcile_last_ok_at: minutesAgo(2), reservation_sync_last_ok_at: minutesAgo(30), reservation_sync_last_failed_at: null,
  };
}

async function health() {
  const { loadFinanceHealth } = await import('@/lib/finance/queries');
  return loadFinanceHealth(NOW);
}

beforeEach(() => { pipeline = healthy(); });

describe('the finance health verdict', () => {
  it('the pipeline migration missing is a degraded card that names it', async () => {
    pipeline = null;
    const h = await health();
    expect(h.status).toBe('degraded');
    expect(h.facts.find((f) => f.label === 'ingestion pipeline')?.value).toBe('not installed');
    expect(h.summary).toMatch(/20260927/);
  });

  it('bookings waiting more than 30 minutes for the ledger is lag, and degraded', async () => {
    pipeline = { ...healthy(), ledger_gaps: 4, queue_pending: 4, queue_oldest_at: minutesAgo(45) };
    const h = await health();
    expect(h.status).toBe('degraded');
    expect(h.facts.find((f) => f.label === 'ledger lag')).toMatchObject({ value: '4 bookings not yet in the ledger', tone: 'critical' });
    expect(h.summary).toMatch(/Do not rely on the figures/);
  });

  it('a failed ingestion is critical and quotes the latest error', async () => {
    pipeline = { ...healthy(), queue_failed: 1, queue_last_error: 'BLG-ABCDEF (revenue): period 2026-09 is locked' };
    const h = await health();
    expect(h.status).toBe('degraded');
    expect(h.summary).toMatch(/period 2026-09 is locked/);
  });

  it('verified PayPal events left unprocessed for more than 15 minutes are degraded', async () => {
    pipeline = { ...healthy(), payment_events_unprocessed: 2, payment_events_oldest_at: minutesAgo(40) };
    expect((await health()).status).toBe('degraded');
  });

  it('a reconcile schedule that stopped is degraded: payments and finance are not being processed', async () => {
    pipeline = { ...healthy(), reconcile_last_ok_at: minutesAgo(90) };
    const h = await health();
    expect(h.status).toBe('degraded');
    expect(h.summary).toMatch(/not being processed/);
  });

  it('statement files validated but never imported put the card on attention and say none of it is in a figure', async () => {
    pipeline = { ...healthy(), import_batches_awaiting_commit: 2, import_rows_awaiting_commit: 6 };
    const h = await health();
    expect(['attention', 'degraded']).toContain(h.status);
    expect(h.facts.find((f) => f.label === 'imports not posted')?.value).toBe('2 files · 6 rows');
    expect(h.summary).toMatch(/validated but never imported/);
  });

  it('a refund PayPal reported for no known booking is critical', async () => {
    pipeline = { ...healthy(), refund_events_unattributed: 1 };
    const h = await health();
    expect(h.status).toBe('degraded');
    expect(h.facts.find((f) => f.label === 'refunds without a booking')?.tone).toBe('critical');
  });

  it('shows the last verified PayPal webhook and the Beds24 reservation sync', async () => {
    const h = await health();
    expect(h.facts.find((f) => f.label === 'last verified PayPal webhook')?.value).toBe('60 min ago');
    expect(h.facts.find((f) => f.label === 'Beds24 reservation sync')?.value).toBe('30 min ago');
    pipeline = { ...healthy(), reservation_sync_last_failed_at: minutesAgo(5) };
    expect((await health()).facts.find((f) => f.label === 'Beds24 reservation sync')).toMatchObject({ value: 'last run failed', tone: 'caution' });
  });
});
