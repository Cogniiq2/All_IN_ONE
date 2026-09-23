/**
 * ══════════════════════════════════════════════════════════════════════════
 * BOOKING.COM IMPORT — who may do what, behaviourally.
 *
 * `actions-gated.test.ts` proves structurally that every finance action
 * calls `gate()`. This file calls the Booking.com import actions themselves
 * with each kind of caller and asserts that nothing reaches the command
 * layer unless it should: no session, a viewer, a read-only preview session,
 * and an operator without the reviewer capability are all refused BEFORE a
 * command runs. And it asserts that no browser bundle can reach the service
 * role.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { can, type Capability } from '@/lib/admin/permissions';

type Op = { id: string; email: string; role: 'viewer' | 'operator' | 'admin'; preview?: boolean } | null;
let caller: Op = null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/config', async (orig) => ({ ...(await orig<typeof import('@/lib/admin/config')>()), adminMode: () => 'supabase' }));
vi.mock('@/lib/admin/auth', () => ({
  // The same decision order as the real operatorFor: no session, then preview, then capability.
  operatorFor: async (capability: Capability) => {
    if (!caller) return { ok: false, reason: 'unauthenticated' };
    if (caller.preview) return { ok: false, reason: 'preview' };
    if (!can(caller.role, capability)) return { ok: false, reason: 'forbidden' };
    return { ok: true, operator: caller };
  },
  audit: vi.fn(async () => undefined),
}));
const commands = {
  stageImport: vi.fn(async () => ({ ok: true, batchId: '00000000-0000-0000-0000-000000000001', rowCount: 5, validRows: 5, errorRows: 0, duplicateRows: 0, readiness: 'validated' })),
  commitImport: vi.fn(async () => ({ posted: 5, skipped: 0, errors: [], alreadyImported: 0, amendments: 0 })),
  rematchSettlements: vi.fn(async () => ({ scanned: 0, changed: 0, matched: 0, unmatched: 0, ambiguous: 0, ledgerPosted: 0, errors: [] })),
  acceptSettlementAmendment: vi.fn(async () => ({ ok: true, revenueTransactionId: null })),
};
vi.mock('@/lib/finance/commands', () => commands);

const FIXTURE = readFileSync(path.resolve(__dirname, 'fixtures', 'booking-com-finance-statement.sanitized.csv'), 'utf8');
const BATCH = '00000000-0000-0000-0000-000000000001';

function upload(adapter = 'auto', name = 'statement.csv', type = 'text/csv', body = FIXTURE): FormData {
  const fd = new FormData();
  fd.set('adapter', adapter);
  fd.set('file', new File([body], name, { type }));
  return fd;
}

beforeEach(() => {
  caller = null;
  for (const f of Object.values(commands)) f.mockClear();
});

describe('the Booking.com import actions', () => {
  it('refuse an unauthenticated caller before any command runs', async () => {
    const a = await import('@/lib/finance/actions');
    expect(await a.stageImportAction(upload())).toMatchObject({ ok: false, reason: 'unauthenticated' });
    expect(await a.commitImportAction(BATCH)).toMatchObject({ ok: false, reason: 'unauthenticated' });
    expect(await a.rematchSettlementsAction()).toMatchObject({ ok: false, reason: 'unauthenticated' });
    expect(await a.acceptSettlementAmendmentAction(BATCH, 'reason')).toMatchObject({ ok: false, reason: 'unauthenticated' });
    for (const f of Object.values(commands)) expect(f).not.toHaveBeenCalled();
  });

  it('refuse a viewer (no finance.edit) on every one', async () => {
    caller = { id: 'v', email: 'viewer@example.com', role: 'viewer' };
    const a = await import('@/lib/finance/actions');
    expect(await a.stageImportAction(upload())).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await a.commitImportAction(BATCH)).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await a.rematchSettlementsAction()).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await a.acceptSettlementAmendmentAction(BATCH, 'reason')).toMatchObject({ ok: false, reason: 'forbidden' });
    for (const f of Object.values(commands)) expect(f).not.toHaveBeenCalled();
  });

  it('refuse a read-only preview session: it may look at the preview, never commit', async () => {
    caller = { id: 'p', email: 'admin@example.com', role: 'admin', preview: true };
    const a = await import('@/lib/finance/actions');
    expect(await a.stageImportAction(upload())).toMatchObject({ ok: false, reason: 'preview' });
    expect(await a.commitImportAction(BATCH)).toMatchObject({ ok: false, reason: 'preview' });
    expect(commands.commitImport).not.toHaveBeenCalled();
  });

  it('let an operator stage (auto-detected) and commit, and pass no guest data to the audit', async () => {
    caller = { id: 'o', email: 'ops@example.com', role: 'operator' };
    const a = await import('@/lib/finance/actions');
    const staged = await a.stageImportAction(upload());
    expect(staged).toMatchObject({ ok: true, batchId: BATCH });
    expect(commands.stageImport).toHaveBeenCalledWith('booking_com_finance_statement', 'statement.csv', FIXTURE, 'ops@example.com');
    expect(await a.commitImportAction(BATCH)).toMatchObject({ ok: true, posted: 5 });
    const { audit } = await import('@/lib/admin/auth');
    expect(JSON.stringify((audit as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/Test Guest|Mustermann|9990000/);
  });

  it('accepting an amendment needs finance.review and a reason', async () => {
    caller = { id: 'o', email: 'ops@example.com', role: 'operator' };
    const a = await import('@/lib/finance/actions');
    expect(await a.acceptSettlementAmendmentAction(BATCH, '')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.acceptSettlementAmendmentAction('not-a-uuid', 'reason')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.acceptSettlementAmendmentAction(BATCH, 'Booking.com corrected it')).toMatchObject({ ok: true });
    expect(can('viewer', 'finance.review')).toBe(false);
  });

  it('refuse a file that is not a CSV by name or type, an oversized one, and a retired adapter', async () => {
    caller = { id: 'o', email: 'ops@example.com', role: 'operator' };
    const a = await import('@/lib/finance/actions');
    expect(await a.stageImportAction(upload('auto', 'statement.xlsx'))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.stageImportAction(upload('auto', 'statement.csv', 'application/pdf'))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.stageImportAction(upload('auto', 'big.csv', 'text/csv', 'x'.repeat(5 * 1024 * 1024 + 1)))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.stageImportAction(upload('booking_com_payouts'))).toMatchObject({ ok: false, reason: 'refused' });
    expect(await a.stageImportAction(upload('auto', 'x.csv', 'text/csv', 'foo,bar\n1,2'))).toMatchObject({ ok: false, reason: 'refused' });
    expect(commands.stageImport).not.toHaveBeenCalled();
    // Excel on Windows reports CSV as vnd.ms-excel; that is still a CSV.
    expect(await a.stageImportAction(upload('auto', 'Statement.CSV', 'application/vnd.ms-excel'))).toMatchObject({ ok: true });
  });
});

describe('no browser bundle can reach the service role', () => {
  const ROOTS = ['app', 'components', 'lib'].map((d) => path.resolve(__dirname, '..', '..', d));
  const files: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
  ROOTS.forEach(walk);

  it('no client component imports the server Supabase client, the finance commands or the finance row sources', () => {
    // `import type` is erased at compile time and ships nothing; any value import would ship the module.
    const valueImport = /^import (?!type\b)[^;]*from '@\/lib\/(supabase\/server|finance\/(commands|source|source-supabase|queries))';/m;
    const offenders = files.filter((f) => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8'))).filter((f) => valueImport.test(readFileSync(f, 'utf8')));
    expect(files.length).toBeGreaterThan(50);
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it('the modules that hold or use the service role are server-only', () => {
    for (const m of ['lib/supabase/server.ts', 'lib/finance/commands.ts', 'lib/finance/source-supabase.ts', 'lib/finance/queries.ts']) {
      expect(readFileSync(path.resolve(__dirname, '..', '..', m), 'utf8'), m).toMatch(/^import 'server-only';/);
    }
  });

  it('the pure statement modules read no environment and import nothing server-side', () => {
    for (const m of ['lib/finance/import/booking-com-statement.ts', 'lib/finance/settlements.ts']) {
      const src = readFileSync(path.resolve(__dirname, '..', '..', m), 'utf8');
      expect(src, m).not.toMatch(/process\.env|supabase|server-only/);
    }
  });

  it('the settlement tables carry no guest column', () => {
    const sql = readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260926120000_booking_com_finance_statement.sql'), 'utf8');
    const tables = sql.split('create table if not exists').slice(1).map((t) => t.slice(0, t.indexOf(');')));
    expect(tables).toHaveLength(2);
    for (const t of tables) expect(t).not.toMatch(/guest|first_name|last_name|email|phone/i);
  });
});
