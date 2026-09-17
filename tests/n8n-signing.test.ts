/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE n8n REQUEST SIGNATURE.
 *
 * These tests sign requests exactly as n8n will — by calling the same `sign`
 * function the documentation describes — rather than asserting against a
 * hardcoded hex string. A hardcoded expectation would keep passing if the
 * canonical form changed, and the canonical form is the contract.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sign, verifyN8nSignature } from '@/lib/n8n/signing';

const SECRET = 'a-long-random-internal-secret-value';
const NOW = new Date('2026-09-17T12:00:00Z');

function seconds(offset = 0): string {
  return String(Math.floor(NOW.getTime() / 1000) + offset);
}

async function headersFor(body: string, offset = 0, secret = SECRET): Promise<Headers> {
  const ts = seconds(offset);
  return new Headers({
    'x-bolagio-timestamp': ts,
    'x-bolagio-signature': `v1=${await sign(secret, ts, body)}`,
  });
}

beforeEach(() => {
  process.env.N8N_INTERNAL_SECRET = SECRET;
  process.env.N8N_REPLAY_WINDOW_SECONDS = '300';
});

afterEach(() => {
  delete process.env.N8N_INTERNAL_SECRET;
  delete process.env.N8N_REPLAY_WINDOW_SECONDS;
});

describe('a correctly signed request', () => {
  it('is accepted', async () => {
    const body = JSON.stringify({ action: 'claim', limit: 10 });
    expect(await verifyN8nSignature(await headersFor(body), body, NOW)).toEqual({ ok: true });
  });

  it('is accepted for a GET, which signs the empty string', async () => {
    expect(await verifyN8nSignature(await headersFor(''), '', NOW)).toEqual({ ok: true });
  });

  it('is accepted at either edge of the replay window', async () => {
    const body = '{}';
    expect(await verifyN8nSignature(await headersFor(body, 299), body, NOW)).toEqual({ ok: true });
    expect(await verifyN8nSignature(await headersFor(body, -299), body, NOW)).toEqual({ ok: true });
  });
});

describe('a request that is not ours', () => {
  it('refuses when the secret is not configured', async () => {
    /*
     * Fail closed. An endpoint that accepts anything when its secret is unset
     * is how a staging misconfiguration becomes a production incident — and
     * this endpoint acknowledges booking events.
     */
    const body = '{}';
    const headers = await headersFor(body);
    delete process.env.N8N_INTERNAL_SECRET;
    expect(await verifyN8nSignature(headers, body, NOW)).toEqual({
      ok: false,
      reason: 'not_configured',
    });
  });

  it('refuses a missing header', async () => {
    const body = '{}';
    const headers = await headersFor(body);
    headers.delete('x-bolagio-signature');
    expect(await verifyN8nSignature(headers, body, NOW)).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('refuses a signature made with a different secret', async () => {
    const body = '{}';
    const headers = await headersFor(body, 0, 'the-wrong-secret');
    expect(await verifyN8nSignature(headers, body, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a signature without the v1 prefix', async () => {
    const ts = seconds();
    const headers = new Headers({
      'x-bolagio-timestamp': ts,
      'x-bolagio-signature': await sign(SECRET, ts, '{}'),
    });
    expect(await verifyN8nSignature(headers, '{}', NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a timestamp that is not an integer', async () => {
    const headers = new Headers({
      'x-bolagio-timestamp': '2026-09-17T12:00:00Z',
      'x-bolagio-signature': 'v1=deadbeef',
    });
    expect(await verifyN8nSignature(headers, '{}', NOW)).toEqual({ ok: false, reason: 'bad_timestamp' });
  });
});

describe('replay', () => {
  it('refuses a captured request once the window has passed', async () => {
    /*
     * This is why the signature covers a timestamp rather than being a bearer
     * secret. A captured request is worth five minutes, not forever — which
     * matters most for the `ack` action, where a replay would acknowledge an
     * event away and lose it.
     */
    const body = JSON.stringify({ action: 'ack', eventId: 'x' });
    const headers = await headersFor(body, 0);
    const later = new Date(NOW.getTime() + 301_000);
    expect(await verifyN8nSignature(headers, body, later)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a timestamp from the future by the same margin', async () => {
    // Symmetric on purpose: a request timestamped ahead of us is either a
    // skewed clock or an attempt to mint a long-lived signature.
    const body = '{}';
    expect(await verifyN8nSignature(await headersFor(body, 400), body, NOW)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('honours a configured window', async () => {
    process.env.N8N_REPLAY_WINDOW_SECONDS = '60';
    const body = '{}';
    expect(await verifyN8nSignature(await headersFor(body, 120), body, NOW)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await verifyN8nSignature(await headersFor(body, 30), body, NOW)).toEqual({ ok: true });
  });
});

describe('the body is part of the signature', () => {
  it('refuses when the body was altered in flight', async () => {
    const signed = JSON.stringify({ action: 'ack', eventId: 'event-1' });
    const tampered = JSON.stringify({ action: 'ack', eventId: 'event-2' });
    const headers = await headersFor(signed);
    expect(await verifyN8nSignature(headers, tampered, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('is sensitive to key order, which is why the RAW body is signed', async () => {
    /*
     * `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same object and different
     * bytes. Signing a re-serialised object would make the signature depend on
     * a JSON library's key ordering — which is how an integration works on
     * Tuesday and fails on Wednesday. The contract says: sign what you send.
     */
    const headers = await headersFor('{"a":1,"b":2}');
    expect(await verifyN8nSignature(headers, '{"b":2,"a":1}', NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });
});

describe('the documented algorithm', () => {
  it('is HMAC-SHA256 over v1:<timestamp>:<body>, hex encoded', async () => {
    // The worked example in docs/n8n-booking-contract.md. If this value ever
    // changes, that document is wrong and n8n will break.
    const signature = await sign('test-secret', '1789123456', '{"action":"claim"}');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).toBe(
      await sign('test-secret', '1789123456', '{"action":"claim"}')
    );
    // Documented value, asserted so the doc and the code cannot drift.
    expect(signature).toMatchInlineSnapshot(
      `"bebf91c99dadd3d299ea3c9a0e4a053be9573e9476a0b8b5565a35b2206a5063"`
    );
  });
});
