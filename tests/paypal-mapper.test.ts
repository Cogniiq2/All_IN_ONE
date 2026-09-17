/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAYPAL → BoLaGio.
 *
 * Three things are tested here because being wrong about any of them costs
 * real money or leaks real personal data:
 *
 *   money      PayPal sends decimal strings; we compare integers
 *   status     PENDING is not paid, and never becomes paid by accident
 *   sanitize   what of a PayPal event may be written to our database
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import {
  mapOrder,
  mapWebhookEvent,
  sanitize,
  stateFromCaptureStatus,
  stateFromOrderStatus,
  toCents,
  toDecimalString,
} from '@/lib/payments/paypal/mapper';

describe('money', () => {
  it('parses the amounts PayPal actually sends', () => {
    expect(toCents('425.00')).toBe(42500);
    expect(toCents('0.01')).toBe(1);
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('7')).toBe(700);
    expect(toCents('7.5')).toBe(750);
  });

  it('does not go through floating point', () => {
    /*
     * The reason this function exists. `parseFloat('8.29') * 100` is
     * 828.9999999999999, and `Math.round` hides that until the one value where
     * it does not. A booking system comparing a paid amount to a quoted amount
     * cannot afford a single cent of drift.
     */
    for (const [value, cents] of [
      ['8.29', 829], ['1.005', null], ['0.07', 7], ['19.99', 1999],
      ['104.90', 10490],
      // Beyond Number.MAX_SAFE_INTEGER once scaled to cents. Not a realistic
      // booking, but the guard is what stops a silently rounded integer.
      ['900719925474099.99', null],
    ] as const) {
      expect(toCents(value), `${value}`).toBe(cents);
    }
  });

  it('refuses anything it does not recognise, rather than guessing', () => {
    // A null amount fails the capture comparison, which routes the booking to
    // manual review — the correct outcome for an amount we cannot read.
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
    expect(toCents('1.2.3')).toBeNull();
    expect(toCents('1,00')).toBeNull();
    expect(toCents('1e3')).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents(null)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toCents(425 as any)).toBeNull();
  });

  it('round-trips', () => {
    for (const cents of [1, 7, 100, 829, 42500, 123456]) {
      expect(toCents(toDecimalString(cents))).toBe(cents);
    }
  });

  it('formats for PayPal with two decimals always', () => {
    expect(toDecimalString(42500)).toBe('425.00');
    expect(toDecimalString(7)).toBe('0.07');
    expect(toDecimalString(100)).toBe('1.00');
  });
});

describe('capture status', () => {
  it('never reads PENDING as paid', () => {
    // PayPal uses PENDING for funds under review and for eCheck settlement.
    // Both can still fail, and neither is a reason to confirm a reservation.
    expect(stateFromCaptureStatus('PENDING')).toBe('capture_pending');
    expect(stateFromCaptureStatus('COMPLETED')).toBe('paid');
  });

  it('maps the rest', () => {
    expect(stateFromCaptureStatus('DECLINED')).toBe('denied');
    expect(stateFromCaptureStatus('FAILED')).toBe('denied');
    expect(stateFromCaptureStatus('REFUNDED')).toBe('refunded');
    expect(stateFromCaptureStatus('PARTIALLY_REFUNDED')).toBe('partially_refunded');
  });

  it('treats an unrecognised status as unknown, not as paid', () => {
    // 'unknown' blocks a release and schedules reconciliation. Optimism here
    // would confirm a booking on a status PayPal added after we shipped.
    expect(stateFromCaptureStatus(undefined)).toBe('unknown');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stateFromCaptureStatus('SOMETHING_NEW' as any)).toBe('unknown');
  });

  it('maps order statuses separately from capture statuses', () => {
    expect(stateFromOrderStatus('CREATED')).toBe('order_created');
    expect(stateFromOrderStatus('APPROVED')).toBe('approved');
    expect(stateFromOrderStatus('VOIDED')).toBe('cancelled');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stateFromOrderStatus('WHAT' as any)).toBe('unknown');
  });
});

describe('mapOrder', () => {
  it('prefers the capture over the order status', () => {
    /*
     * The order says COMPLETED, the capture says PENDING. The capture is the
     * fact about money; the order status is a fact about the checkout. Reading
     * the order here would treat unsettled funds as paid.
     */
    const order = mapOrder({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [
        {
          custom_id: 'BLG-AAAAAA',
          payments: {
            captures: [
              { id: 'CAP-1', status: 'PENDING', amount: { currency_code: 'EUR', value: '425.00' } },
            ],
          },
        },
      ],
    });
    expect(order.state).toBe('capture_pending');
    expect(order.captureId).toBe('CAP-1');
    expect(order.captured).toEqual({ amountCents: 42500, currency: 'EUR' });
  });

  it('falls back to the order status when there is no capture', () => {
    const order = mapOrder({
      id: 'ORDER-2',
      status: 'APPROVED',
      links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=X' }],
      purchase_units: [{ custom_id: 'BLG-BBBBBB' }],
    });
    expect(order.state).toBe('approved');
    expect(order.captureId).toBeUndefined();
    expect(order.approveUrl).toContain('paypal.com');
    expect(order.reference).toBe('BLG-BBBBBB');
  });

  it('reads our reference back out', () => {
    const order = mapOrder({
      id: 'ORDER-3',
      purchase_units: [
        {
          custom_id: 'BLG-CCCCCC',
          payments: { captures: [{ id: 'CAP-3', status: 'COMPLETED', custom_id: 'BLG-CCCCCC' }] },
        },
      ],
    });
    expect(order.reference).toBe('BLG-CCCCCC');
  });

  it('survives a response with nothing in it', () => {
    // Beds24 taught this codebase that provider responses omit whatever they
    // feel like. Nothing downstream may index blindly.
    const order = mapOrder({});
    expect(order.orderId).toBe('');
    expect(order.state).toBe('unknown');
    expect(order.captured).toBeUndefined();
  });
});

describe('mapWebhookEvent', () => {
  const capture = {
    id: 'WH-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: '2026-09-17T10:00:00Z',
    resource_type: 'capture',
    resource: {
      id: 'CAP-9',
      status: 'COMPLETED',
      custom_id: 'BLG-DDDDDD',
      amount: { currency_code: 'EUR', value: '425.00' },
      supplementary_data: { related_ids: { order_id: 'ORDER-9' } },
    },
  };

  it('reduces a completed capture to what the processor needs', () => {
    const event = mapWebhookEvent(capture)!;
    expect(event.providerEventId).toBe('WH-1');
    expect(event.state).toBe('paid');
    expect(event.captureId).toBe('CAP-9');
    expect(event.orderId).toBe('ORDER-9');
    expect(event.reference).toBe('BLG-DDDDDD');
    expect(event.amountCents).toBe(42500);
    expect(event.currency).toBe('EUR');
  });

  it('believes the resource status over the event name', () => {
    // A COMPLETED-named event carrying a PENDING resource is PENDING. The
    // event name is a routing label; the status is the fact.
    const event = mapWebhookEvent({
      ...capture,
      resource: { ...capture.resource, status: 'PENDING' },
    })!;
    expect(event.state).toBe('capture_pending');
  });

  it('maps the failure and refund events', () => {
    const at = (type: string) => mapWebhookEvent({ ...capture, id: type, event_type: type })!.state;
    expect(at('PAYMENT.CAPTURE.DENIED')).toBe('denied');
    expect(at('PAYMENT.CAPTURE.REFUNDED')).toBe('refunded');
    expect(at('PAYMENT.CAPTURE.REVERSED')).toBe('refunded');
    expect(at('CUSTOMER.DISPUTE.CREATED')).toBe('disputed');
  });

  it('maps an event type it does not know to unknown', () => {
    expect(mapWebhookEvent({ ...capture, id: 'WH-X', event_type: 'SOMETHING.NEW' })!.state).toBe('unknown');
  });

  it('returns null for an event with no id or no type', () => {
    expect(mapWebhookEvent({ event_type: 'PAYMENT.CAPTURE.COMPLETED' })).toBeNull();
    expect(mapWebhookEvent({ id: 'WH-2' })).toBeNull();
  });
});

describe('sanitize', () => {
  /*
   * The allow list. A field PayPal adds later cannot leak by being forgotten,
   * which is the same rule the booking logger uses — and the reason this is a
   * test rather than a code review note.
   */
  const event = {
    id: 'WH-5',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    create_time: '2026-09-17T10:00:00Z',
    resource_type: 'capture',
    resource: {
      id: 'CAP-5',
      status: 'COMPLETED',
      custom_id: 'BLG-EEEEEE',
      amount: { currency_code: 'EUR', value: '425.00' },
      // Everything below must NOT survive.
      payer: { email_address: 'guest@example.com', name: { given_name: 'Ada', surname: 'Lovelace' } },
      payment_source: { card: { last_digits: '4242', brand: 'VISA' } },
      shipping: { address: { address_line_1: 'Schulstraße 1', postal_code: '95444' } },
      links: [{ href: 'https://api-m.paypal.com/v2/payments/captures/CAP-5' }],
    },
  };

  it('keeps what reconciliation needs', () => {
    const clean = sanitize(event) as Record<string, any>;
    expect(clean.id).toBe('WH-5');
    expect(clean.resource.id).toBe('CAP-5');
    expect(clean.resource.custom_id).toBe('BLG-EEEEEE');
    expect(clean.resource.amount).toEqual({ currency_code: 'EUR', value: '425.00' });
  });

  it('drops every piece of guest personal data', () => {
    const serialised = JSON.stringify(sanitize(event));
    for (const leak of ['guest@example.com', 'Ada', 'Lovelace', '4242', 'VISA', 'Schulstraße', '95444']) {
      expect(serialised, `"${leak}" survived sanitisation`).not.toContain(leak);
    }
  });

  it('drops provider API links', () => {
    // They carry absolute API URLs, which are a map of the account for anyone
    // who later reads the table.
    expect(JSON.stringify(sanitize(event))).not.toContain('api-m.paypal.com');
  });
});
