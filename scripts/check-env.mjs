#!/usr/bin/env node
/**
 * Print the environment verdict a deployment would reach, before deploying.
 *
 *   node scripts/check-env.mjs                 # reads process.env
 *   node scripts/check-env.mjs .env.production # reads a dotenv file
 *
 * Loads the SAME rules the application applies (lib/config/environment.ts,
 * which has no imports for exactly this reason). Exit 1 on any `refuse`
 * finding, so a deploy script can gate on it. Prints variable NAMES only.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = process.argv[2];
let source = process.env;
if (file) {
  source = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    source[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const mod = await import(pathToFileURL(resolve('lib/config/environment.ts')).href);
const report = mod.validateEnvironment(source);

console.log(`environment: ${report.environment}${report.environmentAssumed ? ' (assumed — APP_ENV not recognised)' : ''}`);
console.log(`direct booking: ${source.DIRECT_BOOKING_ENABLED === 'true' ? 'requested' : 'off'} → ${report.directBookingPermitted ? 'PERMITTED' : 'NOT PERMITTED'}`);
if (report.findings.length === 0) console.log('no findings');
for (const f of report.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
process.exit(report.findings.some((f) => f.severity === 'refuse') ? 1 : 0);
