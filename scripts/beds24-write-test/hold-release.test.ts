/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE FIRST WRITE TO BEDS24.
 *
 * One night, on Schulstraße I, ninety-odd days out, held for a few seconds
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
 * Schulstraße I. Confirmed against the live account on 2026-09-17 by
 * enumerating it, not by assumption.
 *
 * Schulstraße II is deliberately NOT exercised. One unit is enough to answer
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

  it('holds the night with Offer 2 and the bedroom marker, confirms it, verifies both block, then cancels it and verifies it is free', async () => {
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
    console.log(`  Live quote: Offer 2, ${quote.totalCents / 100} ${quote.currency}`);
    const priceCents = quote.totalCents;

    // Item 9's baseline: both apartments, a week around the night.
    inventoryBefore = await inventorySnapshot();

    try {
      // ── Phase 2: create the hold ─────────────────────────────────────
      console.log(`\n  Creating hold on ${checkIn}…`);
      const booking = await beds24LiveProvider.createHold({
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
        // Deterministic: the same date always produces the same key, so if
        // Beds24 honours the idempotency header a retry is a no-op rather
        // than a second booking.
        idempotencyKey: `bolagio-write-test:${UNIT_SLUG}:${checkIn}`,
        holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });

      createdBookingId = booking.externalBookingId;
      // Printed immediately, before any assertion can throw. If everything
      // after this dies, this line is the manual cleanup instruction.
      console.log(`  ✓ Hold created. Beds24 booking id: ${createdBookingId}`);
      console.log(`    If this run dies from here on, cancel that booking in Beds24.`);

      expect(createdBookingId, 'Beds24 returned no booking id').toBeTruthy();

      // ── Phase 3: did it actually block the night? ────────────────────
      // The whole point. A hold that does not close the night means the
      // overbooking protection does nothing, whatever the code says.
      const during = await readNight(checkIn);
      console.log(`  After hold: available=${during?.available} canCheckIn=${during?.canCheckIn}`);
      expect(
        during?.available,
        `The hold did NOT block ${checkIn}. The booking status used for holds does not ` +
          'close inventory for this property — see BOOKING RULES → BOOKING STATUS in Beds24. ' +
          'The hold is still being released by this test.'
      ).toBe(false);

      // ── Phase 3b: did Beds24 STORE the offer and the bedroom marker? ──
      // Read back with infoItems (the adapter's own read leaves them out).
      // Soft assertions: every finding is reported, and the booking is
      // still promoted and released whatever this phase finds.
      const stored = await beds24Request<Beds24BookingsResponse>({
        path: '/bookings',
        query: { id: createdBookingId!, includeInfoItems: 'true', includeInvoiceItems: 'false' },
      });
      const record = stored.data?.[0];
      const marker = (record?.infoItems ?? []).find((i) => i.code === BEDROOM_INFO_CODE);
      console.log(`  Read back: offerId=${record?.offerId} status=${record?.status} price=${record?.price}`);
      console.log(`  Read back: infoItems ${BEDROOM_INFO_CODE}=${JSON.stringify(marker?.text ?? null)}`);
      console.log(`  Read back: notes contain marker=${String(record?.notes ?? '').includes('Bedroom setup: 2 Schlafzimmer')}`);
      expect.soft(Number(record?.offerId), 'offerId did not persist on the Beds24 booking').toBe(2);
      expect.soft(marker?.text, 'the bedroom-setup infoItem did not persist').toBe('Bedroom setup: 2 Schlafzimmer');
      expect.soft(String(record?.notes ?? ''), 'the notes marker did not persist').toContain('Bedroom setup: 2 Schlafzimmer');
      expect.soft(Math.round(Number(record?.price) * 100), 'the verified total did not persist').toBe(priceCents);

      // ── Phase 3c: promote to the CONFIRMED status, exactly as the
      // finalizer does after payment — does that status block too? ──
      console.log(`\n  Promoting ${createdBookingId} to the confirmed status…`);
      // Run 38301108120: Beds24 refused this promotion as the adapter sends
      // it. The exact write is repeated raw first and Beds24's answer printed
      // — success flag, errors/warnings/info and the KEYS of the returned
      // booking, never values — so the cause is visible, not inferred.
      const raw = await beds24Request<unknown>({
        path: '/bookings',
        method: 'POST',
        idempotencyKey: `confirm:${createdBookingId}`,
        body: [{ id: Number(createdBookingId), status: 'confirmed' }],
      });
      const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
      const shape = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object).sort() : v);
      console.log(`  Raw confirm answer: success=${String(first?.success)} keys=${JSON.stringify(shape(first))}`);
      console.log(`    new=${JSON.stringify(shape(first?.new))} modified=${JSON.stringify(shape(first?.modified))}`);
      for (const k of ['errors', 'warnings', 'info']) {
        if (first?.[k]) console.log(`    ${k}: ${JSON.stringify(first[k]).slice(0, 600)}`);
      }
      const confirmedBooking = await beds24LiveProvider.confirmBooking(createdBookingId!);
      const readConfirmed = await beds24LiveProvider.getBooking(createdBookingId!);
      console.log(`  After confirm: status=${readConfirmed?.status ?? confirmedBooking.status} offerId=${readConfirmed?.offerId}`);
      expect.soft(readConfirmed?.status, 'the booking did not land in the confirmed status').toBe('confirmed');
      const whileConfirmed = await readNight(checkIn);
      console.log(`  While confirmed: available=${whileConfirmed?.available} canCheckIn=${whileConfirmed?.canCheckIn}`);
      expect(
        whileConfirmed?.available,
        `A CONFIRMED booking did NOT block ${checkIn}. Paid bookings would not protect ` +
          'inventory — check BOOKING RULES → BOOKING STATUS in Beds24. The booking is still being cancelled.'
      ).toBe(false);
    } finally {
      // ── Phase 4: release, always ─────────────────────────────────────
      // In `finally` so a failed assertion in phase 3 still gives the night
      // back. Leaving a night closed on Booking.com and Airbnb because a test
      // threw would be a real cost to the business.
      if (createdBookingId) {
        console.log(`\n  Cancelling test booking ${createdBookingId}…`);
        await beds24LiveProvider.releaseHold(createdBookingId, 'write_test_cleanup');
        console.log('  ✓ Release call completed.');
      }
    }

    // ── Phase 5: is the night genuinely back? ──────────────────────────
    // Reached only if phase 3 passed. If the release silently failed, this
    // is what catches it — and it fails loudly, because a night left closed
    // is inventory nobody can sell.
    const after = await readNight(checkIn);
    console.log(`  After release: available=${after?.available} canCheckIn=${after?.canCheckIn}`);
    expect(
      after?.available,
      `${checkIn} is STILL BLOCKED after the release. Cancel Beds24 booking ` +
        `${createdBookingId} by hand immediately.`
    ).toBe(true);
    expect(after?.canCheckIn).toBe(baseline?.canCheckIn);

    // Nothing else moved: both apartments, the week around the night,
    // exactly as before the write.
    const inventoryAfter = await inventorySnapshot();
    console.log(`  Inventory around the night, both apartments, unchanged: ${inventoryAfter === inventoryBefore}`);
    expect(inventoryAfter, 'inventory around the test night differs from before the write').toBe(inventoryBefore);

    const final = await beds24LiveProvider.getBooking(createdBookingId!);
    console.log(`  Final booking status: ${final?.status}`);
    expect(final?.status, 'the test booking is not cancelled').toBe('cancelled');

    console.log(`\n  ✓ Hold and confirmed status both blocked the night; the cancellation gave it back.`);
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
