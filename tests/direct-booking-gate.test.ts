/**
 * ══════════════════════════════════════════════════════════════════════════
 * DISABLED MEANS DISABLED.
 *
 * Every entry point that can reserve inventory or move money is called with
 * the launch gate shut, and must refuse BEFORE touching the database or a
 * provider. Frontend hiding is not a gate; this is what a curl request runs
 * into.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const touched = vi.hoisted(() => ({ db: 0, provider: 0, payments: 0 }));

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => {
    touched.db += 1;
    throw new Error('the database must not be reached while the gate is shut');
  },
  isSupabaseConfigured: () => true,
}));
vi.mock('@/lib/integrations/beds24', () => ({
  bookingProvider: () => {
    touched.provider += 1;
    throw new Error('the provider must not be reached while the gate is shut');
  },
}));
vi.mock('@/lib/payments', () => ({
  paymentAdapter: () => {
    touched.payments += 1;
    throw new Error('the payment provider must not be reached while the gate is shut');
  },
  PaymentProviderError: class extends Error {},
}));

import { startBooking } from '@/lib/booking/service';
import { capturePaymentOrder, createPaymentOrder } from '@/lib/booking/payments';
import { createLogger } from '@/lib/booking/logger';
import { GET as paymentConfig } from '@/app/api/booking/payment/config/route';
import { POST as intentRoute } from '@/app/api/booking/intent/route';
import { POST as orderRoute } from '@/app/api/booking/payment/order/route';
import { POST as captureRoute } from '@/app/api/booking/payment/capture/route';

const logger = createLogger();
const GUEST = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+49 000', locale: 'de' as const };

function req(body: unknown): Request {
  return new Request('http://local/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  touched.db = 0;
  touched.provider = 0;
  touched.payments = 0;
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srk');
});
afterEach(() => vi.unstubAllEnvs());

async function expectDisabled(run: () => Promise<unknown>) {
  await expect(run()).rejects.toMatchObject({ name: 'BookingError', code: 'booking_disabled' });
  expect(touched, 'something was reached before the gate').toEqual({ db: 0, provider: 0, payments: 0 });
}

describe('with the flag unset', () => {
  it('refuses startBooking before any database or provider call', async () => {
    await expectDisabled(() =>
      startBooking({ unitSlug: 'schulstrasse-i', checkIn: '2027-01-10', checkOut: '2027-01-12', adults: 2, children: 0, guest: GUEST }, logger)
    );
  });

  it('refuses createPaymentOrder', async () => {
    await expectDisabled(() => createPaymentOrder('BLG-AAAAAA', 'paypal', logger));
  });

  it('refuses capturePaymentOrder', async () => {
    await expectDisabled(() => capturePaymentOrder('BLG-AAAAAA', logger));
  });

  it('serves no PayPal client id', async () => {
    vi.stubEnv('PAYPAL_MODE', 'sandbox');
    vi.stubEnv('PAYPAL_CLIENT_ID', 'public-id');
    const response = await paymentConfig(new Request('http://local/api/booking/payment/config') as never);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('public-id');
  });

  it('answers 403 booking_disabled on every command route', async () => {
    for (const [route, body] of [
      [intentRoute, { unitSlug: 'schulstrasse-i', checkIn: '2027-01-10', checkOut: '2027-01-12', adults: 2, guest: GUEST }],
      [orderRoute, { reference: 'BLG-AAAAAA' }],
      [captureRoute, { reference: 'BLG-AAAAAA' }],
    ] as const) {
      const response = await route(req(body) as never);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'booking_disabled' });
    }
    expect(touched).toEqual({ db: 0, provider: 0, payments: 0 });
  });
});

describe('with the flag set but the environment contradictory', () => {
  it('is still disabled — the flag alone opens nothing', async () => {
    vi.stubEnv('DIRECT_BOOKING_ENABLED', 'true');
    vi.stubEnv('PAYPAL_MODE', 'sandbox'); // sandbox in production
    await expectDisabled(() => createPaymentOrder('BLG-AAAAAA', 'paypal', logger));
  });

  it('is disabled on a preview whatever else is set', async () => {
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('DIRECT_BOOKING_ENABLED', 'true');
    vi.stubEnv('PAYPAL_MODE', 'sandbox');
    vi.stubEnv('PAYPAL_CLIENT_ID', 'id');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 's');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'w');
    vi.stubEnv('BEDS24_MODE', 'live');
    vi.stubEnv('BEDS24_REFRESH_TOKEN', 't');
    vi.stubEnv('BOOKING_SYNC_SECRET', 'x');
    await expectDisabled(() => capturePaymentOrder('BLG-AAAAAA', logger));
  });

  it('stays shut with every technical prerequisite present but no approved checkout terms', async () => {
    vi.stubEnv('DIRECT_BOOKING_ENABLED', 'true');
    vi.stubEnv('PAYPAL_MODE', 'live');
    vi.stubEnv('PAYPAL_CLIENT_ID', 'id');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 's');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'w');
    vi.stubEnv('BEDS24_MODE', 'live');
    vi.stubEnv('BEDS24_REFRESH_TOKEN', 't');
    vi.stubEnv('BOOKING_SYNC_SECRET', 'x');
    // The cancellation policy, withdrawal notice and AGB are not approved in
    // lib/legal/booking-terms.ts, so the third lock holds the gate shut.
    await expectDisabled(() => createPaymentOrder('BLG-AAAAAA', 'paypal', logger));
    await expectDisabled(() => capturePaymentOrder('BLG-AAAAAA', logger));
  });

  it('opens with every prerequisite present, including the (staging-only) sandbox terms', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('DIRECT_BOOKING_ENABLED', 'true');
    vi.stubEnv('BOOKING_TEST_TERMS', 'true');
    vi.stubEnv('PAYPAL_MODE', 'sandbox');
    vi.stubEnv('PAYPAL_CLIENT_ID', 'id');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 's');
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'w');
    vi.stubEnv('BEDS24_MODE', 'live');
    vi.stubEnv('BEDS24_REFRESH_TOKEN', 't');
    vi.stubEnv('BOOKING_SYNC_SECRET', 'x');
    // The gate opens, so the very next thing is the database — which the
    // fake refuses. That refusal proves the gate was passed, not the DB.
    await expect(createPaymentOrder('BLG-AAAAAA', 'paypal', logger)).rejects.toThrow(/database must not be reached/);
    expect(touched.db).toBe(1);
  });
});
