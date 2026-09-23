/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ENVIRONMENT MODEL — what this deployment is, and whether its
 * configuration is allowed to mean what it says.
 *
 * Four environments, declared by `APP_ENV` and never inferred:
 *
 *   local        a developer's machine. Mock Beds24, PayPal sandbox at most.
 *   preview      a Cloudflare preview of a branch. Synthetic admin data at
 *                most; never a payment, never a reservation.
 *   staging      the rehearsal of production: real Beds24 account, PayPal
 *                SANDBOX, its own Supabase project. Where the sandbox
 *                end-to-end run happens.
 *   production   the real thing. PayPal live, Beds24 live, production
 *                Supabase.
 *
 * Anything that is not exactly one of those four — unset, misspelled, mixed
 * case — is read as PRODUCTION. Being wrong in that direction costs a demo;
 * being wrong the other way is the risk this file exists to remove.
 *
 * ── Contradictions are refusals, not warnings ────────────────────────────
 * `validateEnvironment()` returns findings. A `refuse` finding means the
 * configuration contradicts itself in a way that could move money or
 * inventory against the wrong system, and the direct-booking gate treats
 * the deployment as DISABLED until it is fixed — whatever
 * `DIRECT_BOOKING_ENABLED` says. A `warn` finding is surfaced on the System
 * page and in the logs and changes no behaviour.
 *
 * ── No imports, on purpose ───────────────────────────────────────────────
 * This module reads `process.env` and nothing else, so `scripts/check-env.mjs`
 * can load it outside Next.js and print the same verdict a deployment would
 * reach. Nothing here is a secret VALUE: findings name variables, never
 * their contents.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const APP_ENVIRONMENTS = ['local', 'preview', 'staging', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export type FindingSeverity = 'refuse' | 'warn';

export interface EnvironmentFinding {
  code: string;
  severity: FindingSeverity;
  /** Names variables and conditions. Never a value. */
  message: string;
}

export interface EnvironmentReport {
  environment: AppEnvironment;
  /** True when `APP_ENV` was not one of the four names and production was assumed. */
  environmentAssumed: boolean;
  findings: EnvironmentFinding[];
  /** `DIRECT_BOOKING_ENABLED=true` AND no `refuse` finding. The gate the routes read. */
  directBookingPermitted: boolean;
}

/** Everything the rules read, as strings or undefined. Injectable for tests. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function read(source: EnvironmentSource, name: string): string | undefined {
  const value = source[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function isOn(source: EnvironmentSource, name: string): boolean {
  return read(source, name) === 'true';
}

export function appEnvironment(source: EnvironmentSource = process.env): AppEnvironment {
  const raw = read(source, 'APP_ENV');
  return (APP_ENVIRONMENTS as readonly string[]).includes(raw ?? '') ? (raw as AppEnvironment) : 'production';
}

export function isProductionLike(environment: AppEnvironment): boolean {
  return environment === 'production' || environment === 'staging';
}

/**
 * The rules. Each one is a sentence an operator can act on, and each names
 * the variables involved — never their values.
 */
export function validateEnvironment(source: EnvironmentSource = process.env): EnvironmentReport {
  const environment = appEnvironment(source);
  const environmentAssumed = read(source, 'APP_ENV') !== environment;
  const findings: EnvironmentFinding[] = [];
  const refuse = (code: string, message: string) => findings.push({ code, severity: 'refuse', message });
  const warn = (code: string, message: string) => findings.push({ code, severity: 'warn', message });

  const directBooking = isOn(source, 'DIRECT_BOOKING_ENABLED');
  const paypalMode = read(source, 'PAYPAL_MODE');
  const paypalModeValid = paypalMode === 'sandbox' || paypalMode === 'live';
  const beds24Live = read(source, 'BEDS24_MODE') === 'live';
  const previewDemoSwitch = isOn(source, 'ADMIN_PREVIEW_DEMO');
  const fixtureSwitch = isOn(source, 'ADMIN_DEV_FIXTURES');
  const supabase = Boolean(read(source, 'SUPABASE_URL') ?? read(source, 'NEXT_PUBLIC_SUPABASE_URL')) && Boolean(read(source, 'SUPABASE_SERVICE_ROLE_KEY'));

  if (environmentAssumed) {
    warn('APP_ENV_ASSUMED', 'APP_ENV is not one of local|preview|staging|production; the deployment is treated as production.');
  }

  /* ── Demo and fixture switches never belong on a production-like deployment ── */
  if (previewDemoSwitch && environment !== 'preview') {
    refuse('DEMO_SWITCH_OUTSIDE_PREVIEW', 'ADMIN_PREVIEW_DEMO=true is set on a deployment that is not APP_ENV=preview. The switch is inert there, but its presence means the environments are confused; remove it.');
  }
  if (fixtureSwitch && isProductionLike(environment)) {
    refuse('FIXTURE_SWITCH_ON_PRODUCTION', 'ADMIN_DEV_FIXTURES=true is set on a production-like deployment. Dead in a production build, but the environments are confused; remove it.');
  }
  if ((previewDemoSwitch || fixtureSwitch) && supabase && environment === 'preview') {
    warn('DEMO_WITH_DATABASE', 'The preview demo is on and Supabase is configured on the same deployment. The demo outranks the database (nothing is exposed), but a preview should not carry a service-role key at all.');
  }

  /* ── Payment mode by environment ─────────────────────────────────────── */
  if (paypalMode !== undefined && !paypalModeValid) {
    warn('PAYPAL_MODE_INVALID', 'PAYPAL_MODE is set but is not exactly sandbox or live. Payments fail closed.');
  }
  if (paypalMode === 'live' && !isProductionLike(environment)) {
    refuse('LIVE_PAYPAL_OUTSIDE_PRODUCTION', `PAYPAL_MODE=live on APP_ENV=${environment}. Real money must not move from a ${environment} deployment.`);
  }
  if (paypalMode === 'live' && environment === 'staging') {
    refuse('LIVE_PAYPAL_ON_STAGING', 'PAYPAL_MODE=live on staging. Staging rehearses with the sandbox; live credentials belong to production only.');
  }
  if (environment === 'production' && paypalMode === 'sandbox') {
    (directBooking ? refuse : warn)(
      'SANDBOX_PAYPAL_ON_PRODUCTION',
      directBooking
        ? 'DIRECT_BOOKING_ENABLED=true with PAYPAL_MODE=sandbox on production: guests would be told they paid with play money while real inventory is held. Refused.'
        : 'PAYPAL_MODE=sandbox on production. Harmless while direct booking is off; must be live before it is switched on.'
    );
  }

  /* ── Simulators, mocks and overrides never reach a production-like deployment ── */
  const beds24Override = read(source, 'BEDS24_API_BASE_URL');
  if (beds24Override && beds24Override !== 'https://beds24.com/api/v2' && environment !== 'local') {
    refuse('PROVIDER_OVERRIDE_OUTSIDE_LOCAL', `BEDS24_API_BASE_URL points somewhere other than Beds24 on APP_ENV=${environment}. Provider URLs may only be overridden on a local deployment (simulators); the override is ignored here and the configuration is refused.`);
  }
  if (read(source, 'PAYPAL_SIMULATOR_URL') && environment !== 'local') {
    refuse('PROVIDER_OVERRIDE_OUTSIDE_LOCAL', `PAYPAL_SIMULATOR_URL is set on APP_ENV=${environment}. The payment simulator exists for local runs only; the value is ignored here and the configuration is refused.`);
  }
  if (!beds24Live && environment === 'production') {
    // Refused outright when the gate is on (DIRECT_BOOKING_WITHOUT_LIVE_BEDS24
    // below); with the gate off no fixture can reach a guest booking, but the
    // condition is still named so it is never silently in place.
    warn('MOCK_BEDS24_ON_PRODUCTION', 'BEDS24_MODE is not live on production. Fixture availability is served to the calendar; direct booking is refused until BEDS24_MODE=live.');
  }
  if (isOn(source, 'PAYMENT_REFUND_EXECUTION_ENABLED')) {
    (environment === 'production' ? refuse : warn)(
      'REFUND_EXECUTION_UNVALIDATED',
      environment === 'production'
        ? 'PAYMENT_REFUND_EXECUTION_ENABLED=true on production. The provider refund contract has not been proven in the sandbox; refused until docs/payment-paypal.md §8 records the refund cases as proven and this rule is relaxed.'
        : 'PAYMENT_REFUND_EXECUTION_ENABLED=true. The refund saga may call the provider on this deployment; the provider refund contract is unvalidated.'
    );
  }
  if (isOn(source, 'OPERATOR_PAID_CANCELLATION_ENABLED')) {
    warn('PAID_CANCELLATION_ENABLED', 'OPERATOR_PAID_CANCELLATION_ENABLED=true. Administrators may authorise the cancellation of paid bookings; the Beds24 cancellation of a confirmed reservation is unvalidated on the live account.');
  }
  if (isOn(source, 'BOOKING_TEST_TERMS') && environment !== 'local' && environment !== 'staging') {
    refuse('TEST_TERMS_OUTSIDE_STAGING', `BOOKING_TEST_TERMS=true on APP_ENV=${environment}. The sandbox checkout terms say they are not a valid policy; a guest must never be shown them. Refused.`);
  }
  if (isOn(source, 'MESSAGING_TEST_COMPLETIONS_ALLOWED') && environment === 'production') {
    refuse('TEST_MESSAGING_ON_PRODUCTION', 'MESSAGING_TEST_COMPLETIONS_ALLOWED=true on production. A delivery reported "sent" by a test transport would be a confirmation a guest never received.');
  }

  /* ── Beds24 mode by environment ──────────────────────────────────────── */
  if (beds24Live && environment === 'preview') {
    warn('LIVE_BEDS24_ON_PREVIEW', 'BEDS24_MODE=live on a preview. Reads are harmless; no write is reachable while direct booking is off, which it must stay on a preview.');
  }

  /* ── The launch gate's prerequisites ─────────────────────────────────── */
  if (directBooking) {
    if (environment === 'preview') {
      refuse('DIRECT_BOOKING_ON_PREVIEW', 'DIRECT_BOOKING_ENABLED=true on a preview deployment. A preview never creates reservations or payments.');
    }
    if (!paypalModeValid) {
      refuse('DIRECT_BOOKING_WITHOUT_PAYPAL_MODE', 'DIRECT_BOOKING_ENABLED=true but PAYPAL_MODE is not sandbox or live. No payment could be taken; the gate is refused rather than left half-open.');
    }
    if (!read(source, 'PAYPAL_CLIENT_ID') || !read(source, 'PAYPAL_CLIENT_SECRET')) {
      refuse('DIRECT_BOOKING_WITHOUT_PAYPAL_CREDENTIALS', 'DIRECT_BOOKING_ENABLED=true but PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing.');
    }
    if (!read(source, 'PAYPAL_WEBHOOK_ID')) {
      refuse('DIRECT_BOOKING_WITHOUT_WEBHOOK', 'DIRECT_BOOKING_ENABLED=true but PAYPAL_WEBHOOK_ID is missing. A payment whose webhook cannot be verified is a payment that may never be applied.');
    }
    if (!beds24Live) {
      refuse('DIRECT_BOOKING_WITHOUT_LIVE_BEDS24', 'DIRECT_BOOKING_ENABLED=true but BEDS24_MODE is not live. A mock hold protects nothing on Booking.com or Airbnb.');
    }
    if (beds24Live && !read(source, 'BEDS24_REFRESH_TOKEN')) {
      refuse('DIRECT_BOOKING_WITHOUT_BEDS24_TOKEN', 'DIRECT_BOOKING_ENABLED=true and BEDS24_MODE=live but BEDS24_REFRESH_TOKEN is missing.');
    }
    if (!supabase) {
      refuse('DIRECT_BOOKING_WITHOUT_DATABASE', 'DIRECT_BOOKING_ENABLED=true but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. There is nowhere to record a booking.');
    }
    if (!read(source, 'BOOKING_SYNC_SECRET')) {
      refuse('DIRECT_BOOKING_WITHOUT_SCHEDULER_SECRET', 'DIRECT_BOOKING_ENABLED=true but BOOKING_SYNC_SECRET is missing. Reconciliation could not be triggered, so a paid-but-unfinalized booking would never recover.');
    }
    if (environment === 'production' && !read(source, 'BEDS24_WEBHOOK_SECRET')) {
      warn('DIRECT_BOOKING_WITHOUT_BEDS24_WEBHOOK', 'BEDS24_WEBHOOK_SECRET is missing on production. Channel reservations reach the cache only through the periodic sync.');
    }
  }

  /* ── Production posture, whatever the gate says ──────────────────────── */
  if (environment === 'production') {
    if (!read(source, 'ADMIN_SESSION_SECRET')) warn('ADMIN_UNCONFIGURED', 'ADMIN_SESSION_SECRET is missing. BoLaGio Control refuses every sign-in.');
    if (!read(source, 'N8N_INTERNAL_SECRET')) warn('N8N_UNCONFIGURED', 'N8N_INTERNAL_SECRET is missing. The outbox cannot be claimed; events accumulate.');
    if (!read(source, 'BOOKING_SYNC_SECRET')) warn('SCHEDULER_UNCONFIGURED', 'BOOKING_SYNC_SECRET is missing. Neither the inventory sync nor reconciliation can be triggered.');
    if (paypalMode === undefined) warn('PAYPAL_MODE_UNSET', 'PAYPAL_MODE is unset. Payments fail closed.');
  }

  const directBookingPermitted = directBooking && !findings.some((f) => f.severity === 'refuse');
  return { environment, environmentAssumed, findings, directBookingPermitted };
}

/** The contradictions only — what stops the launch gate. */
export function refusals(report: EnvironmentReport): EnvironmentFinding[] {
  return report.findings.filter((f) => f.severity === 'refuse');
}
