/**
 * ══════════════════════════════════════════════════════════════════════════
 * ALERT CLASSIFICATION — pure, deterministic, and honest about the unknown.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { deriveAlerts, INVENTORY_STALE_MS, SCHEDULER_INTERVAL_MS, WEBHOOK_BACKLOG_MS, type AlertInput } from '@/lib/ops/alerts';
import type { AttentionItem } from '@/lib/admin/dto';

const NOW = new Date('2026-09-20T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function item(over: Partial<AttentionItem>): AttentionItem {
  return {
    id: 'booking:BLG-AAAAAA:x', level: 'watch', category: 'booking', code: null, title: '', explanation: '', nextStep: '',
    reference: 'BLG-AAAAAA', unitSlug: null, unitName: null, since: ago(60_000), moneyInvolved: 'unknown', inventoryHeld: 'unknown', href: null,
    ...over,
  };
}

function quiet(over: Partial<AlertInput> = {}): AlertInput {
  return {
    now: NOW,
    queues: [],
    databaseReachable: true,
    schedulers: [
      { job: 'reconcile', started_at: ago(70_000), finished_at: ago(60_000), ok: true, report: null, error: null, worker: null },
      { job: 'operations', started_at: ago(60_000), finished_at: ago(60_000), ok: true, report: null, error: null, worker: null },
      { job: 'inventory_sync', started_at: ago(600_000), finished_at: ago(600_000), ok: true, report: null, error: null, worker: null },
    ],
    attention: [],
    configFindings: [],
    inventory: [{ unitSlug: 'schulstrasse-i', oldestSync: ago(60_000) }],
    deliveries: { stuck: 0, retrying: 0, waiting: 0, oldestWaiting: null },
    turnovers: { overdue: 0, unassignedSoon: 0 },
    refunds: { required: 0, pending: 0, unknown: 0, failed: 0, references: [] },
    integrations: [
      { provider: 'beds24', signal: 'last_success', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'beds24', signal: 'last_failure', label: '', status: 'observed', observedAt: ago(600_000), detail: null },
      { provider: 'paypal', signal: 'last_success', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'paypal', signal: 'last_failure', label: '', status: 'observed', observedAt: ago(600_000), detail: null },
      { provider: 'paypal', signal: 'last_verified_webhook', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'n8n', signal: 'last_claim', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'n8n', signal: 'last_ack', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'n8n', signal: 'last_fail', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'n8n', signal: 'last_message_prepare', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
      { provider: 'n8n', signal: 'last_message_complete', label: '', status: 'observed', observedAt: ago(60_000), detail: null },
    ],
    ...over,
  };
}

describe('a quiet system', () => {
  it('raises nothing and reports nothing unmeasured', () => {
    const report = deriveAlerts(quiet());
    expect(report.alerts).toEqual([]);
    expect(report.notInstrumented).toEqual([]);
    expect(report.counts).toEqual({ CRITICAL: 0, HIGH: 0, MEDIUM: 0 });
  });
});

describe('CRITICAL', () => {
  it('paid but not finalized', () => {
    const report = deriveAlerts(quiet({ attention: [item({ id: 'booking:BLG-AAAAAA:unfinalized', level: 'critical', code: 'PAID_BOOKING_UNFINALIZED' })] }));
    expect(report.alerts[0]).toMatchObject({ level: 'CRITICAL', code: 'PAID_UNFINALIZED', count: 1, references: ['BLG-AAAAAA'] });
  });

  it('unknown external write outcome', () => {
    const report = deriveAlerts(quiet({ attention: [item({ id: 'operation:op-1', category: 'external_operation', level: 'critical', code: 'BEDS24_HOLD_OUTCOME_UNKNOWN' })] }));
    expect(report.alerts.map((a) => a.code)).toContain('EXTERNAL_OUTCOME_UNKNOWN');
    expect(report.counts.CRITICAL).toBe(1);
  });

  it('database unavailable', () => {
    const report = deriveAlerts(quiet({ databaseReachable: false, queues: null }));
    expect(report.alerts.map((a) => a.code)).toContain('DATABASE_UNAVAILABLE');
    expect(report.notInstrumented).toContain('queues');
  });

  it('a verified payment event that cannot be processed', () => {
    const report = deriveAlerts(quiet({ queues: [{ queue: 'payment_events', state: 'exhausted', items: 1, oldest: ago(1) }] }));
    expect(report.alerts.map((a) => a.code)).toContain('PAYMENT_EVENT_UNPROCESSABLE');
  });

  it('a release unverified for over an hour, HIGH before that', () => {
    const fresh = deriveAlerts(quiet({ attention: [item({ id: 'booking:BLG-AAAAAA:release_failed', level: 'high', since: ago(10 * 60_000) })] }));
    expect(fresh.alerts[0]).toMatchObject({ level: 'HIGH', code: 'RELEASE_FAILED' });
    const old = deriveAlerts(quiet({ attention: [item({ id: 'booking:BLG-AAAAAA:release_failed', level: 'high', since: ago(2 * 60 * 60_000) })] }));
    expect(old.alerts[0]).toMatchObject({ level: 'CRITICAL', code: 'RELEASE_FAILED_PERSISTENT' });
  });
});

describe('HIGH', () => {
  it('exhausted reconciliation, dead-lettered outbox, webhook backlog', () => {
    const report = deriveAlerts(
      quiet({
        queues: [
          { queue: 'reconciliation', state: 'exhausted', items: 2, oldest: ago(1) },
          { queue: 'outbox', state: 'exhausted', items: 1, oldest: ago(1) },
          { queue: 'payment_events', state: 'pending', items: 3, oldest: ago(WEBHOOK_BACKLOG_MS + 1) },
        ],
      })
    );
    const codes = report.alerts.map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['RECONCILIATION_EXHAUSTED', 'OUTBOX_DEAD_LETTER', 'WEBHOOK_BACKLOG']));
    expect(report.alerts.every((a) => a.level === 'HIGH')).toBe(true);
  });

  it('a stale hold and a failing inventory sync', () => {
    const report = deriveAlerts(
      quiet({
        attention: [item({ code: 'BOOKING_HOLD_STALE', level: 'elevated' })],
        schedulers: quiet().schedulers.map((s) => (s.job === 'inventory_sync' ? { ...s, ok: false } : s)),
      })
    );
    expect(report.alerts.map((a) => a.code)).toEqual(expect.arrayContaining(['STALE_HOLD', 'INVENTORY_SYNC_FAILING']));
  });

  it('a configuration contradiction', () => {
    const report = deriveAlerts(quiet({ configFindings: [{ code: 'LIVE_PAYPAL_OUTSIDE_PRODUCTION', severity: 'refuse', message: 'x' }] }));
    expect(report.alerts[0]).toMatchObject({ level: 'HIGH', code: 'CONFIGURATION_CONTRADICTION' });
  });
});

describe('MEDIUM and the unknown', () => {
  it('a stale cache', () => {
    const report = deriveAlerts(quiet({ inventory: [{ unitSlug: 'schulstrasse-i', oldestSync: ago(INVENTORY_STALE_MS + 1) }] }));
    expect(report.alerts[0]).toMatchObject({ level: 'MEDIUM', code: 'CACHE_STALE' });
  });

  it('an overdue scheduler is HIGH for money jobs and MEDIUM for operations', () => {
    const report = deriveAlerts(
      quiet({
        schedulers: quiet().schedulers.map((s) => ({ ...s, finished_at: ago(SCHEDULER_INTERVAL_MS[s.job] + 60_000) })),
      })
    );
    const overdue = report.alerts.filter((a) => a.code === 'SCHEDULER_OVERDUE');
    expect(overdue).toHaveLength(3);
    expect(overdue.find((a) => a.title.includes('operations'))?.level).toBe('MEDIUM');
    expect(overdue.find((a) => a.title.includes('reconcile'))?.level).toBe('HIGH');
  });

  it('a scheduler that never ran is NOT overdue — it is unmeasured', () => {
    const report = deriveAlerts(quiet({ schedulers: [] }));
    expect(report.alerts.map((a) => a.code)).not.toContain('SCHEDULER_OVERDUE');
    expect(report.notInstrumented).toEqual(expect.arrayContaining(['scheduler:reconcile (no run recorded)', 'scheduler:inventory_sync (no run recorded)']));
  });

  it('never invents a healthy cache when nothing was ever synced', () => {
    const report = deriveAlerts(quiet({ inventory: [] }));
    expect(report.notInstrumented).toContain('inventory cache freshness');
  });

  it('automation lag', () => {
    const report = deriveAlerts(quiet({ queues: [{ queue: 'outbox', state: 'pending', items: 4, oldest: ago(31 * 60_000) }] }));
    expect(report.alerts[0]).toMatchObject({ level: 'MEDIUM', code: 'AUTOMATION_LAG', count: 4 });
  });
});

describe('ordering and hygiene', () => {
  it('sorts most severe first and carries no guest data', () => {
    const report = deriveAlerts(
      quiet({
        queues: [{ queue: 'outbox', state: 'pending', items: 4, oldest: ago(31 * 60_000) }],
        attention: [item({ id: 'booking:BLG-AAAAAA:unfinalized', level: 'critical', code: 'PAID_BOOKING_UNFINALIZED' })],
        configFindings: [{ code: 'X', severity: 'refuse', message: 'PAYPAL_CLIENT_SECRET is missing' }],
      })
    );
    expect(report.alerts.map((a) => a.level)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
    expect(JSON.stringify(report)).not.toMatch(/@|phone|email/i);
  });
});

describe('the completion-phase surfaces', () => {
  it('reports each surface as not instrumented when it could not be read — never as fine', () => {
    const report = deriveAlerts(quiet({ deliveries: null, turnovers: null, refunds: null, integrations: null }));
    expect(report.alerts).toEqual([]);
    expect(report.notInstrumented).toEqual(expect.arrayContaining([
      'refunds (cancellation columns not readable)',
      'guest message deliveries',
      'turnovers',
      'integration signals (health table not readable)',
    ]));
  });

  it('an unknown refund outcome is CRITICAL with the references; a decided-not-executed refund is HIGH', () => {
    const report = deriveAlerts(quiet({ refunds: { required: 1, pending: 0, unknown: 1, failed: 0, references: ['BLG-AAAAAA'] } }));
    const critical = report.alerts.find((a) => a.code === 'REFUND_ATTENTION');
    expect(critical?.level).toBe('CRITICAL');
    expect(critical?.references).toEqual(['BLG-AAAAAA']);
    expect(report.alerts.find((a) => a.code === 'REFUND_DECIDED_NOT_EXECUTED')?.level).toBe('HIGH');
  });

  it('stuck deliveries are HIGH; a prepared message waiting over an hour is MEDIUM; inside the hour nothing', () => {
    expect(deriveAlerts(quiet({ deliveries: { stuck: 2, retrying: 0, waiting: 0, oldestWaiting: null } })).alerts.map((a) => a.code)).toEqual(['MESSAGE_DELIVERY_FAILED']);
    expect(deriveAlerts(quiet({ deliveries: { stuck: 0, retrying: 1, waiting: 1, oldestWaiting: ago(61 * 60_000) } })).alerts.map((a) => a.code)).toEqual(['MESSAGE_DELIVERY_BACKLOG']);
    expect(deriveAlerts(quiet({ deliveries: { stuck: 0, retrying: 1, waiting: 1, oldestWaiting: ago(5 * 60_000) } })).alerts).toEqual([]);
  });

  it('an overdue turnover outranks an unassigned one', () => {
    expect(deriveAlerts(quiet({ turnovers: { overdue: 1, unassignedSoon: 3 } })).alerts.map((a) => `${a.level}:${a.code}`)).toEqual(['HIGH:TURNOVER_OVERDUE']);
    expect(deriveAlerts(quiet({ turnovers: { overdue: 0, unassignedSoon: 3 } })).alerts.map((a) => `${a.level}:${a.code}`)).toEqual(['MEDIUM:TURNOVER_UNASSIGNED']);
  });

  it('a never-observed signal is listed as unmeasured, and n8n silence with a backlog is alerted', () => {
    const base = quiet();
    const integrations = base.integrations!.map((s) => (s.provider === 'n8n' && s.signal === 'last_claim' ? { ...s, observedAt: ago(45 * 60_000) } : s.signal === 'last_message_complete' ? { ...s, status: 'never' as const, observedAt: null } : s));
    const idle = deriveAlerts(quiet({ integrations }));
    expect(idle.alerts).toEqual([]);
    expect(idle.notInstrumented).toContain('n8n:last_message_complete (never observed)');
    const backlog = deriveAlerts(quiet({ integrations, queues: [{ queue: 'outbox', state: 'pending', items: 3, oldest: ago(60_000) }] }));
    expect(backlog.alerts.map((a) => a.code)).toEqual(['N8N_SILENT']);
  });
});
