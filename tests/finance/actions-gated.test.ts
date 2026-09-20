/**
 * ══════════════════════════════════════════════════════════════════════════
 * EVERY FINANCE ACTION IS GATED — structurally, not by inspection.
 *
 * A hidden button is not security. `lib/finance/actions.ts` is a file of
 * server actions: each one is an HTTP endpoint the moment it is exported,
 * reachable by anyone who can guess its action id, whether or not a screen
 * renders a control for it. The protection is the `gate(capability)` call on
 * the first line of each body — so the thing worth asserting is that there
 * is no exported action WITHOUT one, today or after the next feature.
 *
 * Read over the source rather than by calling the actions: the point is to
 * catch the action that ships without a gate, which no behavioural test of
 * the gated actions can see.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { can, type Capability } from '@/lib/admin/permissions';

const SOURCE = readFileSync(path.resolve(__dirname, '..', '..', 'lib', 'finance', 'actions.ts'), 'utf8');

/**
 * Each exported action with the capabilities its body can gate on. Two
 * actions choose between two capabilities (`asAccountant ? tax_review :
 * review`), so every literal inside the `gate(...)` call is collected and
 * all of them must hold up.
 */
function exportedActions(): Array<{ name: string; capabilities: string[] }> {
  const out: Array<{ name: string; capabilities: string[] }> = [];
  const re = /export async function (\w+)\s*\([^)]*\)\s*:[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SOURCE)) !== null) {
    // The body up to the next top-level `export async function`, or the end.
    const from = m.index + m[0].length;
    const next = SOURCE.indexOf('\nexport async function', from);
    const body = SOURCE.slice(from, next === -1 ? SOURCE.length : next);
    const call = /await gate\(([^)]*)\)/.exec(body);
    const capabilities = call ? Array.from(call[1].matchAll(/'([a-z._]+)'/g)).map((c) => c[1]) : [];
    out.push({ name: m[1], capabilities });
  }
  return out;
}

describe('the finance server actions', () => {
  const actions = exportedActions();

  it('are found at all — a parse that silently matches nothing proves nothing', () => {
    expect(actions.length).toBeGreaterThanOrEqual(25);
  });

  it('every one checks a capability before it does anything', () => {
    expect(actions.filter((a) => a.capabilities.length === 0).map((a) => a.name)).toEqual([]);
  });

  it('gate only on capabilities an administrator actually holds', () => {
    // An unknown capability string would refuse everyone, including the
    // administrator — a dead action rather than an open one, but still a bug.
    const bad = actions.flatMap((a) => a.capabilities.filter((c) => !can('admin', c as Capability)).map((c) => `${a.name} → ${c}`));
    expect(bad).toEqual([]);
  });

  it('gate every mutation on a finance capability, never on plain `view`', () => {
    expect(actions.filter((a) => a.capabilities.some((c) => !c.startsWith('finance.'))).map((a) => a.name)).toEqual([]);
    // `finance.view` is the read capability; no action may mutate behind it.
    expect(actions.filter((a) => a.capabilities.includes('finance.view')).map((a) => a.name)).toEqual([]);
  });

  it('never let a viewer through any of them', () => {
    const reachable = actions.filter((a) => a.capabilities.some((c) => can('viewer', c as Capability)));
    expect(reachable.map((a) => a.name)).toEqual([]);
  });

  it('keep the tax desk out of an operator\'s reach wherever an action offers it', () => {
    const taxActions = actions.filter((a) => a.capabilities.includes('finance.tax_review'));
    expect(taxActions.length).toBeGreaterThan(0);
    for (const a of taxActions) expect(can('operator', 'finance.tax_review')).toBe(false);
  });
});

describe('the roles behind those gates', () => {
  it('leave a viewer able to read finance and change nothing', () => {
    expect(can('viewer', 'finance.view')).toBe(true);
    for (const c of ['finance.edit', 'finance.review', 'finance.tax_review', 'finance.export', 'finance.configure'] as Capability[]) {
      expect(can('viewer', c)).toBe(false);
    }
  });

  it('keep the tax and configuration desks away from an operator', () => {
    expect(can('operator', 'finance.edit')).toBe(true);
    expect(can('operator', 'finance.review')).toBe(true);
    // Filing stages, accountant overrides and policy are the administrator's.
    expect(can('operator', 'finance.tax_review')).toBe(false);
    expect(can('operator', 'finance.configure')).toBe(false);
  });

  it('give the administrator the whole finance family', () => {
    for (const c of ['finance.view', 'finance.edit', 'finance.review', 'finance.tax_review', 'finance.export', 'finance.configure'] as Capability[]) {
      expect(can('admin', c)).toBe(true);
    }
  });

  it('give an unknown role nothing at all', () => {
    for (const c of ['finance.view', 'finance.edit', 'finance.configure'] as Capability[]) {
      expect(can('accountant', c)).toBe(false);
      expect(can(null, c)).toBe(false);
    }
  });
});
