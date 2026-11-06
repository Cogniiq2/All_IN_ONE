import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE LIVE TEST PREFLIGHT — go / no-go for the one approved Beds24 test.
 *
 * Read-only. Every check names what it looked at and why it passes or not,
 * and the verdict is GO only when all of them pass. It re-reads Beds24 for
 * the approved dates at the moment it runs, so "recheck availability
 * immediately before starting" is this page, refreshed. It reveals no secret
 * value: configuration checks say present / absent / which mode.
 *
 * What it cannot see is listed as `manual`: Booking.com and Airbnb, the
 * PayPal dashboard, n8n's transport setting. Those are the owners' screens.
 * See docs/staging-live-test.md.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { appEnvironment } from '@/lib/config/environment';
import {
  beds24ConfirmedStatus,
  directBookingPermitted,
  operatorPaidCancellationEnabled,
  paypalConfig,
} from '@/lib/booking/config';
import { testTermsActive } from '@/lib/legal/readiness';
import { isUsableSecret } from '@/lib/admin/session';
import { testerGateApplies } from '@/lib/booking/tester';
import { bookingProvider } from '@/lib/integrations/beds24';
import { findUnitBySlug } from '@/lib/booking/repository';
import { supabaseAdmin } from '@/lib/supabase/server';
import { addDays } from '@/lib/booking/stay-rules';

import { APPROVED_LIVE_TEST } from '@/lib/booking/live-test-stay';

export { APPROVED_LIVE_TEST };

export type CheckState = 'pass' | 'fail' | 'manual';
export interface PreflightCheck {
  id: string;
  group: 'Configuration' | 'Beds24 (live)' | 'Database' | 'Owners';
  label: string;
  state: CheckState;
  detail: string;
}
export interface Preflight {
  checkedAt: string;
  test: typeof APPROVED_LIVE_TEST;
  go: boolean;
  checks: PreflightCheck[];
}

const RECONCILE_MAX_AGE_MS = 10 * 60_000;
/** The pump runs every 60 s; the heartbeat is recorded at most once a minute. */
const N8N_CLAIM_MAX_AGE_MS = 5 * 60_000;

export async function runLivePreflight(now: Date = new Date()): Promise<Preflight> {
  const t = APPROVED_LIVE_TEST;
  const checks: PreflightCheck[] = [];
  const add = (c: PreflightCheck) => checks.push(c);
  const cfg = (id: string, label: string, ok: boolean, detail: string) => add({ id, group: 'Configuration', label, state: ok ? 'pass' : 'fail', detail });

  /* ── Configuration (names and modes only, never values) ─────────────── */
  const env = appEnvironment();
  cfg('env', 'This is staging', env === 'staging', `APP_ENV is ${env}`);
  cfg('beds24', 'Real Beds24 account, tester gate active', testerGateApplies(), testerGateApplies() ? 'live Beds24; only an unlocked browser can book' : 'tester gate does not apply here');
  const paypal = paypalConfig();
  cfg('paypal-mode', 'PayPal is in SANDBOX mode', paypal.mode === 'sandbox', `PAYPAL_MODE is ${paypal.mode ?? 'unset'}`);
  cfg('paypal-keys', 'PayPal sandbox client id and secret present', Boolean(paypal.clientId && paypal.clientSecret), `${paypal.clientId ? 'client id present' : 'PAYPAL_CLIENT_ID missing'}, ${paypal.clientSecret ? 'secret present' : 'PAYPAL_CLIENT_SECRET missing'}`);
  cfg('paypal-webhook', 'PayPal webhook id present', Boolean(paypal.webhookId), paypal.webhookId ? 'PAYPAL_WEBHOOK_ID present' : 'PAYPAL_WEBHOOK_ID missing');
  const gate = directBookingPermitted();
  cfg('gate', 'Launch gate open on staging', gate.permitted, gate.permitted ? 'DIRECT_BOOKING_ENABLED and every prerequisite present' : gate.refusals.length ? `refused: ${gate.refusals.join(', ')}` : 'DIRECT_BOOKING_ENABLED is not true');
  cfg('terms', 'Labelled TEST terms (keeps the test out of the books)', testTermsActive(), testTermsActive() ? 'BOOKING_TEST_TERMS=true' : 'BOOKING_TEST_TERMS is not true — the test would be booked under real terms and counted');
  cfg('tester', 'Tester cookies can be issued', isUsableSecret(process.env.ADMIN_SESSION_SECRET), isUsableSecret(process.env.ADMIN_SESSION_SECRET) ? 'ADMIN_SESSION_SECRET usable' : 'ADMIN_SESSION_SECRET missing or shorter than 32 characters');
  cfg('cancel', 'Paid test booking can be cancelled from Control', operatorPaidCancellationEnabled(), operatorPaidCancellationEnabled() ? 'OPERATOR_PAID_CANCELLATION_ENABLED=true' : 'OPERATOR_PAID_CANCELLATION_ENABLED is not true — the test could not be cleaned up from Control');
  const contact = process.env.MESSAGING_CONTACT_EMAIL?.trim();
  cfg('contact', 'Confirmation e-mail can render', Boolean(contact), contact ? 'MESSAGING_CONTACT_EMAIL present' : 'MESSAGING_CONTACT_EMAIL missing — the confirmation would refuse to render');
  cfg('n8n-secret', 'Staging n8n can authenticate', Boolean(process.env.N8N_INTERNAL_SECRET?.trim()), process.env.N8N_INTERNAL_SECRET?.trim() ? 'N8N_INTERNAL_SECRET present' : 'N8N_INTERNAL_SECRET missing — n8n cannot claim events or prepare the confirmation');
  cfg('confirmed-status', 'Beds24 status written on payment', beds24ConfirmedStatus() === 'confirmed', `BEDS24_CONFIRMED_STATUS is "${beds24ConfirmedStatus()}"`);

  /* ── Beds24, live, for the approved dates ───────────────────────────── */
  const unit = await findUnitBySlug(t.unitSlug).catch(() => null);
  if (!unit?.providerRef) {
    add({ id: 'unit', group: 'Database', label: 'Approved apartment is mapped and bookable', state: 'fail', detail: `${t.unitSlug}: ${unit ? 'no Beds24 mapping' : 'not found'}` });
  } else {
    add({ id: 'unit', group: 'Database', label: 'Approved apartment is mapped and bookable', state: unit.isBookable ? 'pass' : 'fail', detail: `${t.unitSlug} → Beds24 property ${unit.providerRef.externalPropertyId}, room ${unit.providerRef.externalRoomId}; is_bookable ${unit.isBookable}` });
    try {
      const days = await bookingProvider().fetchAvailability({ unit: unit.providerRef, from: t.checkIn, to: addDays(t.checkOut, 1) });
      const nights = days.filter((d) => d.date >= t.checkIn && d.date < t.checkOut);
      const arrival = days.find((d) => d.date === t.checkIn);
      const departure = days.find((d) => d.date === t.checkOut);
      const free = nights.length === 2 && nights.every((d) => d.available) && arrival?.canCheckIn !== false && departure?.canCheckOut !== false;
      add({ id: 'calendar', group: 'Beds24 (live)', label: 'Both nights free in the Beds24 calendar', state: free ? 'pass' : 'fail', detail: nights.map((d) => `${d.date} ${d.available ? 'free' : 'TAKEN'}`).join(' · ') || 'no days returned' });
    } catch (cause) {
      add({ id: 'calendar', group: 'Beds24 (live)', label: 'Both nights free in the Beds24 calendar', state: 'fail', detail: `Beds24 calendar read failed: ${cause instanceof Error ? cause.message.slice(0, 120) : 'unknown'}` });
    }
    try {
      const found = await bookingProvider().findBookings({ unit: unit.providerRef, arrivalFrom: addDays(t.checkIn, -90), arrivalTo: addDays(t.checkOut, -1) });
      const overlapping = found.filter((b) => (b.checkIn ?? '') < t.checkOut && (b.checkOut ?? '') > t.checkIn && !/^(cancelled|canceled|black)$/i.test(b.status ?? ''));
      add({ id: 'bookings', group: 'Beds24 (live)', label: 'No Beds24 booking overlaps the dates', state: overlapping.length === 0 ? 'pass' : 'fail', detail: overlapping.length === 0 ? `${found.length} booking(s) arriving in the 90 days before; none overlaps` : `${overlapping.length} overlapping: ${overlapping.map((b) => `#${b.externalBookingId} ${b.checkIn}–${b.checkOut} ${b.status ?? ''}`).join(', ')}` });
    } catch (cause) {
      add({ id: 'bookings', group: 'Beds24 (live)', label: 'No Beds24 booking overlaps the dates', state: 'fail', detail: `Beds24 booking read failed: ${cause instanceof Error ? cause.message.slice(0, 120) : 'unknown'}` });
    }
  }

  /* ── Database ───────────────────────────────────────────────────────── */
  const db = supabaseAdmin();
  const { data: res, error: resError } = await db.from('bolagio_reservations').select('id, status_class').lt('check_in', t.checkOut).gt('check_out', t.checkIn).limit(20);
  const liveRes = (res ?? []).filter((r: { status_class?: string }) => r.status_class !== 'cancelled');
  add({ id: 'reservations', group: 'Database', label: 'No imported guest reservation on those dates', state: !resError && liveRes.length === 0 ? 'pass' : 'fail', detail: resError ? 'could not read bolagio_reservations' : `${liveRes.length} active reservation(s) overlap (both apartments)` });
  const { data: intents, error: intentError } = await db.from('bolagio_booking_intents').select('reference, status').lt('check_in', t.checkOut).gt('check_out', t.checkIn).limit(20);
  add({ id: 'intents', group: 'Database', label: 'No website booking already holds those dates', state: !intentError && (intents ?? []).length === 0 ? 'pass' : 'fail', detail: intentError ? 'could not read bolagio_booking_intents' : (intents ?? []).length === 0 ? 'none' : (intents ?? []).map((i: { reference: string; status: string }) => `${i.reference} ${i.status}`).join(', ') });
  // The confirmation e-mail is part of the test: the staging pump must be polling.
  const { data: claim } = await db.from('bolagio_integration_health').select('observed_at, detail').eq('provider', 'n8n').eq('signal', 'last_claim').maybeSingle();
  const claimAge = claim?.observed_at ? now.getTime() - Date.parse(claim.observed_at as string) : Number.POSITIVE_INFINITY;
  add({ id: 'n8n-pump', group: 'Database', label: 'Staging n8n pump is polling the outbox (confirmation e-mails)', state: claimAge < N8N_CLAIM_MAX_AGE_MS && String(claim?.detail ?? '').startsWith('n8n-bolagio-staging') ? 'pass' : 'fail', detail: claim?.observed_at ? `last claim ${Math.round(claimAge / 60_000)} min ago by ${String(claim.detail ?? '').split(':')[0] || 'unknown worker'}` : 'n8n has never claimed from staging — import and activate the BoLaGio STAGING workflows' });
  const { data: jobs } = await db.from('bolagio_scheduler_status').select('job, finished_at, ok').eq('job', 'reconcile').maybeSingle();
  const age = jobs?.finished_at ? now.getTime() - Date.parse(jobs.finished_at as string) : Number.POSITIVE_INFINITY;
  add({ id: 'reconcile', group: 'Database', label: 'Reconciliation is running (releases abandoned holds)', state: jobs?.ok && age < RECONCILE_MAX_AGE_MS ? 'pass' : 'fail', detail: jobs?.finished_at ? `last pass ${Math.round(age / 60_000)} min ago, ${jobs.ok ? 'ok' : 'failed'}` : 'no reconciliation pass recorded' });

  /* ── What only the owners can see ───────────────────────────────────── */
  const manual = (id: string, label: string, detail: string) => add({ id, group: 'Owners', label, state: 'manual', detail });
  manual('paypal-dashboard', 'PayPal sandbox webhook points at staging', 'developer.paypal.com → sandbox app → Webhooks: …/api/webhooks/paypal');
  manual('n8n', 'n8n sends real e-mail to the test inbox', 'BOLAGIO_STAGING_MESSAGING_TRANSPORT=smtp with the credential "BoLaGio STAGING SMTP"; the guest e-mail used in the test is a mailbox you own');
  manual('channels', 'Booking.com and Airbnb calendars open for the dates', 'screenshot both before the test');

  const go = checks.every((c) => c.state !== 'fail');
  return { checkedAt: now.toISOString(), test: t, go, checks };
}
