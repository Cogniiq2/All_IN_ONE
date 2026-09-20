/**
 * ══════════════════════════════════════════════════════════════════════════
 * AUTOMATIONS — the delivery board and the "never observed" rule, pure.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { buildAutomationsBoard, EXPECTED_SIGNALS, integrationSignals } from '@/lib/admin/automations';
import type { MessageDeliveryRow } from '@/lib/admin/rows';

function row(over: Partial<MessageDeliveryRow>): MessageDeliveryRow {
  return {
    id: over.id ?? 'd', reference: 'BLG-AAAAAA', kind: 'booking_confirmation', sequence: 1, channel: 'email', locale: 'de',
    template_id: 'booking_confirmation.de', template_version: '1', destination_masked: 'a***@example.com',
    status: 'pending', retryable: true, attempts: 0, max_attempts: 5, next_attempt_at: null, provider: null,
    provider_message_id: null, last_error: null, sent_at: null, failed_at: null,
    created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T10:00:00Z',
    ...over,
  };
}

describe('integrationSignals', () => {
  it('lists every expected signal as never observed when the table is empty', () => {
    const signals = integrationSignals([]);
    expect(signals).toHaveLength(EXPECTED_SIGNALS.length);
    expect(signals.every((s) => s.status === 'never' && s.observedAt === null)).toBe(true);
  });
  it('marks only what was observed, and surfaces signals it did not expect', () => {
    const signals = integrationSignals([
      { provider: 'beds24', signal: 'last_success', observed_at: '2026-09-20T09:00:00Z', detail: 'GET /x' },
      { provider: 'paypal', signal: 'last_something_new', observed_at: '2026-09-20T09:00:00Z', detail: null },
    ]);
    expect(signals.find((s) => s.provider === 'beds24' && s.signal === 'last_success')?.status).toBe('observed');
    expect(signals.find((s) => s.provider === 'beds24' && s.signal === 'last_failure')?.status).toBe('never');
    expect(signals.find((s) => s.signal === 'last_something_new')?.status).toBe('observed');
  });
  it('every signal the code emits is one the board expects', () => {
    const expected = new Set(EXPECTED_SIGNALS.map((e) => `${e.provider}:${e.signal}`));
    for (const key of ['beds24:last_success', 'beds24:last_failure', 'paypal:last_success', 'paypal:last_failure', 'paypal:last_verified_webhook', 'n8n:last_claim', 'n8n:last_ack', 'n8n:last_fail', 'n8n:last_message_prepare', 'n8n:last_message_complete']) {
      expect(expected.has(key)).toBe(true);
    }
  });
});

describe('buildAutomationsBoard', () => {
  const board = buildAutomationsBoard([
    row({ id: 'sent', status: 'sent', attempts: 1, sent_at: '2026-09-20T10:01:00Z', updated_at: '2026-09-20T10:01:00Z' }),
    row({ id: 'exhausted', status: 'failed', attempts: 5, failed_at: '2026-09-20T09:00:00Z' }),
    row({ id: 'bounce', status: 'failed', attempts: 1, retryable: false, failed_at: '2026-09-20T08:00:00Z' }),
    row({ id: 'retry', status: 'failed', attempts: 2, next_attempt_at: '2026-09-20T11:00:00Z' }),
    row({ id: 'waiting', status: 'pending' }),
    row({ id: 'mid', status: 'sending' }),
    row({ id: 'gone', status: 'suppressed', updated_at: '2026-09-20T12:00:00Z' }),
  ]);
  it('separates what needs a person from what the pump will retry', () => {
    expect(board.stuck.map((d) => d.id)).toEqual(['bounce', 'exhausted']);
    expect(board.retrying.map((d) => d.id)).toEqual(['retry']);
    expect(board.waiting.map((d) => d.id)).toEqual(['waiting', 'mid']);
    expect(board.recent.map((d) => d.id)).toEqual(['gone', 'sent']);
  });
  it('counts by outcome', () => {
    expect(board.counts).toEqual({ sent: 1, stuck: 2, retrying: 1, waiting: 2, suppressed: 1, skipped: 0 });
  });
  it('truncates errors and never carries a message body', () => {
    const long = buildAutomationsBoard([row({ id: 'e', status: 'failed', last_error: 'x'.repeat(500) })]);
    expect(long.retrying[0].lastError).toHaveLength(300);
    expect(Object.keys(long.retrying[0])).not.toContain('body');
  });
});
