/**
 * ══════════════════════════════════════════════════════════════════════════
 * TRACKED EXTERNAL MUTATIONS.
 *
 * The single most important behaviour in the recovery model, tested directly:
 * a call whose outcome we did not learn must be recorded as `outcome_unknown`
 * and must NOT be retried.
 *
 * Supabase is mocked at the module boundary, so what is under test is the
 * classification logic rather than the database (which `tests/sql/` covers
 * against a real PostgreSQL).
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── A fake Supabase that records the RPCs it was asked to run ─────────── */

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcFails = false;

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rpcFails) return { data: null, error: { code: 'XX000', message: 'db down' } };
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ in: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

import { ProviderError } from '@/lib/integrations/provider';
import {
  operationKey,
  trackedCall,
  UncertainOperationError,
} from '@/lib/ops/external-operations';
import { createLogger } from '@/lib/booking/logger';

const logger = createLogger();

function base(overrides: Record<string, unknown> = {}) {
  return {
    key: 'beds24:create_hold:intent-1',
    provider: 'beds24' as const,
    type: 'create_hold',
    intentId: 'intent-1',
    logger,
    ...overrides,
  };
}

function outcomes(): string[] {
  return rpcCalls
    .filter((c) => c.name === 'bolagio_complete_external_operation')
    .map((c) => String(c.args.p_outcome));
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcFails = false;
});

describe('a call that succeeds', () => {
  it('is recorded as succeeded with the provider resource id', async () => {
    const result = await trackedCall(
      base({ resourceIdOf: (r: { id: string }) => r.id }),
      async () => ({ id: 'BEDS24-9001' })
    );

    expect(result).toEqual({ id: 'BEDS24-9001' });
    expect(rpcCalls[0].name).toBe('bolagio_begin_external_operation');
    expect(outcomes()).toEqual(['succeeded']);
    expect(rpcCalls[1].args.p_resource_id).toBe('BEDS24-9001');
  });

  it('records the intent to call BEFORE calling', async () => {
    /*
     * The ordering the whole module depends on. If the row were written after
     * the call, a process that died mid-call would leave an untracked external
     * mutation — precisely the thing this exists to make impossible.
     */
    let calledAt = -1;
    await trackedCall(base(), async () => {
      calledAt = rpcCalls.length;
      return null;
    });
    expect(calledAt).toBe(1);
  });

  it('refuses to call at all when the operation cannot be recorded', async () => {
    rpcFails = true;
    let called = false;
    await expect(
      trackedCall(base(), async () => {
        called = true;
        return null;
      })
    ).rejects.toBeTruthy();
    expect(called, 'an untracked external mutation was made').toBe(false);
  });
});

describe('a call the provider answered', () => {
  it('is recorded as failed when the caller says the failure is definite', async () => {
    const error = new ProviderError('availability_conflict', 'taken');
    await expect(
      trackedCall(
        base({ isDefiniteFailure: (c: unknown) => c instanceof ProviderError }),
        async () => {
          throw error;
        }
      )
    ).rejects.toBe(error);

    expect(outcomes()).toEqual(['failed']);
  });

  it('rethrows the original error, so the caller can compensate', async () => {
    const error = new ProviderError('stay_rules', 'min stay', { minNights: 3 });
    const thrown = await trackedCall(
      base({ isDefiniteFailure: () => true }),
      async () => {
        throw error;
      }
    ).catch((e) => e);
    // Not wrapped: a definite failure keeps its meaning all the way up.
    expect(thrown).toBe(error);
  });
});

describe('a call the provider did NOT answer', () => {
  it('defaults to uncertain when the caller says nothing', async () => {
    /*
     * The default matters more than any single case. A caller must OPT IN to
     * "this failure is definitive"; forgetting to classify an error can only
     * make the system more cautious, never less.
     */
    const thrown = await trackedCall(base(), async () => {
      throw new Error('socket hang up');
    }).catch((e) => e);

    expect(thrown).toBeInstanceOf(UncertainOperationError);
    expect(outcomes()).toEqual(['outcome_unknown']);
  });

  it('is uncertain for a timeout, even from a provider error type', async () => {
    // `ProviderError('unavailable')` is what a Beds24 TIMEOUT raises — after
    // the POST was sent. The hold saga's classifier excludes exactly this.
    const thrown = await trackedCall(
      base({
        isDefiniteFailure: (c: unknown) => c instanceof ProviderError && (c as ProviderError).code !== 'unavailable',
      }),
      async () => {
        throw new ProviderError('unavailable', 'Beds24 request timed out');
      }
    ).catch((e) => e);

    expect(thrown).toBeInstanceOf(UncertainOperationError);
    expect(outcomes()).toEqual(['outcome_unknown']);
  });

  it('carries the operation key, so reconciliation can find it', async () => {
    const thrown: UncertainOperationError = await trackedCall(base(), async () => {
      throw new Error('timeout');
    }).catch((e) => e);

    expect(thrown.operationKey).toBe('beds24:create_hold:intent-1');
    expect(thrown.provider).toBe('beds24');
    expect(thrown.operationType).toBe('create_hold');
  });

  it('never records a resource id it does not have', async () => {
    await trackedCall(base({ resourceIdOf: () => 'SHOULD-NOT-APPEAR' }), async () => {
      throw new Error('timeout');
    }).catch(() => undefined);

    const complete = rpcCalls.find((c) => c.name === 'bolagio_complete_external_operation')!;
    expect(complete.args.p_resource_id).toBeNull();
  });
});

describe('operation keys', () => {
  it('are deterministic, so a retry finds the same row', () => {
    expect(operationKey.beds24Hold('intent-1')).toBe(operationKey.beds24Hold('intent-1'));
    expect(operationKey.paypalCapture('ORDER-1')).toBe(operationKey.paypalCapture('ORDER-1'));
  });

  it('are distinct per operation and per subject', () => {
    const keys = [
      operationKey.beds24Hold('intent-1'),
      operationKey.beds24Hold('intent-2'),
      operationKey.beds24Finalize('9001'),
      operationKey.beds24Release('9001'),
      operationKey.paypalOrder('intent-1', 'hash-a'),
      operationKey.paypalCapture('ORDER-1'),
      operationKey.paypalRefund('CAP-1'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives a re-quoted booking a NEW payment order key', () => {
    /*
     * Otherwise a booking re-quoted to a different total would reuse the
     * PayPal order priced at the old one — charging the guest an amount
     * nobody currently agrees with.
     */
    expect(operationKey.paypalOrder('intent-1', 'hash-a')).not.toBe(
      operationKey.paypalOrder('intent-1', 'hash-b')
    );
  });

  it('keys finalization and release on the BOOKING, not on the attempt', () => {
    // Every retry of a finalization is the same logical operation on the same
    // Beds24 booking — which is what makes "retry against the same id" true.
    expect(operationKey.beds24Finalize('9001')).toContain('9001');
    expect(operationKey.beds24Release('9001')).toContain('9001');
  });
});
