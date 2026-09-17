# The first Beds24 write test — hold and release

**Status: prepared, not run.** Everything below is committed and ready. Nothing
has been written to Beds24.

It answers one question that no read-only check can:

> Does a hold created through our adapter actually close the night, and does
> cancelling it actually give the night back?

Everything else in the booking architecture is downstream of that answer. If a
hold does not block inventory, the overbooking protection is decorative — the
code would run, the tests would pass, and the same night would be sellable on
Booking.com the whole time.

---

## 1. The status: `new`

The hold is created with Beds24 booking status **`new`**, and released with
**`cancelled`**. These are already the constants in
`lib/integrations/beds24/live.ts`:

```ts
const HOLD_STATUS      = 'new';        // blocks the night
const CONFIRMED_STATUS = 'confirmed';  // after payment is proven
const RELEASED_STATUS  = 'cancelled';  // gives the night back
```

The test uses the production constants rather than its own, deliberately. A
test that writes a different status proves something about that status, not
about what a guest booking will do.

### Why not the alternatives

| Status | Why not |
|---|---|
| **`request`** | **Does not block the room.** The Beds24 wiki is explicit: *"'Request' bookings do not block the room."* Using it would create a hold that reserves nothing — the worst possible failure, because it looks identical to a working one. |
| **`inquiry`** | Same problem. A newer status, documented as not blocking the room. |
| **`black`** | *Does* block, and is purpose-built for it — *"bookings without guests… can be used to close a room"*, and excluded from reports. Genuinely tempting for a test. Rejected because production holds carry guest details and must be promotable to `confirmed` on payment, which a guest-less block cannot be. Testing `black` would validate a code path no guest ever takes. |

### The evidence, and its limit

**What the documentation establishes:**

- `POST /bookings` *"will close availability for those dates at all other
  booking sources"* — [Category:API V2](https://wiki.beds24.com/index.php/Category:API_V2)
- `new` is a real booking status — *"bookings which have not been opened to
  view"* — not a provisional one — [Category:Bookings](https://wiki.beds24.com/index.php/Category:Bookings)
- `request` explicitly does **not** block — [Category:Bookings](https://wiki.beds24.com/index.php/Category:Bookings)
- `black` blocks and is excluded from reports — [Close Rooms](https://wiki.beds24.com/index.php/Close_Rooms)

**What it does not establish — and I am not going to pretend otherwise:**

The status applied to new bookings is a **per-property setting**, at
`SETTINGS → PROPERTIES → BOOKING RULES → BOOKING STATUS`. I cannot read that
setting for property `354659`. It is not in any API response captured so far,
and this sandbox has no network route to Beds24 at all.

So I can tell you what *should* happen and why. I cannot tell you what *will*
happen on your property. **Anyone claiming otherwise is guessing.**

This is why the test is built the way it is: **the test is the proof.** It
reads the night, writes the hold, re-reads the night, and asserts the state
actually changed. If `new` does not block for this property, the test says so
in one line — and releases the hold anyway.

That is a better outcome than a document asserting it works.

---

## 2. Prerequisites — check these before running

### ⚠ Auto Actions (the one that can reach a real person)

Beds24 Auto Actions can fire on booking creation, including API-created
bookings, and can email the guest
([Auto Actions](https://wiki.beds24.com/index.php/Auto_Actions)).

**Check `SETTINGS → GUEST MANAGEMENT → AUTO ACTIONS` for property 354659** and
confirm nothing is set to trigger on booking creation — or accept that it will
fire.

The test's backstop: the guest email is `api-test@bolagio.invalid`. `.invalid`
is reserved by RFC 2606 and can never resolve, so a triggered email fails to
deliver rather than reaching an inbox. That is a backstop, not a substitute for
looking.

### Everything else

| Check | Why |
|---|---|
| `BEDS24_REFRESH_TOKEN` is a valid Actions secret | Already proven by the read-only run |
| No channel-manager maintenance window in progress | The hold propagates to Booking.com and Airbnb for the few seconds it exists |
| You can reach the Beds24 UI | So you can watch it happen, and clean up by hand if something goes badly wrong |
| Nobody is mid-booking on Schulstraße I | The window is ≥ 60 days out, so this is close to theoretical |

---

## 3. The exact sequence

Unit: **Schulstraße I** only — Beds24 property `354659`, room `731147`.
Schulstraße II is not touched. One unit answers the question; a second doubles
the blast radius for no extra information.

```
0. GUARD        refuse unless BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE
                → zero network calls if unset

1. OFFLINE      npm test (75 tests)
                → red means stop. Do not write to a live channel manager
                  on the back of a failing suite.

2. SEARCH       GET calendar, today+60 → today+180
                → pick the FIRST night with available && canCheckIn
                → abort if none found. Nothing written.

3. RE-READ      GET that single night again, immediately before writing
                → must still be available, or ABORT
                → this is what makes a repeat run safe: a hold left behind
                  by a previous run makes the night unavailable and stops
                  the test rather than stacking a second one

4. WRITE        POST /bookings  status=new, 1 night, 1 adult
                  reference        BLG-TEST99
                  guest            BoLaGio Integrationstest
                  email            api-test@bolagio.invalid
                  idempotency-key  bolagio-write-test:schulstrasse-i:<date>
                → print the returned Beds24 booking id IMMEDIATELY

5. VERIFY       GET that night again
                → assert available went true → FALSE
                → this is the actual question being asked

6. RELEASE      POST /bookings  id=<created>, status=cancelled
                → in a `finally` block: runs even if step 5 failed

7. VERIFY       GET that night again
                → assert available is back to TRUE
                → assert canCheckIn matches the original baseline
```

One night. Two writes, both to a booking this test created. Duration: seconds.

---

## 4. Idempotency — how a repeat run cannot duplicate

Three layers, and the important one is not the header:

1. **Step 3 aborts unless the night is free.** If a previous run left a hold
   behind, the night is not free and the test stops before writing. Duplicates
   are structurally impossible, not merely unlikely.
2. **The night is released in a `finally`**, so a run leaves zero active holds
   behind even when an assertion fails. There is nothing to accumulate.
3. **A deterministic `idempotency-key`** — `bolagio-write-test:<slug>:<date>` —
   so if Beds24 honours the header, a retry is a no-op at the provider too.

Layer 3 is the one I cannot verify; Beds24's support for the header is
undocumented. Layers 1 and 2 do not depend on it.

---

## 5. What each failure means

| Failure | Meaning | Do this |
|---|---|---|
| Aborts at step 2 | No free night in the window | Widen the window, or pick a date by hand |
| Aborts at step 3 | Night taken between search and write — possibly a leftover hold | Check Beds24 for an open `BLG-TEST99` booking and cancel it |
| **Step 5 fails** | **`new` does not block inventory on this property** | Check `BOOKING RULES → BOOKING STATUS`. The hold is still released. Production holds would need a different status — and the overbooking protection does not work until this is fixed |
| **Step 7 fails** | **Release did not reopen the night** | **Cancel the printed booking id in Beds24 immediately.** A night left closed is inventory nobody can sell |
| Process killed mid-run | A hold may be open | The booking id is printed the moment it exists — cancel it in Beds24 |

---

## 6. How to run it

1. Work through §2. Especially the Auto Actions check.
2. GitHub → **Actions** → **`[TEMP] ⚠ Beds24 WRITE test — hold and release`**
3. **Run workflow**, selecting branch
   `claude/opernstrasse-ii-iii-calendar-cta-dates`
4. In the **confirm** box type exactly: `HOLD-AND-RELEASE`
   Anything else and the job is skipped without starting.
5. Watch it. Open the Beds24 calendar for Schulstraße I alongside — you should
   see the night close and reopen.

Locally, if you ever prefer:

```bash
BEDS24_MODE=live \
BEDS24_REFRESH_TOKEN=... \
BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE \
npm run test:beds24-write
```

---

## 7. What it does not do

Not touched, at all: Stripe · PayPal · n8n · payments · invoices · Supabase ·
booking intents · the guest-facing booking flow · Schulstraße II · any
reservation this test did not itself create.

The only booking it can modify is the one Beds24 just handed it an id for.

It also does not exercise `fetchOffer` (the offers endpoint) or
`confirmBooking`. Those remain unverified. Confirming a booking is a
meaningfully larger step — it produces a real reservation — and belongs in a
separate, later, equally deliberate test.

---

## 8. Why it cannot run by accident

| Layer | Mechanism |
|---|---|
| Trigger | `workflow_dispatch` only. Never push, PR or schedule |
| Input | Job skipped unless `confirm` is exactly `HOLD-AND-RELEASE` |
| Environment | Test refuses to write without `BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE` |
| Location | Lives in `scripts/beds24-write-test/`, outside `tests/` |
| Config | Its own `vitest.write-test.config.ts`; `npm test`'s `include` cannot reach it |

Verified locally: `npm test` collects 75 tests across 4 files and does not
include the write test. Running the write config *without* confirmation fails
the guard and **skips** the write suite entirely — zero network calls.
