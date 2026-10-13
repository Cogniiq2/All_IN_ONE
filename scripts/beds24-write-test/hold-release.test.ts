/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FIRST WRITE TO BEDS24.
 *
 * One night, on Apartment I, sixty-odd days out, held for a few seconds
 * and then released. It answers one question that nothing read-only can:
 *
 *     does creating a booking through our adapter actually close the night,
 *     and does cancelling it actually open the night again?
 *
 * Everything else about the booking flow is downstream of that answer. If a
 * hold does not block, the overbooking protection is decorative.
 *
 * ── This is not a mock, and it is not a rehearsal ────────────────────────
 * It calls `beds24LiveProvider` — the same `createHold` and `releaseHold`
 * that a real guest booking calls, with the same payload builder and the same
 * response parsing. Testing a hand-written approximation would prove nothing
 * about production, which is exactly the mistake that put a non-existent
 * endpoint into this integration in the first place.
 *
 * ── Why it is safe ───────────────────────────────────────────────────────
 *   • one night, chosen at run time from live availability, ≥ 60 days out;
 *   • it ABORTS unless that night is free immediately before the write, so a
 *     leftover hold from a previous run stops the test instead of stacking
 *     a second one on top;
 *   • the release is in a `finally`, so an assertion failure between the
 *     hold and the release cannot leave the night blocked;
 *   • the Beds24 booking id is printed the instant it exists, so a total
 *     process failure still leaves a one-line manual cleanup;
 *   • it touches nothing that already exists. The only booking it can affect
 *     is the one it created, addressed by the id Beds24 handed back.
 *
 * ── Why it cannot run by accident ────────────────────────────────────────
 * It lives outside `tests/`, under a config `npm test` does not use, and it
 * refuses to execute without `BEDS24_WRITE_TEST_CONFIRM=HOLD-CONFIRM-RELEASE`.
 *
 * ── What it deliberately does NOT touch ──────────────────────────────────
 * Stripe, PayPal, n8n, payments, invoices, Supabase, booking intents, the
 * guest-facing flow, and any reservation it did not itself create.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BEDROOM_INFO_CODE, beds24LiveProvider } from '@/lib/integrations/beds24/live';
import { beds24Request } from '@/lib/integrations/beds24/client';
import type { Beds24BookingsResponse } from '@/lib/integrations/beds24/types';
import type { InventoryDay } from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';
import { addDays } from '@/lib/booking/stay-rules';
import { beds24ConfirmedStatus } from '@/lib/booking/config';

/* ── The guard ──────────────────────────────────────────────────────────── */

const CONFIRMED = process.env.BEDS24_WRITE_TEST_CONFIRM === 'HOLD-CONFIRM-RELEASE';

describe('write-test guard', () => {
  it('refuses to write to Beds24 without explicit confirmation', () => {
    // A red test and zero writes is the correct outcome of an accidental run.
    expect(
      CONFIRMED,
      'Set BEDS24_WRITE_TEST_CONFIRM=HOLD-CONFIRM-RELEASE to allow this test to write to Beds24.'
    ).toBe(true);
  });
});

/* ── Subject ────────────────────────────────────────────────────────────── */

/**
 * Apartment I — the penthouse with the Dachterrasse (Beds24 354659 /
 * 731147). Confirmed against the live account by enumerating it, not by
 * assumption, and its physical identity confirmed by the owners 2026-10-13.
 *
 * Apartment II is deliberately NOT written to. One unit is enough to answer
 * the question, and a second doubles the blast radius for no extra
 * information.
 */
const UNIT: ProviderUnitRef = {
  provider: 'beds24',
  externalPropertyId: '354659',
  externalRoomId: '731147',
};
const UNIT_SLUG = 'schulstrasse-i';

/** Far enough out that a real guest is unlikely to be mid-booking on it. */
const MIN_LEAD_DAYS = 60;
const SEARCH_DAYS = 120;

/**
 * A fixed, unmistakable reference.
 *
 * Deliberately not a random `BLG-XXXXXX`: this marks a test booking, and
 * anyone looking at Beds24 should be able to tell that at a glance without
 * cross-referencing anything.
 */
const TEST_REFERENCE = 'BLG-TEST99';

/**
 * Guest details that cannot reach a human.
 *
 * `.invalid` is reserved by RFC 2606 and is guaranteed never to resolve, so
 * if this property has an Auto Action configured to email guests on booking
 * creation, the message fails to deliver rather than reaching a real inbox.
 * That is a backstop, not a substitute for checking the setting first — see
 * the prerequisites in docs/beds24-write-test-plan.md.
 */
const TEST_GUEST = {
  firstName: 'BoLaGio',
  lastName: 'Integrationstest',
  email: 'api-test@bolagio.invalid',
  phone: '+490000000000',
  country: 'DE',
  locale: 'de' as const,
};

/* ── State shared across the phases ─────────────────────────────────────── */

let checkIn: string;
let checkOut: string;
let baseline: InventoryDay | undefined;
let createdBookingId: string | undefined;

const dayIn = (days: InventoryDay[], date: string) => days.find((d) => d.date === date);

/** Apartment II — never written; only read, to prove nothing else moved. */
const OTHER_UNIT: ProviderUnitRef = { provider: 'beds24', externalPropertyId: '354658', externalRoomId: '731146' };

/**
 * Availability of both apartments for a week around the target night, as a
 * comparable string. Taken before the write and after the cleanup: the only
 * acceptable difference is none at all.
 */
async function inventorySnapshot(): Promise<string> {
  const from = addDays(checkIn, -3);
  const to = addDays(checkOut, 3);
  const parts: string[] = [];
  for (const unit of [UNIT, OTHER_UNIT]) {
    const days = await beds24LiveProvider.fetchAvailability({ unit, from, to });
    parts.push(days.map((d) => `${unit.externalRoomId}:${d.date}:${d.available}:${d.canCheckIn}:${d.canCheckOut}`).join(','));
  }
  return parts.join('|');
}

let inventoryBefore: string;

/** Distinguishes this run's hold idempotency key from every earlier run's. */
const RUN_ID = process.env.GITHUB_RUN_ID ?? String(Date.now());

/**
 * Bookings of both apartments arriving in the month before the night up to
 * just after it, as a comparable string — the test booking excluded. Taken
 * before the write and after the cleanup: no other booking may differ.
 */
async function bookingsSnapshot(): Promise<string> {
  const rows: string[] = [];
  for (const unit of [UNIT, OTHER_UNIT]) {
    const found = await beds24LiveProvider.findBookings({
      unit,
      arrivalFrom: addDays(checkIn, -30),
      arrivalTo: addDays(checkOut, 3),
    });
    for (const b of found) {
      if (b.externalBookingId === createdBookingId) continue;
      rows.push(`${unit.externalRoomId}:${b.externalBookingId}:${b.status}:${b.checkIn}:${b.checkOut}`);
    }
  }
  return rows.sort().join(',');
}

/** The booking as Beds24 stores it, with infoItems (the adapter's read leaves them out). */
async function readBack(id: string) {
  const response = await beds24Request<Beds24BookingsResponse>({
    path: '/bookings',
    query: { id, includeInfoItems: 'true', includeInvoiceItems: 'false' },
  });
  return response.data?.[0];
}

interface Exchange {
  httpStatus: number;
  body: unknown;
}

/**
 * Run an adapter call and record every POST /bookings exchange underneath it
 * — the HTTP status and the parsed response body, whatever the adapter then
 * makes of them (the client keeps only the status of a non-2xx answer). The
 * request is not touched and its headers, which carry the token, are never
 * recorded.
 */
async function recordBookingWrites<T>(call: () => Promise<T>): Promise<{ result?: T; error?: unknown; exchanges: Exchange[] }> {
  const exchanges: Exchange[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await realFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? 'GET') === 'POST' && new URL(url).pathname.endsWith('/bookings')) {
      const text = await response.clone().text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep the text */ }
      exchanges.push({ httpStatus: response.status, body });
    }
    return response;
  }) as typeof fetch;
  try {
    return { result: await call(), exchanges };
  } catch (error) {
    return { error, exchanges };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/**
 * Beds24's answer, safely: HTTP status, success flag, top-level keys,
 * errors / warnings / info in full (truncated), and only the KEYS of a
 * returned booking plus its id and status — never guest values.
 */
function printExchanges(label: string, exchanges: Exchange[]) {
  if (exchanges.length === 0) console.log(`  [6] ${label}: no POST /bookings exchange was made`);
  const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object).sort() : v === undefined ? undefined : typeof v);
  exchanges.forEach((x, i) => {
    const items = Array.isArray(x.body) ? x.body : [x.body];
    console.log(`  [6] ${label}#${i + 1}: HTTP ${x.httpStatus}, body is ${Array.isArray(x.body) ? `an array of ${items.length}` : typeof x.body}`);
    items.forEach((item: unknown, j: number) => {
      if (!item || typeof item !== 'object') {
        console.log(`      item ${j}: ${JSON.stringify(item).slice(0, 400)}`);
        return;
      }
      const it = item as Record<string, unknown>;
      console.log(`      item ${j}: success=${String(it.success)} keys=${JSON.stringify(keys(it))}`);
      for (const k of ['new', 'modified']) {
        const b = it[k] as Record<string, unknown> | undefined;
        if (b !== undefined) console.log(`      ${k}: keys=${JSON.stringify(keys(b))} id=${String(b?.id)} status=${String(b?.status)}`);
      }
      for (const k of ['errors', 'warnings', 'info', 'error', 'message']) {
        if (it[k] !== undefined) console.log(`      ${k}: ${JSON.stringify(it[k]).slice(0, 800)}`);
      }
    });
  });
}

function errorText(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}${'code' in cause ? `(${String((cause as { code: unknown }).code)})` : ''}: ${cause.message}`;
  return String(cause);
}

async function readNight(date: string): Promise<InventoryDay | undefined> {
  const days = await beds24LiveProvider.fetchAvailability({
    unit: UNIT,
    from: date,
    to: addDays(date, 1),
  });
  return dayIn(days, date);
}

describe.runIf(CONFIRMED)('Beds24 hold, confirm and release, against the live account', () => {
  beforeAll(async () => {
    const from = addDays(new Date().toISOString().slice(0, 10), MIN_LEAD_DAYS);
    const to = addDays(from, SEARCH_DAYS);

    console.log(`\n  Searching ${from} → ${to} for a free night on ${UNIT_SLUG}…`);
    const days = await beds24LiveProvider.fetchAvailability({ unit: UNIT, from, to });

    const free = days.find((d) => d.available && d.canCheckIn);
    if (!free) {
      throw new Error(
        `No free night found on ${UNIT_SLUG} between ${from} and ${to}. ` +
          'Nothing was written. Widen the window or pick a date by hand.'
      );
    }

    checkIn = free.date;
    checkOut = addDays(checkIn, 1);
    baseline = free;

    console.log(`  Target night: ${checkIn} → ${checkOut} (one night)`);
    console.log(
      `  Baseline: available=${free.available} canCheckIn=${free.canCheckIn} ` +
        `priceCents=${free.displayPriceCents ?? '(none)'}`
    );
  });

  it('quote → new → confirmed → cancelled on Apartment I / Offer 2, recording Beds24\'s raw answer to the confirm', async () => {
    // ── Phase 1: the night must be free RIGHT NOW ──────────────────────
    // Re-read immediately before writing rather than trusting the search
    // above. This is also what makes a repeat run safe: a hold left behind
    // by a previous run makes the night unavailable, and the test stops here
    // instead of stacking a second hold on top of it.
    const before = await readNight(checkIn);
    expect(before, `no calendar data for ${checkIn}`).toBeDefined();
    expect(
      before!.available,
      `${checkIn} is not free any more — aborting before writing anything. ` +
        'If a previous run left a hold behind, cancel it in Beds24 first.'
    ).toBe(true);

    // ── Phase 1b: price it the way the website does — the LIVE offer for
    // "2 Schlafzimmer" (Offer 2), through the real adapter and mapping. ──
    const quote = await beds24LiveProvider.fetchOffer({
      unit: UNIT,
      unitSlug: UNIT_SLUG,
      checkIn,
      checkOut,
      adults: 1,
      children: 0,
      bedroomPackage: 'two_bedroom',
    });
    expect(quote.bedroomPricing).toEqual({ status: 'configured', offerId: 2 });
    console.log(`  [1] Live quote: Offer 2, ${quote.totalCents / 100} ${quote.currency}`);
    const priceCents = quote.totalCents;

    // Baselines for "nothing else moved": inventory and bookings of BOTH
    // apartments around the night.
    inventoryBefore = await inventorySnapshot();
    const bookingsBefore = await bookingsSnapshot();

    // Every failure from here on is RECORDED, not thrown, so that the
    // cancellation and the post-cleanup checks always run; they are all
    // asserted together at the very end.
    const findings: string[] = [];
    const fail = (message: string) => {
      findings.push(message);
      console.log(`  ✗ ${message}`);
    };

    try {
      // ── Phase 2: create the hold (status `new`) ──────────────────────
      console.log(`\n  [2] Creating hold on ${checkIn}…`);
      const created = await recordBookingWrites(() =>
        beds24LiveProvider.createHold({
          unit: UNIT,
          unitSlug: UNIT_SLUG,
          reference: TEST_REFERENCE,
          checkIn,
          checkOut,
          adults: 1,
          children: 0,
          bedroomPackage: 'two_bedroom',
          // Offer 2 = "2 Schlafzimmer" (verified 2026-10-12).
          providerOfferId: 2,
          guest: TEST_GUEST,
          totalCents: priceCents,
          currency: 'EUR',
          // Unique per run: an earlier run may have used this very night
          // (and then cancelled it), and a replayed idempotency key must not
          // be able to hand back that old booking instead of a new one.
          idempotencyKey: `bolagio-write-test:${UNIT_SLUG}:${checkIn}:${RUN_ID}`,
          holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
      );
      printExchanges('create', created.exchanges);
      if (created.error || !created.result) throw created.error ?? new Error('createHold returned nothing');

      createdBookingId = created.result.externalBookingId;
      // Printed immediately. If everything after this dies, this line is the
      // manual cleanup instruction.
      console.log(`  ✓ Hold created. Beds24 booking id: ${createdBookingId}`);
      console.log(`    If this run dies from here on, cancel that booking in Beds24.`);

      // ── Phase 3: read back — did Beds24 STORE what we sent? ──────────
      const stored = await readBack(createdBookingId);
      const marker = (stored?.infoItems ?? []).find((i) => i.code === BEDROOM_INFO_CODE);
      console.log(`  [3] Read back: status=${stored?.status} offerId=${stored?.offerId} price=${stored?.price}`);
      console.log(`  [3] Read back: infoItems ${BEDROOM_INFO_CODE}=${JSON.stringify(marker?.text ?? null)}`);
      console.log(`  [3] Read back: notes contain marker=${String(stored?.notes ?? '').includes('Bedroom setup: 2 Schlafzimmer')}`);
      if (stored?.status !== 'new') fail(`hold read back as status ${String(stored?.status)}, expected new`);
      if (Number(stored?.offerId) !== 2) fail(`offerId did not persist (read ${String(stored?.offerId)})`);
      if (marker?.text !== 'Bedroom setup: 2 Schlafzimmer') fail('the BOLAGIO_BEDROOMS infoItem did not persist');
      if (Math.round(Number(stored?.price) * 100) !== priceCents) fail(`price did not persist (read ${String(stored?.price)})`);

      // ── Phase 4: does `new` block the night? ─────────────────────────
      const during = await readNight(checkIn);
      console.log(`  [4] While new: available=${during?.available} canCheckIn=${during?.canCheckIn}`);
      if (during?.available !== false) fail(`status new did NOT block ${checkIn}`);

      // ── Phase 5–10: the confirm, exactly as the finalizer sends it ────
      // `beds24LiveProvider.confirmBooking` IS the production path
      // (lib/booking/finalization.ts). The HTTP exchange underneath it is
      // recorded so Beds24's own answer is visible whatever the adapter
      // makes of it: status code, success flag, errors/warnings/info, and
      // the KEYS of any returned booking.
      const target = beds24ConfirmedStatus();
      console.log(
        `\n  [5] Promoting ${createdBookingId}: new → ${target} ` +
          `(BEDS24_CONFIRMED_STATUS ${process.env.BEDS24_CONFIRMED_STATUS ? 'set' : 'unset — default'})`
      );
      const confirm = await recordBookingWrites(() => beds24LiveProvider.confirmBooking(createdBookingId!));
      printExchanges('confirm', confirm.exchanges);
      console.log(
        `  [10] Adapter: ${confirm.error ? `threw ${errorText(confirm.error)}` : `returned status=${confirm.result?.status} id=${confirm.result?.externalBookingId}`}`
      );

      // Immediately: what does Beds24 now hold?
      const afterConfirm = await readBack(createdBookingId);
      const markerAfter = (afterConfirm?.infoItems ?? []).find((i) => i.code === BEDROOM_INFO_CODE);
      console.log(
        `  [7] Read back after confirm: status=${afterConfirm?.status} offerId=${afterConfirm?.offerId} ` +
          `price=${afterConfirm?.price} marker=${JSON.stringify(markerAfter?.text ?? null)}`
      );

      // ── Classification: rejected, misread, or wrong value ───────────
      const accepted = afterConfirm?.status === target;
      const adapterAccepted = !confirm.error && confirm.result?.status === target;
      const verdict = accepted
        ? adapterAccepted
          ? 'ACCEPTED by Beds24, and the adapter read the answer correctly'
          : 'ACCEPTED by Beds24, but the adapter MISREAD the answer'
        : confirm.error
          ? 'REJECTED by Beds24 (status unchanged), and the adapter reported a rejection'
          : 'NOT APPLIED by Beds24, but the adapter reported SUCCESS';
      console.log(`  [8] Verdict: ${verdict}`);
      if (!accepted) fail(`Beds24 did not apply status ${target} (reads ${String(afterConfirm?.status)})`);
      if (accepted !== adapterAccepted) fail('the adapter\'s interpretation of the confirm answer does not match what Beds24 stored');
      if (accepted && Number(afterConfirm?.offerId) !== 2) fail('offerId changed on confirm');
      if (accepted && Math.round(Number(afterConfirm?.price) * 100) !== priceCents) fail('price changed on confirm');

      // ── Phase 9: does `confirmed` block the night? ───────────────────
      if (accepted) {
        const whileConfirmed = await readNight(checkIn);
        console.log(`  [9] While ${target}: available=${whileConfirmed?.available} canCheckIn=${whileConfirmed?.canCheckIn}`);
        if (whileConfirmed?.available !== false) fail(`status ${target} did NOT block ${checkIn}`);
      } else {
        console.log(`  [9] Not tested — the booking never reached ${target}.`);
      }
    } catch (cause) {
      fail(`aborted: ${errorText(cause)}`);
    } finally {
      // ── Phase 11: cancel, always ─────────────────────────────────────
      // In `finally` so nothing above can leave the night closed on
      // Booking.com and Airbnb.
      if (createdBookingId) {
        console.log(`\n  [11] Cancelling test booking ${createdBookingId}…`);
        try {
          await beds24LiveProvider.releaseHold(createdBookingId, 'write_test_cleanup');
          console.log('  ✓ Release call completed.');
        } catch (cause) {
          fail(`the cancellation call failed: ${errorText(cause)} — CANCEL ${createdBookingId} BY HAND`);
        }
      }
    }

    // ── Phase 12: is everything genuinely back? (always runs) ──────────
    if (createdBookingId) {
      const final = await readBack(createdBookingId);
      console.log(`  [12] Final booking status: ${final?.status}`);
      if (final?.status !== 'cancelled') fail(`test booking reads ${String(final?.status)}, not cancelled — CANCEL ${createdBookingId} BY HAND`);
    }
    const after = await readNight(checkIn);
    console.log(`  [12] After cancel: available=${after?.available} canCheckIn=${after?.canCheckIn}`);
    if (after?.available !== true) fail(`${checkIn} is STILL BLOCKED after the cancellation`);
    if (after?.canCheckIn !== baseline?.canCheckIn) fail('canCheckIn differs from the baseline');

    const inventoryAfter = await inventorySnapshot();
    console.log(`  [12] Inventory around the night, both apartments, unchanged: ${inventoryAfter === inventoryBefore}`);
    if (inventoryAfter !== inventoryBefore) fail('inventory around the test night differs from before the write');

    const bookingsAfter = await bookingsSnapshot();
    console.log(`  [12] Other bookings around the night, both apartments, unchanged: ${bookingsAfter === bookingsBefore}`);
    if (bookingsAfter !== bookingsBefore) fail('another booking around the test night changed during the run');

    console.log(findings.length === 0 ? '\n  ✓ quote → new → confirmed → cancelled proven.' : `\n  ${findings.length} finding(s).`);
    expect(findings).toEqual([]);
  });

  afterAll(() => {
    if (createdBookingId) {
      console.log(
        `\n  Beds24 booking ${createdBookingId} (${TEST_REFERENCE}) was created and cancelled ` +
          `by this run. It will remain in Beds24 history as a cancelled booking.`
      );
    }
  });
});
