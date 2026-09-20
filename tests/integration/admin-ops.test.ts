/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOLAGIO CONTROL — the completion-phase read models and operator commands
 * against the real schema.
 *
 * The server actions themselves need a signed cookie and Next's request
 * scope, so they are exercised by the Playwright admin cases. What is proven
 * here: the read models see what the ledgers hold, the commands the actions
 * call obey the database's rules, and the health verdict never turns an
 * unobserved provider green.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveOrder, holdBooking, signedHeaders, startHarness, waitFor, type Harness } from './harness';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await h.resetDb(); await h.sync(); });

async function confirmed(stay?: { checkIn: string; checkOut: string }) {
  const { reference } = await holdBooking(h, stay);
  await approveOrder(h, reference, false);
  await h.call('POST', '/api/booking/payment/capture', { reference });
  await waitFor(h, reference, (r) => r.status === 'confirmed');
  return reference;
}

function plusDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

describe('the cleaning board', () => {
  it('shows a turnover derived from a confirmed departure, and the status commands obey the ledger', async () => {
    const reference = await confirmed({ checkIn: plusDays(10), checkOut: plusDays(12) });
    const { syncTurnovers, setTurnoverStatus, assignTurnover } = await import('@/lib/booking/commands');
    await syncTurnovers(60);
    const { loadCleaningBoard, loadTurnoversForBooking } = await import('@/lib/admin/queries');
    const board = await loadCleaningBoard();
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    const mine = board.data.upcoming.find((t) => t.reference === reference);
    expect(mine).toBeTruthy();
    expect(mine!.status).toBe('required');
    expect(mine!.attention).toBeNull();
    expect(board.data.counts.open).toBeGreaterThanOrEqual(1);

    // Assign, start, finish — three audited moves, each visible on the board.
    expect(await assignTurnover(mine!.id, 'Maria K.', 'ops@example.com')).toBe(true);
    const started = await setTurnoverStatus(mine!.id, 'in_progress', 'ops@example.com');
    expect(started.ok).toBe(true);
    expect(started.from).toBe('required');
    const again = await setTurnoverStatus(mine!.id, 'in_progress', 'ops@example.com');
    expect(again.ok).toBe(true);
    expect(again.noop).toBe(true);
    const done = await setTurnoverStatus(mine!.id, 'done', 'ops@example.com', 'all good');
    expect(done.ok).toBe(true);

    const intentId = h.sql(`select id from bolagio_booking_intents where reference='${reference}'`);
    const forBooking = await loadTurnoversForBooking(intentId);
    expect(forBooking.ok && forBooking.data[0].status).toBe('done');
    expect(forBooking.ok && forBooking.data[0].assignedTo).toBe('Maria K.');
    expect(h.sql(`select count(*) from bolagio_turnover_events where turnover_id='${mine!.id}'`)).toBe('3');

    const after = await loadCleaningBoard();
    expect(after.ok && after.data.recent.some((t) => t.id === mine!.id && t.status === 'done')).toBe(true);
    expect(after.ok && after.data.upcoming.some((t) => t.id === mine!.id)).toBe(false);
  });

  it('a turnover cannot be voided by an operator, and an unknown one is refused', async () => {
    const { setTurnoverStatus } = await import('@/lib/booking/commands');
    const r = await setTurnoverStatus('00000000-0000-0000-0000-000000000000', 'done', 'ops@example.com');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NOT_FOUND');
  });
});

describe('the automations board', () => {
  it('lists a failed delivery as stuck, requeues it once, and refuses to requeue a sent one', async () => {
    const reference = await confirmed();
    const prepare = async () => {
      const raw = JSON.stringify({ action: 'prepare', kind: 'booking_confirmation', reference });
      return h.call('POST', '/api/internal/messages', raw, await signedHeaders(raw));
    };
    const first = await prepare();
    expect(first.body.outcome).toBe('claimed');
    const rawFail = JSON.stringify({ action: 'complete', deliveryId: first.body.deliveryId, outcome: 'failed', provider: 'smtp', error: 'bounce', retryable: false });
    await h.call('POST', '/api/internal/messages', rawFail, await signedHeaders(rawFail));

    const { loadAutomationsBoard, loadDeliveriesForBooking } = await import('@/lib/admin/queries');
    const board = await loadAutomationsBoard();
    expect(board.ok && board.data.stuck.map((d) => d.id)).toEqual([first.body.deliveryId]);
    expect(board.ok && board.data.counts.stuck).toBe(1);

    const { requeueMessageDelivery } = await import('@/lib/booking/commands');
    expect(await requeueMessageDelivery(first.body.deliveryId, 'ops@example.com')).toBe(true);
    // Requeue resets the state, not the history: the attempt count stays.
    expect(h.sql(`select status || ':' || retryable || ':' || attempts from bolagio_message_deliveries where id='${first.body.deliveryId}'`)).toBe('pending:true:1');

    const second = await prepare();
    expect(second.body.outcome).toBe('claimed');
    expect(second.body.deliveryId).toBe(first.body.deliveryId);
    const rawSent = JSON.stringify({ action: 'complete', deliveryId: second.body.deliveryId, outcome: 'sent', provider: 'smtp', providerMessageId: 'm-1' });
    await h.call('POST', '/api/internal/messages', rawSent, await signedHeaders(rawSent));
    expect(await requeueMessageDelivery(first.body.deliveryId, 'ops@example.com')).toBe(false);

    const forBooking = await loadDeliveriesForBooking(reference);
    expect(forBooking.ok && forBooking.data.map((d) => `${d.kind}:${d.status}`)).toEqual(['booking_confirmation:sent']);
    // The ledger row carries a masked destination and no address.
    expect(forBooking.ok && forBooking.data[0].destinationMasked).toBe('a***@example.com');
    expect(JSON.stringify(forBooking)).not.toContain('ada@example.com');
  });

  it('requeues only a dead-lettered outbox event', async () => {
    const reference = await confirmed();
    const id = h.sql(`select id from bolagio_outbox_events where reference='${reference}' and event_type='booking.confirmed'`);
    const { requeueOutboxEvent } = await import('@/lib/booking/commands');
    expect(await requeueOutboxEvent(id, 'ops@example.com')).toBe(false);
    h.sql(`update bolagio_outbox_events set status='exhausted', attempts=10 where id='${id}'`);
    expect(await requeueOutboxEvent(id, 'ops@example.com')).toBe(true);
    expect(h.sql(`select status || ':' || attempts from bolagio_outbox_events where id='${id}'`)).toBe('pending:0');
  });
});

describe('the health verdict', () => {
  it('reports every signal never observed on a fresh database, and observed after real traffic', async () => {
    const { loadIntegrationSignals, loadSystemHealth, loadAlerts } = await import('@/lib/admin/queries');
    // The inventory sync in beforeEach has already talked to Beds24; nothing has talked to PayPal or n8n.
    const fresh = await loadIntegrationSignals();
    expect(fresh.ok && fresh.data.filter((s) => s.provider !== 'beds24').every((s) => s.status === 'never')).toBe(true);
    expect(fresh.ok && fresh.data.find((s) => s.provider === 'beds24' && s.signal === 'last_success')?.status).toBe('observed');
    const health = await loadSystemHealth();
    const section = health.ok ? health.data.find((s) => s.key === 'integrations') : undefined;
    expect(section?.status).toBe('attention');
    expect(section?.summary).toContain('Never heard from: paypal, n8n');
    expect(section?.facts.filter((f) => f.value === 'never observed').length).toBeGreaterThan(0);

    h.sql('truncate bolagio_integration_health');
    const empty = await loadSystemHealth();
    expect(empty.ok && empty.data.find((s) => s.key === 'integrations')?.status).toBe('not_instrumented');

    await confirmed();
    const seen = await loadIntegrationSignals();
    expect(seen.ok && seen.data.find((s) => s.provider === 'beds24' && s.signal === 'last_success')?.status).toBe('observed');
    expect(seen.ok && seen.data.find((s) => s.provider === 'paypal' && s.signal === 'last_success')?.status).toBe('observed');
    expect(seen.ok && seen.data.find((s) => s.provider === 'n8n' && s.signal === 'last_claim')?.status).toBe('never');

    const alerts = await loadAlerts();
    expect(alerts.ok).toBe(true);
    if (!alerts.ok) return;
    expect(alerts.data.notInstrumented).toContain('n8n:last_claim (never observed)');
    expect(alerts.data.notInstrumented).not.toContain('guest message deliveries');
    expect(alerts.data.notInstrumented).not.toContain('turnovers');
    expect(alerts.data.alerts.map((a) => a.code)).not.toContain('REFUND_ATTENTION');
  });

  it('a refund with an unknown outcome is a CRITICAL alert naming the booking', async () => {
    const reference = await confirmed();
    const { cancelBooking } = await import('@/lib/booking/cancellation');
    const { createLogger } = await import('@/lib/booking/logger');
    const { findIntentByReference } = await import('@/lib/booking/repository');
    const intent = (await findIntentByReference(reference))!;
    const cancelled = await cancelBooking(intent, { actor: 'admin@example.com', authorized: true, refundCents: intent.paidAmountCents ?? 0 }, createLogger());
    expect(cancelled.outcome).toBe('cancelled');
    const { beginRefund, recordRefundOutcome } = await import('@/lib/booking/commands');
    expect((await beginRefund(intent.id, 'admin@example.com')).ok).toBe(true);
    await recordRefundOutcome(intent.id, { outcome: 'unknown', error: 'timeout' }, createLogger());

    const { loadAlerts, getBookingDetail } = await import('@/lib/admin/queries');
    const alerts = await loadAlerts();
    const alert = alerts.ok ? alerts.data.alerts.find((a) => a.code === 'REFUND_ATTENTION') : undefined;
    expect(alert?.level).toBe('CRITICAL');
    expect(alert?.references).toEqual([reference]);

    const detail = await getBookingDetail(reference);
    expect(detail.ok && detail.data?.cancellation.refundState).toBe('unknown');
    expect(detail.ok && detail.data?.cancellation.authorizedBy).toBe('admin@example.com');
    expect(detail.ok && detail.data?.status).toBe('cancelled');
  });
});
