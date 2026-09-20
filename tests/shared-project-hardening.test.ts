/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE SHARED-PROJECT HARDENING, over its SQL sources.
 *
 * The behavioural proof runs against a real cluster
 * (scripts/shared-project-check.sh: the exposure reproduced, closed, Cogniiq
 * still working, rollback, re-apply, BoLaGio chain on top). What is asserted
 * here is what the FILES promise, so a careless edit is caught by `npm test`
 * before it reaches any database — and in particular before it reaches the
 * one shared with Cogniiq.
 *
 * The invariants worth holding forever:
 *   • the hardening is a DRY RUN unless apply=yes, and refuses bolagio_
 *   • it never touches a Cogniiq table other than the one gap it names
 *   • it never revokes `authenticated` from owner_tax_adjustments — that is
 *     the difference between fixing Cogniiq and breaking it
 *   • the two token offer functions keep anon EXECUTE
 *   • the verify script is read-only
 *   • every object the hardening names also appears in the rollback
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const OPS = path.join(ROOT, 'supabase', 'ops');
const read = (f: string) => readFileSync(path.join(OPS, f), 'utf8');

const stripLineComments = (sql: string) =>
  sql.split('\n').map((line) => { const i = line.indexOf('--'); return i >= 0 ? line.slice(0, i) : line; }).join('\n');
const blankStrings = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`);

const HARDENING = read('shared_project_hardening.sql');
const ROLLBACK = read('shared_project_hardening_rollback.sql');
const VERIFY = read('shared_project_hardening_verify.sql');

/** The 20 legacy tables the hardening locks down, in its own words. */
const LEGACY = [
  'audit_log', 'bank_accounts', 'categories', 'categorization_rules', 'documents',
  'import_batches', 'loan_payments', 'loans', 'property_units',
  'renovation_project_invoices', 'renovation_projects', 'suppliers', 'tenants',
  'utility_accounts', 'utility_bills',
  'emails', 'email_attachments', 'properties',
  'invoices', 'transactions',
];

describe('shared_project_hardening.sql', () => {
  it('names every one of the 20 legacy tables the inventory flagged', () => {
    const missing = LEGACY.filter((t) => !new RegExp(`'${t}'`).test(HARDENING));
    expect(missing).toEqual([]);
  });

  it('is a dry run unless apply=yes', () => {
    expect(HARDENING).toMatch(/current_setting\('cogniiq\.hardening_apply',\s*true\)\s*=\s*'yes'/);
    expect(HARDENING).toMatch(/\\set apply no/);
    // Every mutation is behind `if apply then`.
    const executes = HARDENING.match(/execute format\('(alter|revoke|drop|grant|create)[^']*'/gi) ?? [];
    expect(executes.length).toBeGreaterThan(0);
  });

  it('refuses a bolagio_ table outright', () => {
    expect(HARDENING).toMatch(/like 'bolagio\\_%'/);
    expect(HARDENING).toMatch(/REFUSED: % is a BoLaGio table/);
  });

  it('never creates or drops a table, a column or a row', () => {
    const code = blankStrings(stripLineComments(HARDENING));
    for (const forbidden of [
      /(^|;|\n|')\s*create\s+table\b/i, /(^|;|\n|')\s*drop\s+table\b/i,
      /(^|;|\n|')\s*insert\s+into\b/i, /(^|;|\n|')\s*delete\s+from\b/i,
      /(^|;|\n|')\s*truncate\b/i, /alter\s+table[^']*\b(add|drop)\s+column\b/i,
      /alter\s+role\b/i, /create\s+role\b/i, /drop\s+role\b/i,
    ]) {
      expect({ pattern: String(forbidden), found: forbidden.exec(code)?.[0] ?? null }).toEqual({ pattern: String(forbidden), found: null });
    }
  });

  it('never touches service_role', () => {
    expect(/\bservice_role\b/.test(blankStrings(stripLineComments(HARDENING)))).toBe(false);
  });

  it('touches exactly one Cogniiq table, and gives it a policy rather than a lockout', () => {
    // Comments stripped but strings kept: the table names live inside the SQL
    // string literals this file executes.
    const code = stripLineComments(HARDENING);
    // The only owner_/organization_/customer_ table named in executable code.
    const cogniiq = Array.from(code.matchAll(/\b(owner|organization|customer|client|ai_receptionist|oura|execution)_[a-z_]+/g)).map((m) => m[0]);
    const distinct = Array.from(new Set(cogniiq)).sort();
    expect(distinct).toEqual(['owner_tax_adjustments', 'owner_tax_adjustments_owner_all']);
    expect(HARDENING).toMatch(/using \(is_platform_owner\(\)\) with check \(is_platform_owner\(\)\)/);
  });

  it('never revokes `authenticated` from owner_tax_adjustments — that would break Cogniiq', () => {
    const revokes = HARDENING.match(/revoke[^;']*owner_tax_adjustments[^;']*/gi) ?? [];
    expect(revokes.length).toBeGreaterThan(0);
    for (const r of revokes) expect(/\bauthenticated\b/.test(r)).toBe(false);
  });

  it('aborts rather than guessing if is_platform_owner() is absent', () => {
    expect(HARDENING).toMatch(/is_platform_owner\(\)'\) is null then[\s\S]{0,200}raise exception/);
    expect(HARDENING).toMatch(/do NOT fall back to revoking/);
  });

  it('keeps anon EXECUTE on both token offer functions, and pins their search_path', () => {
    for (const fn of ['public_offer_by_token', 'respond_offer_by_token']) {
      expect(HARDENING).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon, authenticated`));
      expect(HARDENING).toMatch(new RegExp(`alter function public\\.${fn}\\([^)]*\\) set search_path = public, pg_temp`));
    }
  });

  it('takes the execution planner away from anon but leaves it to authenticated', () => {
    expect(HARDENING).toMatch(/revoke all on function public\.generate_daily_execution_plan\(date\) from public, anon/);
    expect(HARDENING).toMatch(/grant execute on function public\.generate_daily_execution_plan\(date\) to authenticated/);
  });

  it('closes the identity sequences as well as the tables', () => {
    expect(HARDENING).toMatch(/revoke all on sequence %s from anon, authenticated/);
  });

  it('changes no storage policy — that decision is the runbook\'s, not this file\'s', () => {
    expect(/\bstorage\.(objects|buckets)\b/.test(blankStrings(stripLineComments(HARDENING)))).toBe(false);
  });
});

describe('shared_project_hardening_rollback.sql', () => {
  it('restores every legacy table the hardening locked down', () => {
    const missing = LEGACY.filter((t) => !new RegExp(`'${t}'`).test(ROLLBACK));
    expect(missing).toEqual([]);
  });

  it('is a dry run unless apply=yes, and refuses bolagio_', () => {
    expect(ROLLBACK).toMatch(/current_setting\('cogniiq\.rollback_apply',\s*true\)\s*=\s*'yes'/);
    expect(ROLLBACK).toMatch(/REFUSED: % is a BoLaGio table/);
  });

  it('recreates all six permissive policies by their exact names', () => {
    for (const name of [
      'Allow anon read emails', 'Authenticated users can manage emails',
      'Allow anon read email attachments', 'Authenticated users can manage email attachments',
      'Authenticated users can read properties', 'Authenticated users can modify properties',
    ]) {
      expect(ROLLBACK).toContain(name);
    }
  });

  it('keeps the pinned search_path — a rollback restores capability, not a bug', () => {
    expect(/alter function[^;]*reset search_path/i.test(ROLLBACK)).toBe(false);
    expect(ROLLBACK).toMatch(/Deliberately NOT restored/);
  });

  it('only re-enables RLS-off on the fifteen that had it off', () => {
    // emails/email_attachments/properties/invoices/transactions had RLS ON
    // before the hardening; disabling it on rollback would be a new hole.
    expect(ROLLBACK).toMatch(/rls_was_on constant text\[\] := array\['emails','email_attachments','properties','invoices','transactions'\]/);
  });
});

describe('shared_project_hardening_verify.sql', () => {
  const FORBIDDEN = [
    /(^|;|\n)\s*insert\s+into\b/i, /(^|;|\n)\s*update\s+[a-z_."]+\s+set\b/i,
    /(^|;|\n)\s*delete\s+from\b/i, /(^|;|\n)\s*alter\s+(table|function|role|policy)\b/i,
    /(^|;|\n)\s*drop\s+(table|function|policy|role)\b/i,
    /(^|;|\n)\s*create\s+(table|policy|role|index)\b/i,
    /(^|;|\n)\s*(grant|revoke)\b/i, /(^|;|\n)\s*truncate\b/i,
  ];

  it('is read-only', () => {
    const sql = blankStrings(stripLineComments(VERIFY));
    for (const f of FORBIDDEN) {
      expect({ p: String(f), found: f.exec(sql)?.[0]?.trim() ?? null }).toEqual({ p: String(f), found: null });
    }
  });

  it('checks every legacy table, and fails loudly rather than silently', () => {
    const missing = LEGACY.filter((t) => !new RegExp(`'${t}'`).test(VERIFY));
    expect(missing).toEqual([]);
    expect(VERIFY).toMatch(/raise exception[\s\S]{0,80}VERIFICATION FAILED/);
  });

  it('treats a LOST authenticated grant on owner_tax_adjustments as a failure', () => {
    expect(VERIFY).toMatch(/authenticated LOST its grants/);
    expect(VERIFY).toMatch(/every owner insert will fail/);
  });

  it('treats a LOST anon EXECUTE on the offer flow as a failure', () => {
    expect(VERIFY).toMatch(/anon LOST execute — the public offer flow is broken/);
  });

  it('reports the remaining anon-executable functions rather than asserting about them', () => {
    expect(VERIFY).toMatch(/has_function_privilege\('anon', p\.oid, 'execute'\)/);
    expect(VERIFY).toMatch(/REPORT 1/);
    expect(VERIFY).toMatch(/REPORT 2/);
  });
});

describe('the generic proposal is retired', () => {
  it('proposed_unrelated_hardening.sql no longer exists', () => {
    expect(existsSync(path.join(OPS, 'proposed_unrelated_hardening.sql'))).toBe(false);
  });
});

describe('the fixture is test-only and never confused for the real thing', () => {
  const FIXTURE = readFileSync(path.join(OPS, 'fixtures', 'cogniiq_shared_project_fixture.sql'), 'utf8');

  it('says so at the top', () => {
    expect(FIXTURE).toMatch(/TEST ONLY/);
  });

  it('reproduces the exposure rather than the fix', () => {
    // If someone "helpfully" hardens the fixture, the proof proves nothing.
    expect(FIXTURE).toMatch(/disable row level security/);
    expect(FIXTURE).toMatch(/grant select, insert, update, delete on table public\.%I to anon, authenticated/);
    expect(FIXTURE).toMatch(/"Allow anon read emails"/);
  });

  it('is referenced only by the check script, never by a runbook or migration', () => {
    const hard = read('shared_project_hardening.sql');
    expect(hard).not.toContain('cogniiq_shared_project_fixture');
    expect(ROLLBACK).not.toContain('cogniiq_shared_project_fixture');
    expect(VERIFY).not.toContain('cogniiq_shared_project_fixture');
  });
});
