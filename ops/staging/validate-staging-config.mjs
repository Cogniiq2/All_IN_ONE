#!/usr/bin/env node
/**
 * Validate a STAGING dotenv file before anything is deployed with it.
 *
 *   node --experimental-strip-types ops/staging/validate-staging-config.mjs .env.staging
 *
 * Two layers, both printing variable NAMES only, never values:
 *   1. the application's own rules — lib/config/environment.ts
 *      validateEnvironment(), exactly as scripts/check-env.mjs applies them;
 *      any `refuse` finding fails
 *   2. staging-specific rules that the application cannot know (it does not
 *      know which deployment it is meant to be):
 *        APP_ENV=staging · PAYPAL_MODE=sandbox · BEDS24_MODE=live
 *        no PAYPAL_SIMULATOR_URL · no BEDS24_API_BASE_URL
 *        ADMIN_PREVIEW_DEMO, ADMIN_PREVIEW_EMAIL, ADMIN_PREVIEW_PASSWORD, ADMIN_DEV_FIXTURES unset
 *        PAYMENT_REFUND_EXECUTION_ENABLED and OPERATOR_PAID_CANCELLATION_ENABLED not true
 *        MESSAGING_TEST_COMPLETIONS_ALLOWED unset (a rehearsal sets it, then removes it)
 *        no NEXT_PUBLIC_ variable at all
 *        no <placeholder> left from .env.staging.example
 *        the required names present
 *
 * Exit 1 on any violation. The example file itself FAILS this validator by
 * design (PLACEHOLDER_VALUE): an unfilled copy must never pass.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node --experimental-strip-types ops/staging/validate-staging-config.mjs <dotenv-file>');
  process.exit(2);
}

const source = {};
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (line.trim().startsWith('#')) continue;
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (!m) continue;
  source[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const get = (name) => (source[name] ?? '').trim();
const isSet = (name) => get(name) !== '';

const violations = [];
const warnings = [];

/* ── 1. the application's rules ───────────────────────────────────────── */
const mod = await import(pathToFileURL(resolve('lib/config/environment.ts')).href);
const report = mod.validateEnvironment(source);
console.log(`environment: ${report.environment}${report.environmentAssumed ? ' (assumed — APP_ENV not recognised)' : ''}`);
console.log(`direct booking: ${get('DIRECT_BOOKING_ENABLED') === 'true' ? 'requested' : 'off'} → ${report.directBookingPermitted ? 'PERMITTED' : 'NOT PERMITTED'}`);
for (const f of report.findings) {
  (f.severity === 'refuse' ? violations : warnings).push(`${f.code}: ${f.message}`);
}

/* ── 2. staging-specific rules ────────────────────────────────────────── */
const mustEqual = (name, expected) => {
  if (get(name) !== expected) violations.push(`STAGING_${name}_MUST_BE_${expected.toUpperCase()}: ${name} must be exactly "${expected}" on staging`);
};
const mustBeUnset = (name, why) => {
  if (isSet(name)) violations.push(`STAGING_${name}_MUST_BE_UNSET: ${name} is set — ${why}`);
};
const mustNotBeTrue = (name, why) => {
  if (get(name) === 'true') violations.push(`STAGING_${name}_MUST_NOT_BE_TRUE: ${why}`);
};
const mustBePresent = (name) => {
  if (!isSet(name)) violations.push(`STAGING_MISSING_${name}: ${name} is required on staging`);
};

mustEqual('APP_ENV', 'staging');
mustEqual('PAYPAL_MODE', 'sandbox');
mustEqual('BEDS24_MODE', 'live');
mustBeUnset('PAYPAL_SIMULATOR_URL', 'the simulator replaces PayPal; staging must exercise the real sandbox');
mustBeUnset('BEDS24_API_BASE_URL', 'staging must talk to the real Beds24 API, not an override');
mustBeUnset('ADMIN_PREVIEW_DEMO', 'the preview demo belongs to preview deployments only');
mustBeUnset('ADMIN_PREVIEW_EMAIL', 'preview-only credential');
mustBeUnset('ADMIN_PREVIEW_PASSWORD', 'preview-only credential');
mustBeUnset('ADMIN_DEV_FIXTURES', 'fixtures are for local development only');
mustNotBeTrue('PAYMENT_REFUND_EXECUTION_ENABLED', 'refund execution is unproven; staging records refund decisions and sends nothing');
mustNotBeTrue('OPERATOR_PAID_CANCELLATION_ENABLED', 'paid-cancellation on the live Beds24 account is not proven');
mustBeUnset('MESSAGING_TEST_COMPLETIONS_ALLOWED', 'set it only for a messaging rehearsal and remove it afterwards');

for (const name of ['BEDS24_REFRESH_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
                    'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID',
                    'N8N_INTERNAL_SECRET', 'BOOKING_SYNC_SECRET', 'ADMIN_SESSION_SECRET']) {
  mustBePresent(name);
}
if (isSet('ADMIN_SESSION_SECRET') && get('ADMIN_SESSION_SECRET').length < 32) {
  violations.push('STAGING_ADMIN_SESSION_SECRET_TOO_SHORT: ADMIN_SESSION_SECRET must be at least 32 characters');
}
if (isSet('SUPABASE_URL') && !/<[^>]+>/.test(get('SUPABASE_URL')) && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(get('SUPABASE_URL'))) {
  violations.push('STAGING_SUPABASE_URL_SHAPE: SUPABASE_URL is not an https://<ref>.supabase.co URL');
}
for (const name of Object.keys(source)) {
  if (name.startsWith('NEXT_PUBLIC_')) violations.push(`STAGING_NEXT_PUBLIC_FORBIDDEN: ${name} — nothing in this configuration may reach a client bundle`);
  if (/<[^>]+>/.test(get(name))) violations.push(`PLACEHOLDER_VALUE: ${name} still carries a <placeholder> from the example file`);
  if (/^(changeme|change-me|replace-me|todo|xxx+)$/i.test(get(name))) violations.push(`PLACEHOLDER_VALUE: ${name} carries an obvious placeholder`);
}
if (get('DIRECT_BOOKING_ENABLED') === 'true') {
  warnings.push('STAGING_DIRECT_BOOKING_ON: DIRECT_BOOKING_ENABLED=true — acceptable only for the scripted sandbox end-to-end run; switch it off afterwards');
}

/* ── verdict ──────────────────────────────────────────────────────────── */
for (const w of warnings) console.log(`  [WARN] ${w}`);
for (const v of violations) console.log(`  [REFUSE] ${v}`);
if (violations.length === 0) {
  console.log('staging configuration: OK');
  process.exit(0);
}
console.log(`staging configuration: REFUSED (${violations.length} violation${violations.length === 1 ? '' : 's'})`);
process.exit(1);
