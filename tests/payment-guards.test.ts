/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PAYMENT GUARDS — what an order or a capture is refused for.
 *
 * The provider, the database and the finalizer are all replaced, so what is
 * under test is the decision in lib/booking/payments.ts alone:
 *
 *   • no order and no capture after the hold's lease has run out;
 *   • no order and no capture from a state a guest cannot pay from;
 *   • no second order while money may be in motion (unknown, pending);
 *   • no capture while a previous capture's outcome is unknown;
 *   • a capture refused for ORDER_NOT_APPROVED is not a declined payment;
 *   • a declined instrument IS.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntentRecord } from '@/lib/booking/repository';
import type { BookingState, PaymentState } from '@/lib/booking/states';

const h = vi.hoisted(() => ({
  intent: null as unknown,
  transitions: [] as Array<{ to: string; reason?: string; patch?: Record<string, unknown> }>,
  jobs: [] as string[],
  adapterCalls: [] as string[],
  captureResult: null as unknown,
  captureError: null as unknown,
  getOrderResult: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => { throw new Error('no db'); }, isSupabaseConfigured: () => true }));
vi.mock('@/lib/booking/repository', () => ({
  findIntentByReference: async () => h.intent,
  findIntentByOrderId: async () => null,
}));
vi.mock('@/lib/booking/commands', () => ({
  transitionIntent: async (_id: string, o: { to: string; reason?: string; patch?: Record<string, unknown> }) => {
    h.transitions.push({ to: o.to, reason: o.reason, patch: o.patch });
    return { ...(h.intent as object), status: o.to, ...(o.patch?.paymentStatus ? { paymentStatus: o.patch.paymentStatus } : {}) };
  },
  queueReconciliation: async (_id: string, reason: string) => { h.jobs.push(reason); return 'job'; },
  recordCapture: async () => ({ outcome: 'applied', status: 'paid', paymentStatus: 'paid' }),
}));
vi.mock('@/lib/booking/finalization', () => ({ finalizeBooking: async () => ({ outcome: 'confirmed' }) }));
vi.mock('@/lib/ops/external-operations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ops/external-operations')>('@/lib/ops/external-operations');
  return {
    ...actual,
    trackedCall: async (_o: unknown, call: () => Promise<unknown>) => call(),
  };
});
vi.mock('@/lib/payments', async () => {
  const provider = await vi.importActual<typeof import('@/lib/payments/provider')>('@/lib/payments/provider');
  return {
    PaymentProviderError: provider.PaymentProviderError,
    paymentAdapter: () => ({
      name: 'paypal',
      mode: 'sandbox',
      getOrder: async () => { h.adapterCalls.push('getOrder'); return h.getOrderResult; },
      createOrder: async () => { h.adapterCalls.push('createOrder'); return { orderId: 'ORDER-NEW', state: 'order_created' }; },
      captureOrder: async () => {
        h.adapterCalls.push('captureOrder');
        if (h.captureError) throw h.captureError;
        return h.captureResult;
      },
    }),
  };
});

import { capturePaymentOrder, createPaymentOrder } from '@/lib/booking/payments';
import { createLogger } from '@/lib/booking/logger';
import { PaymentProviderError } from '@/lib/payments/provider';

const logger = createLogger();
const FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function intent(over: Partial<IntentRecord> = {}): IntentRecord {
  return {
    id: 'i-1', reference: 'BLG-AAAAAA', unitId: 'u', unitSlug: 'schulstrasse-i',
    checkIn: '2027-01-10', checkOut: '2027-01-12', adults: 2, children: 0, currency: 'EUR',
    quotedTotalCents: 42500, quoteComponents: [], status: 'hold_created' as BookingState, source: 'direct',
    beds24BookingId: '9001', paymentProvider: 'paypal', paymentSessionId: null,
    quoteExpiresAt: FUTURE, holdExpiresAt: FUTURE, guest: null,
    paymentStatus: 'order_created' as PaymentState, paymentOrderId: 'ORDER-1', paymentCaptureId: null,
    paidAmountCents: null, paidCurrency: null, lockExpiresAt: null,
    beds24PropertyId: '354659', beds24RoomId: '731147', beds24Status: 'new', beds24VerifiedAt: null,
    quoteHash: 'hash', lastFailureCode: null, reconciliationState: 'ok', confirmedAt: null, paidAt: null,
    ...over,
  };
}

beforeEach(() => {
  h.transitions.length = 0;
  h.jobs.length = 0;
  h.adapterCalls.length = 0;
  h.captureError = null;
  h.captureResult = { orderId: 'ORDER-1', state: 'paid', captureId: 'CAP-1', captured: { amountCents: 42500, currency: 'EUR' } };
  h.getOrderResult = { orderId: 'ORDER-1', state: 'approved' };
  // A complete production environment, so the launch gate is genuinely open.
  vi.stubEnv('APP_ENV', 'production');
  for (const [k, v] of Object.entries({
    DIRECT_BOOKING_ENABLED: 'true', PAYPAL_MODE: 'live', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's',
    PAYPAL_WEBHOOK_ID: 'w', BEDS24_MODE: 'live', BEDS24_REFRESH_TOKEN: 't', SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k', BOOKING_SYNC_SECRET: 'x',
  })) vi.stubEnv(k, v);
});
afterEach(() => vi.unstubAllEnvs());

describe('createPaymentOrder', () => {
  it('refuses once the hold lease has run out, without calling the provider', async () => {
    h.intent = intent({ holdExpiresAt: PAST });
    await expect(createPaymentOrder('BLG-AAAAAA', 'paypal', logger)).rejects.toMatchObject({ code: 'hold_expired' });
    expect(h.adapterCalls).toEqual([]);
  });

  it('refuses from every non-payable state', async () => {
    for (const status of ['expired', 'releasing', 'release_failed', 'released', 'manual_review', 'locking', 'quoted', 'cancelled'] as BookingState[]) {
      h.intent = intent({ status });
      await expect(createPaymentOrder('BLG-AAAAAA', 'paypal', logger), status).rejects.toMatchObject({ code: 'hold_expired' });
    }
    expect(h.adapterCalls).toEqual([]);
  });

  it('refuses while money may already be in motion', async () => {
    for (const paymentStatus of ['unknown', 'capture_pending'] as PaymentState[]) {
      h.intent = intent({ paymentStatus });
      await expect(createPaymentOrder('BLG-AAAAAA', 'paypal', logger), paymentStatus).rejects.toMatchObject({ code: 'pending_verification' });
    }
    h.intent = intent({ paymentStatus: 'paid' });
    await expect(createPaymentOrder('BLG-AAAAAA', 'paypal', logger)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(h.adapterCalls).toEqual([]);
  });

  it('reuses a declined order rather than opening a second one', async () => {
    // PayPal's restart flow re-approves the same order after a decline.
    h.intent = intent({ status: 'payment_failed', paymentStatus: 'denied' });
    h.getOrderResult = { orderId: 'ORDER-1', state: 'denied' };
    const order = await createPaymentOrder('BLG-AAAAAA', 'paypal', logger);
    expect(order.orderId).toBe('ORDER-1');
    expect(h.adapterCalls).toEqual(['getOrder']);
  });

  it('creates when the hold is live and nothing is in motion', async () => {
    h.intent = intent({ paymentOrderId: null, paymentStatus: 'not_created' });
    const order = await createPaymentOrder('BLG-AAAAAA', 'paypal', logger);
    expect(order.orderId).toBe('ORDER-NEW');
    expect(h.transitions.map((t) => t.to)).toContain('payment_session_created');
  });
});

describe('capturePaymentOrder', () => {
  it('is idempotent for a booking already on the paid side', async () => {
    for (const status of ['paid', 'finalizing', 'confirmed', 'paid_unfinalized'] as BookingState[]) {
      h.intent = intent({ status, paymentStatus: 'paid' });
      const result = await capturePaymentOrder('BLG-AAAAAA', logger);
      expect(result.status).toBe(status);
    }
    expect(h.adapterCalls).toEqual([]);
  });

  it('refuses while a previous capture has an unknown outcome', async () => {
    h.intent = intent({ paymentStatus: 'unknown' });
    await expect(capturePaymentOrder('BLG-AAAAAA', logger)).rejects.toMatchObject({ code: 'pending_verification' });
    expect(h.adapterCalls).toEqual([]);
  });

  it('refuses once the hold lease has run out', async () => {
    h.intent = intent({ holdExpiresAt: PAST, paymentStatus: 'approved' });
    await expect(capturePaymentOrder('BLG-AAAAAA', logger)).rejects.toMatchObject({ code: 'hold_expired' });
    expect(h.adapterCalls).toEqual([]);
  });

  it('refuses from a state the guest cannot pay from', async () => {
    for (const status of ['expired', 'releasing', 'manual_review'] as BookingState[]) {
      h.intent = intent({ status, paymentStatus: 'approved' });
      await expect(capturePaymentOrder('BLG-AAAAAA', logger), status).rejects.toMatchObject({ code: 'hold_expired' });
    }
    expect(h.adapterCalls).toEqual([]);
  });

  it('does not record a declined payment when the order was simply not approved', async () => {
    h.intent = intent({ paymentStatus: 'order_created' });
    h.captureError = new PaymentProviderError('rejected', 'not approved', 'ORDER_NOT_APPROVED');
    await expect(capturePaymentOrder('BLG-AAAAAA', logger)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(h.transitions.map((t) => t.to)).not.toContain('payment_failed');
  });

  it('records a declined instrument as payment_failed, hold intact', async () => {
    h.intent = intent({ paymentStatus: 'approved' });
    h.captureError = new PaymentProviderError('rejected', 'declined', 'INSTRUMENT_DECLINED');
    await expect(capturePaymentOrder('BLG-AAAAAA', logger)).rejects.toMatchObject({ code: 'payment_handoff_failed' });
    const failed = h.transitions.find((t) => t.to === 'payment_failed');
    expect(failed?.patch?.paymentStatus).toBe('denied');
    // No release, no cancellation: the lease decides that later.
    expect(h.transitions.map((t) => t.to)).not.toContain('releasing');
  });

  it('captures and finalizes a live, approved hold', async () => {
    h.intent = intent({ paymentStatus: 'approved' });
    const result = await capturePaymentOrder('BLG-AAAAAA', logger);
    expect(h.adapterCalls).toEqual(['captureOrder']);
    expect(result.paymentStatus).toBeDefined();
  });
});
