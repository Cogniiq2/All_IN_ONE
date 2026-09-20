/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE TYPESCRIPT MIRROR AGAINST THE SQL AUTHORITY.
 *
 * `lib/booking/states.ts` says it mirrors `bolagio_transition_allowed()` and
 * `bolagio_payment_transition_allowed()`. This test READS THE MIGRATIONS and
 * checks it, shape for shape, so a transition added on one side and not the
 * other is a red test rather than a booking the database refuses to move.
 *
 * The parser is deliberately dumb: it finds the LAST definition of each
 * function across the migration files (a later migration may replace an
 * earlier one) and reads the `when '<state>' then array[...]` arms.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATES,
  BOOKING_TRANSITIONS,
  PAYMENT_STATES,
  canTransitionPayment,
  reservesInventory,
  type BookingState,
  type PaymentState,
} from '@/lib/booking/states';

const DIR = join(__dirname, '..', 'supabase', 'migrations');

function migrations(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(DIR, f), 'utf8'));
}

/** The body of the LAST `create or replace function <name>(` in migration order. */
function lastDefinition(name: string): string {
  let found: string | null = null;
  for (const sql of migrations()) {
    const pattern = new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\$\\$;`, 'g');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(sql)) !== null) found = m[0];
  }
  if (!found) throw new Error(`no migration defines ${name}`);
  return found;
}

function parseArms(body: string): Map<string, string[]> {
  const arms = new Map<string, string[]>();
  const pattern = /when '([a-z_]+)'\s+then\s+array\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const targets = m[2].match(/'([a-z_]+)'/g)?.map((t) => t.replace(/'/g, '')) ?? [];
    arms.set(m[1], targets);
  }
  return arms;
}

describe('bolagio_transition_allowed() mirrors BOOKING_TRANSITIONS', () => {
  const arms = parseArms(lastDefinition('bolagio_transition_allowed'));

  it('names every booking state exactly once, plus `cancelled` as the empty else', () => {
    const named = new Set(arms.keys());
    for (const state of BOOKING_STATES) {
      if (state === 'cancelled') {
        expect(named.has(state), 'cancelled must be the else arm').toBe(false);
        continue;
      }
      expect(named.has(state), `SQL has no arm for ${state}`).toBe(true);
    }
    named.forEach((state) => expect(BOOKING_STATES).toContain(state));
  });

  it('agrees with TypeScript on every edge', () => {
    for (const from of BOOKING_STATES) {
      const sql = new Set(arms.get(from) ?? []);
      const ts = new Set<string>(BOOKING_TRANSITIONS[from]);
      expect(Array.from(sql).sort(), `SQL targets of ${from}`).toEqual(Array.from(ts).sort());
    }
  });
});

describe('bolagio_payment_transition_allowed() mirrors canTransitionPayment', () => {
  const arms = parseArms(lastDefinition('bolagio_payment_transition_allowed'));

  it('agrees with TypeScript on every pair', () => {
    for (const from of PAYMENT_STATES) {
      for (const to of PAYMENT_STATES) {
        const sql =
          from === 'unknown' || to === 'unknown' || from === to
            ? true
            : (arms.get(from) ?? []).includes(to);
        expect(canTransitionPayment(from as PaymentState, to as PaymentState), `${from} -> ${to}`).toBe(sql);
      }
    }
  });

  it('lets a declined or abandoned attempt complete against the same order', () => {
    for (const from of ['denied', 'cancelled'] as PaymentState[]) {
      expect((arms.get(from) ?? []).includes('paid'), `${from} -> paid in SQL`).toBe(true);
    }
  });
});

describe('bolagio_status_reserves() mirrors reservesInventory', () => {
  it('lists exactly the non-reserving states', () => {
    const body = lastDefinition('bolagio_status_reserves');
    const listed = new Set(body.match(/'([a-z_]+)'/g)?.map((t) => t.replace(/'/g, '')) ?? []);
    for (const state of BOOKING_STATES) {
      expect(listed.has(state), `${state} reserving in SQL vs TS`).toBe(!reservesInventory(state as BookingState));
    }
  });
});
