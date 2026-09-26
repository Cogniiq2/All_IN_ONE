/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE SHARED-PROJECT INVARIANTS, over the SQL sources.
 *
 * BoLaGio shares one Supabase project with unrelated (Cogniiq) tables
 * (docs/supabase-shared-project.md). The database-level proofs run against
 * a real cluster (scripts/db-ops-check.sh, shared_project_verify.sql); what
 * is asserted here is what the FILES promise, so a careless edit is caught
 * by `npm test` before it reaches any database:
 *
 *   • the inventory and the verify script are read-only
 *   • the shared-project hardening is a named, per-object script (its own
 *     invariants are in tests/shared-project-hardening.test.ts)
 *   • the bolagio_app role never grants to a browser role
 *   • no BoLaGio migration creates, alters or drops anything that is not
 *     bolagio_* — "BoLaGio migrations never mutate Cogniiq tables"
 *   • no workflow file carries anything that looks like a credential
 *
 * Plain string work over fs.readFileSync; no database, no network.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const OPS = path.join(ROOT, 'supabase', 'ops');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Drop `-- …` line comments. Dollar-quoted bodies and strings stay. */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map(function (line) {
      const i = line.indexOf('--');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
}

/** Replace the contents of single-quoted string literals with spaces. */
function blankStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, function (m) {
    return "'" + new Array(m.length - 1).join(' ') + "'";
  });
}

function listFiles(dir: string, filter: (name: string) => boolean): string[] {
  const names = readdirSync(dir).filter(filter).sort();
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) out.push(path.join(dir, names[i]));
  return out;
}

/* ── 1. inventory and verify are read-only ─────────────────────────────── */

describe('shared_project_inventory.sql and shared_project_verify.sql are read-only', function () {
  const files = ['shared_project_inventory.sql', 'shared_project_verify.sql'];

  // A DML/DDL keyword at the start of a statement or a line. `create temp`
  // and `create or replace function pg_temp.` are the allowed exceptions.
  const FORBIDDEN = [
    /(^|;|\n)\s*insert\s+into\b/i,
    /(^|;|\n)\s*update\s+[a-z_."]+\s+set\b/i,
    /(^|;|\n)\s*delete\s+from\b/i,
    /(^|;|\n)\s*alter\s+(table|type|function|role|policy|view|database|schema|default)\b/i,
    /(^|;|\n)\s*drop\s+(table|type|function|role|policy|view|index|trigger|schema)\b/i,
    /(^|;|\n)\s*create\s+(table|index|unique\s+index|type|role|policy|trigger|view|schema|extension)\b/i,
    /(^|;|\n)\s*create\s+or\s+replace\s+(table|index|type|role|policy|trigger|view|schema)\b/i,
    /(^|;|\n)\s*truncate\b/i,
    /(^|;|\n)\s*(grant|revoke)\b/i,
  ];

  for (let f = 0; f < files.length; f++) {
    const name = files[f];
    it(name + ' contains no INSERT/UPDATE/DELETE/ALTER/DROP/CREATE TABLE', function () {
      let sql = blankStrings(stripLineComments(read(path.join(OPS, name))));
      // allowed: session-local helpers
      sql = sql.replace(/create\s+or\s+replace\s+function\s+pg_temp\./gi, 'ALLOWED_TEMP_FUNCTION ');
      sql = sql.replace(/create\s+temp(orary)?\s+/gi, 'ALLOWED_TEMP ');
      for (let i = 0; i < FORBIDDEN.length; i++) {
        const m = FORBIDDEN[i].exec(sql);
        expect(m === null ? null : name + ': ' + m[0].trim()).toBeNull();
      }
      // and every `create` that survives is the pg_temp helper only
      const creates = sql.match(/(^|;|\n)\s*create\s+\w+/gi) || [];
      expect(creates).toEqual([]);
    });
  }

  it('the inventory changes no setting (no SET beyond psql \\set and \\pset)', function () {
    const sql = blankStrings(stripLineComments(read(path.join(OPS, 'shared_project_inventory.sql'))));
    const sets = (sql.match(/(^|;|\n)\s*set\s+\w+/gi) || []).map(function (s) { return s.trim(); });
    expect(sets).toEqual([]);
  });
});

/* ── 2. the hardening proposal is retired ──────────────────────────────── */
// `proposed_unrelated_hardening.sql` took a table list from the operator and
// applied one blunt treatment to all of it. The live inventory of 2026-09-20
// found three different problems needing three different answers — and one
// Cogniiq table that treatment would have BROKEN. It was replaced by the
// named, per-object supabase/ops/shared_project_hardening.sql, whose own
// invariants live in tests/shared-project-hardening.test.ts.

/* ── 3. bolagio_app never grants to a browser role ─────────────────────── */

describe('bolagio_app_role.sql', function () {
  const code = stripLineComments(read(path.join(OPS, 'bolagio_app_role.sql')));

  it('never grants to anon or authenticated', function () {
    const grants = code.match(/grant\s+[^;]*?\s+to\s+[^;]+/gi) || [];
    expect(grants.length).toBeGreaterThan(0);
    for (let i = 0; i < grants.length; i++) {
      expect(/\bto\s+[^;]*\b(anon|authenticated|public)\b/i.test(grants[i])).toBe(false);
    }
    const policies = code.match(/create\s+policy[^;]+/gi) || [];
    for (let i = 0; i < policies.length; i++) {
      expect(policies[i]).toMatch(/\bto\s+bolagio_app\b/);
      expect(/\b(anon|authenticated)\b/.test(policies[i])).toBe(false);
    }
  });

  it('creates the role NOLOGIN and NOBYPASSRLS and touches only bolagio_ objects', function () {
    expect(code).toMatch(/create\s+role\s+bolagio_app\s+nologin\s+nobypassrls/i);
    expect(code).toMatch(/like 'bolagio\\_%'/);
    expect(code).not.toMatch(/alter\s+role\s+service_role/i);
  });
});

/* ── 4. BoLaGio migrations never mutate Cogniiq tables ─────────────────── */

describe('BoLaGio migrations create/alter/drop bolagio_ objects only', function () {
  const files = listFiles(MIGRATIONS, function (name) {
    return /^2026091\d.*\.sql$/.test(name) || /^2026092\d.*\.sql$/.test(name);
  });

  it('finds the twelve migration files', function () {
    // 2026-09-16 booking foundation … 2026-09-27 finance ingestion pipeline.
    expect(files.length).toBe(12);
  });

  // Every DDL head followed by the object name. `if [not] exists` and
  // `unique`/`or replace` are absorbed; schema-qualified names are allowed
  // only in public.
  const DDL = new RegExp(
    '\\b(create\\s+(or\\s+replace\\s+)?(unique\\s+)?(table|function|view|type|index|trigger|policy|sequence|schema|role)' +
      '|alter\\s+(table|function|view|type|policy|sequence|role|schema)' +
      '|drop\\s+(table|function|view|type|index|trigger|policy|sequence|schema|role)' +
      '|(grant|revoke)\\s+[^;]*?\\bon\\s+(table|function|sequence|all\\s+\\w+\\s+in\\s+schema)?' +
      '|comment\\s+on\\s+(table|column|function|view|type)' +
      '|truncate' +
      ')\\s+(if\\s+(not\\s+)?exists\\s+)?("?[a-z_][a-z0-9_]*"?\\.)?("?[a-z_][a-z0-9_]*"?)',
    'gi'
  );

  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    it(path.basename(file) + ' names only bolagio_ objects', function () {
      const code = blankStrings(stripLineComments(read(file)));
      const offenders: string[] = [];
      let m: RegExpExecArray | null;
      DDL.lastIndex = 0;
      while ((m = DDL.exec(code)) !== null) {
        const head = m[1].toLowerCase().replace(/\s+/g, ' ');
        // groups: 1 head … 10 `if [not] exists`, 11 `not`, 12 schema, 13 name
        const schema = (m[12] || '').replace(/"|\./g, '');
        const target = (m[13] || '').replace(/"/g, '');
        if (/^(grant|revoke)\b/.test(head)) {
          // `grant … on all functions in schema public` never appears; a
          // per-object grant/revoke must target bolagio_. A grant on a schema
          // (`grant usage on schema public`) is not an object mutation.
          if (/\bon\s+schema\b/i.test(m[0])) continue;
          if (/\ball\s+\w+\s+in\s+schema\b/i.test(m[0])) { offenders.push(m[0].trim()); continue; }
        }
        if (head.indexOf('create policy') === 0 || head.indexOf('drop policy') === 0 || head.indexOf('alter policy') === 0) {
          // policy names are free; the table is what matters
          const on = /\bon\s+("?[a-z_][a-z0-9_]*"?\.)?("?bolagio_[a-z0-9_]*"?)/i.exec(code.slice(m.index, m.index + 400));
          if (!on) offenders.push(m[0].trim());
          continue;
        }
        if (head.indexOf('comment on column') === 0) {
          // `comment on column <table>.<column>`: the table is the qualifier
          if (schema.indexOf('bolagio_') !== 0) offenders.push(m[0].trim());
          continue;
        }
        if (head.indexOf('drop trigger') === 0 || head.indexOf('create trigger') === 0) {
          // trigger names are bolagio_ by convention AND the table must be
          const on = /\bon\s+("?[a-z_][a-z0-9_]*"?\.)?("?bolagio_[a-z0-9_]*"?)/i.exec(code.slice(m.index, m.index + 400));
          if (!on) offenders.push(m[0].trim());
          if (target.indexOf('bolagio_') !== 0) offenders.push(m[0].trim());
          continue;
        }
        if (schema && schema !== 'public') offenders.push(m[0].trim());
        if (target.indexOf('bolagio_') !== 0) offenders.push(m[0].trim());
      }
      expect(offenders).toEqual([]);
    });
  }

  it('the only extension any migration creates is btree_gist', function () {
    for (let f = 0; f < files.length; f++) {
      const code = blankStrings(stripLineComments(read(files[f])));
      const exts = code.match(/create\s+extension\s+(if\s+not\s+exists\s+)?(\w+)/gi) || [];
      for (let i = 0; i < exts.length; i++) expect(exts[i]).toMatch(/btree_gist$/i);
    }
  });

  it('no migration references an unrelated table by name', function () {
    const unrelated = ['invoices', 'emails', 'email_attachments', 'properties', 'property_units'];
    for (let f = 0; f < files.length; f++) {
      const code = blankStrings(stripLineComments(read(files[f])));
      for (let i = 0; i < unrelated.length; i++) {
        const re = new RegExp('\\b(from|join|into|update|table|on)\\s+(public\\.)?' + unrelated[i] + '\\b', 'i');
        expect(re.test(code) ? path.basename(files[f]) + ' → ' + unrelated[i] : null).toBeNull();
      }
    }
  });
});

/* ── 5. no credential-looking string in any workflow ───────────────────── */

describe('.github/workflows/*.yml carry no credential', function () {
  const files = listFiles(WORKFLOWS, function (name) { return /\.ya?ml$/.test(name); });

  it('finds the workflow files', function () {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    it(path.basename(file), function () {
      const text = read(file);
      // Stripe-style / generic secret-key prefixes
      expect(/\bsk_(live|test)?_?[A-Za-z0-9]{8,}/.test(text)).toBe(false);
      expect(/\b(rk|pk)_(live|test)_[A-Za-z0-9]{8,}/.test(text)).toBe(false);
      // 32+ hex characters in a row (an API key, an HMAC secret, a token).
      // Action pins by SHA would match too; the repository pins by tag.
      const hex = text.match(/\b[0-9a-f]{32,}\b/gi) || [];
      expect(hex).toEqual([]);
      // a private key block
      expect(text.indexOf('BEGIN PRIVATE')).toBe(-1);
      expect(text.indexOf('BEGIN RSA PRIVATE')).toBe(-1);
      expect(text.indexOf('BEGIN OPENSSH PRIVATE')).toBe(-1);
      // a JWT (three base64url segments starting with the standard header)
      expect(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text)).toBe(false);
      // an assignment of a literal to a *_SECRET / *_TOKEN / *_KEY name
      const literal = /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY)\b\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{16,}['"]?/g;
      let m: RegExpExecArray | null;
      const hits: string[] = [];
      while ((m = literal.exec(text)) !== null) {
        // `${{ secrets.X }}` references and the `secrets:` key of a step are fine
        if (/\$\{\{/.test(m[0])) continue;
        hits.push(m[0]);
      }
      expect(hits).toEqual([]);
    });
  }

  it('ci.yml references no repository secret and runs only on push/pull_request', function () {
    const text = read(path.join(WORKFLOWS, 'ci.yml'));
    expect(/\$\{\{\s*secrets\./.test(text)).toBe(false);
    expect(text).toMatch(/\non:\n\s+push:\n\s+pull_request:/);
    expect(text).not.toMatch(/\n\s*workflow_dispatch:/);
  });
});
