#!/usr/bin/env node
/**
 * BoLaGio n8n package — the STAGING variant, for the shared n8n instance.
 *
 *   node n8n/build-staging.mjs              writes n8n/workflows-staging/*.json
 *   node n8n/build-staging.mjs --out DIR    writes the same files into DIR
 *
 * The production workflows read instance-wide `BOLAGIO_*` variables, so one
 * n8n instance can serve staging OR production with them, never both. These
 * copies are the same workflows, mechanically renamed so that nothing they
 * read, call or report to is shared with the production package:
 *
 *   names          "BoLaGio · …"          → "BoLaGio STAGING · …"
 *   workflow ids   derived from the new names (Execute Workflow targets and
 *                  the error workflow follow)
 *   variables      $env.BOLAGIO_*         → $env.BOLAGIO_STAGING_*
 *   credential     "BoLaGio SMTP"         → "BoLaGio STAGING SMTP"
 *   outbox worker  "n8n-bolagio"          → "n8n-bolagio-staging"
 *   tag            "bolagio"              → "bolagio-staging"
 *
 * Every file is exported INACTIVE. Generated from the production generator's
 * own output, so the two packages cannot drift apart in behaviour.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAMES, IDS, WORKER, WORKFLOWS, credentialPlaceholderId, render, workflowId } from './build.mjs';

const PREFIX = 'BoLaGio · ';
const STAGING_PREFIX = 'BoLaGio STAGING · ';
const STAGING_NAMES = Object.fromEntries(Object.entries(NAMES).map(([k, n]) => [k, n.replace(PREFIX, STAGING_PREFIX)]));
const STAGING_IDS = Object.fromEntries(Object.entries(STAGING_NAMES).map(([k, n]) => [k, workflowId(n)]));

export const STAGING_FILE = (file) => file.replace(/^bolagio-/, 'bolagio-staging-');

/** Production JSON text → staging JSON text. Pure string mapping, checked by tests/n8n-workflows.test.ts. */
export function toStaging(json) {
  let out = json;
  for (const key of Object.keys(NAMES)) {
    out = out.split(NAMES[key]).join(STAGING_NAMES[key]);
    out = out.split(IDS[key]).join(STAGING_IDS[key]);
  }
  // The error handler's own guard: only staging workflows are reported by the staging handler.
  out = out.split("startsWith('BoLaGio ·')").join("startsWith('BoLaGio STAGING ·')");
  out = out.split('BOLAGIO_').join('BOLAGIO_STAGING_');
  out = out.split(credentialPlaceholderId('BoLaGio SMTP')).join(credentialPlaceholderId('BoLaGio STAGING SMTP'));
  out = out.split('"BoLaGio SMTP"').join('"BoLaGio STAGING SMTP"');
  out = out.split("'" + WORKER + "'").join("'" + WORKER + "-staging'");
  out = out.split('"' + WORKER + '"').join('"' + WORKER + '-staging"');
  out = out.split('"name": "bolagio"').join('"name": "bolagio-staging"');
  return out;
}

function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outIndex = argv.indexOf('--out');
  const outDir = resolve(outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : join(here, 'workflows-staging'));
  mkdirSync(outDir, { recursive: true });
  for (const [file, build] of Object.entries(WORKFLOWS)) {
    writeFileSync(join(outDir, STAGING_FILE(file)), toStaging(render(build)), 'utf8');
    process.stdout.write(STAGING_FILE(file) + '\n');
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));
