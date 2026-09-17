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
 * refuses to execute without `BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE`.
 *
 * ── What it deliberately does NOT touch ──────────────────────────────────
 * Stripe, PayPal, n8n, payments, invoices, Supabase, booking intents, the
 * guest-facing flow, and any reservation it did not itself create.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beds24LiveProvider } from '@/lib/integrations/beds24/live';
import type { InventoryDay } from '@/lib/booking/types';
import type { ProviderUnitRef } from '@/lib/integrations/provider';
import { addDays } from '@/lib/booking/stay-rules';

/* ── The guard ──────────────────────────────────────────────────────────── */

const CONFIRMED = process.env.BEDS24_WRITE_TEST_CONFIRM === 'HOLD-AND-RELEASE';

describe('write-test guard', () => {
  it('refuses to write to Beds24 without explicit confirmation', () => {
    // A red test and zero writes is the correct outcome of an accidental run.
    expect(
      CONFIRMED,
      'Set BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE to allow this test to write to Beds24.'
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

async function readNight(date: string): Promise<InventoryDay | undefined> {
  const days = await beds24LiveProvider.fetchAvailability({
    unit: UNIT,
    from: date,
    to: addDays(date, 1),
  });
  return dayIn(days, date);
}

describe.runIf(CONFIRMED)('Beds24 hold and release, against the live account', () => {
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

  it('holds the night, confirms it is blocked, releases it, and confirms it is free again', async () => {
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

    const priceCents = baseline?.displayPriceCents ?? before!.displayPriceCents ?? 0;

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
    } finally {
      // ── Phase 4: release, always ─────────────────────────────────────
      // In `finally` so a failed assertion in phase 3 still gives the night
      // back. Leaving a night closed on Booking.com and Airbnb because a test
      // threw would be a real cost to the business.
      if (createdBookingId) {
        console.log(`\n  Releasing hold ${createdBookingId}…`);
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

    console.log(`\n  ✓ Hold blocked the night and the release gave it back. Inventory restored.`);
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
