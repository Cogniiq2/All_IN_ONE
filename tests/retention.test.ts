/**
 * ══════════════════════════════════════════════════════════════════════════
 * RETENTION — every table classified; nothing deletes guest data on its own.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { personalDataTables, RETENTION_CLASSES, retentionClassFor } from '@/lib/retention/policy';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

function bolagioMigrations(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => /^2026(091[6-9]|092)/.test(f) && f.endsWith('.sql')).map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf8'));
}

describe('the retention classification', () => {
  it('covers every bolagio_* table the migrations create', () => {
    const tables = new Set<string>();
    for (const sql of bolagioMigrations()) {
      sql.replace(/create table if not exists (bolagio_[a-z_]+)/g, (_all, name: string) => { tables.add(name); return _all; });
    }
    expect(tables.size).toBeGreaterThan(10);
    const missing = Array.from(tables).filter((t) => !retentionClassFor(t));
    expect(missing).toEqual([]);
  });

  it('names a purpose, a proposed period and a legal hint for each, and never an automated mechanism', () => {
    for (const c of RETENTION_CLASSES) {
      expect(c.purpose.length).toBeGreaterThan(20);
      expect(c.proposedRetention.length).toBeGreaterThan(5);
      expect(c.legalBasisHint.length).toBeGreaterThan(5);
      expect(c.mechanism).toBe('manual, documented');
    }
  });

  it('flags every period that is a proposal, and lists the personal-data tables a subject-access request must reach', () => {
    const proposals = RETENTION_CLASSES.filter((c) => /NEEDS CONFIRMATION/.test(c.proposedRetention));
    expect(proposals.length).toBeGreaterThan(8);
    expect(personalDataTables()).toEqual(expect.arrayContaining(['bolagio_booking_intents', 'bolagio_message_deliveries', 'bolagio_payment_events', 'bolagio_admin_audit_log', 'bolagio_operators']));
  });

  it('no migration deletes from a guest-data table', () => {
    const guestTables = ['bolagio_booking_intents', 'bolagio_message_deliveries', 'bolagio_payment_events'];
    for (const sql of bolagioMigrations()) {
      for (const t of guestTables) {
        expect(sql).not.toMatch(new RegExp(`delete\\s+from\\s+${t}\\b`, 'i'));
        expect(sql).not.toMatch(new RegExp(`truncate\\s+(table\\s+)?${t}\\b`, 'i'));
      }
    }
  });

  it('no scheduled or reconciliation code path deletes booking rows', () => {
    const files = ['lib/booking/reconciliation.ts', 'lib/booking/operations.ts', 'lib/booking/service.ts', 'lib/booking/commands.ts', 'lib/booking/cancellation.ts', 'lib/booking/refunds.ts', 'lib/booking/release.ts', 'lib/booking/payments.ts', 'lib/admin/actions.ts'];
    for (const f of files) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(/\.delete\(\)/);
      expect(src, f).not.toMatch(/delete\s+from\s+bolagio_/i);
    }
  });
});
