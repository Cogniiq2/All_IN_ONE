# Final integration review — 2026-09-20

An independent adversarial pass over the whole platform before launch, run against
`claude/bolagio-finance-tax-system` @ `1b2af23` (verified as the remote head, matching
the previously reported SHA). Work landed on `claude/bolagio-final-integration-review`.

This was not a feature pass. The question asked of every subsystem was the same one:
**where do two domains disagree, and does the disagreement lose money or hide itself?**

---

## What was found

Four defects, all in the seam between the booking core and the finance subledger — the
place the two previous phases each built one side of. Nothing was found wrong inside
either domain on its own.

| # | Severity | Defect |
|---|---|---|
| 1 | **Critical** | A stay refunded before the first ingestion pass records the cash in and never the cash out |
| 2 | **High** | A refused revenue posting silently discards the guest's capture, and reports the reason as `unknown` |
| 3 | **High** | A cancelled Booking.com reservation carrying a price is posted as full accommodation revenue at 7 % |
| 4 | **Medium** | Import adapters accept a foreign currency and an unreadable commission, both silently |

---

### 1 · Critical — the refund that leaves no trace

`ingestBookingFacts` nested the refund's **outgoing payment** inside the lookup for the
original revenue transaction:

```ts
if (orig) {
  …
  const p = await recordPayment(refund.payment, actor);   // ← only reached when `orig` exists
}
```

A stay that is cancelled and refunded *before* the first ingestion pass never reached a
revenue-recognising status, so `revenuePosting` returns null and no revenue row is ever
written. `orig` is therefore null on that pass — and on every pass after it, for ever.

`capturePayment` is not so conditioned: `payment_status = 'refunded'` is in its allowed
set, so the **incoming** €465 is recorded. The outgoing €465 never is.

Reproduced on the real schema: cash in €465.00, cash out €0.00, no revenue, no refund
posting, and `errors: []` — the run reports complete success. Every later pass repeats
the same skip, so cash is permanently overstated by the full refund and nothing in the
Finance Inbox, the reconciliation view or the attention model has anything to point at.

Trigger: any booking cancelled and refunded between two ingestion passes. Ingestion runs
on the operations pass, so a same-day cancellation is enough.

**Fix.** The outgoing cash is recorded **first and unconditionally** — money leaving the
account is a fact about the bank, not about the P&L. The pro-rata reversal still needs
the original lines and is still skipped without them, but that case is now *counted*
(`refundsWithoutRevenue`) and surfaces as an unmatched outgoing payment, which is the
honest state: money left, and no stay was ever recognised. The counter is carried into
the operations pass summary and the audit record.

`refundCashFact` was extracted from `refundPosting` so the two can never state the cash
differently; `refundPosting` now returns it rather than restating it, and a test asserts
they are equal.

### 2 · High — one refusal took the capture with it

All three facts — revenue, capture, refund — shared a single `try`. A revenue posting the
database refuses (a locked period, an inactive tax code) aborted the block before
`capturePayment` ran, so the guest's money went unrecorded as collateral damage of a
*bookkeeping period* decision.

The same block reported the reason as `BLG-6VVBQW: unknown`.

That second half has a root cause worth naming: **`supabase-js` resolves with a plain
object, not an `Error`.**

```
instanceof Error: false   ctor: Object   keys: [code, details, hint, message]
```

Every `cause instanceof Error ? cause.message : 'unknown'` in the finance domain
therefore threw away what the database said. It is not only cosmetic: `fail()` in
`lib/finance/actions.ts` maps BLG codes to the sentence that tells an operator what to do
("The period is locked. Post the correction into the open period."). With the code lost,
**every refusal read "The command failed. Nothing was changed."** — including the ones
with a valid recovery path.

**Fix.** `lib/finance/errors.ts`: commands throw a real `FinanceCommandError` carrying the
message and the code; `errorMessage()` reads a PostgREST error as well as an `Error` and
is used at each place a caught value becomes text. Each of the three facts now has its own
failure boundary, so one refusal reports itself and leaves the other two alone.

The regression test asserts the ingestion error names `BLG11` **and** the locked period
key, and that the capture is still recorded.

### 3 · High — a cancellation charged as a night sold

The Booking.com reservations adapter rejected a cancelled row only when its price was
zero. A cancelled or no-show reservation carrying a price — a cancellation charge — was
staged as an ordinary reservation and posted as `accommodation_revenue` at
`DE_ACCOMMODATION_REDUCED` / 7 %, review state `suggested`, with nothing marking it as a
cancellation.

Whether such a charge is a taxable supply or untaxed compensation (*echter
Schadensersatz*) is unsettled, and this system is built to park that kind of question
rather than answer it at 7 %.

**Fix.** The parser carries an explicit `cancelled` flag. A cancelled row with a price is
posted with its amount intact, on `DE_REVIEW_REQUIRED` (rate 0, counts toward no VAT
figure until classified), `needs_review`, category `other_guest_charges`, and a
description and note saying what it is. A reservation that actually happened is
untouched — proven by a test that passes both before and after the fix.

### 4 · Medium — imports that fail quietly

- **Currency.** Adapters passed `Currency` straight through to `postTransaction`. Nothing
  in the system converts currency and every report sums `gross_cents` as euros, so one USD
  reservation silently corrupts the P&L. All four adapters now refuse a non-EUR row with a
  message that says to post it by hand at the rate it was booked.
- **Commission.** A `Commission amount` cell that is present but unreadable became
  `null` and simply no commission — understating the cost of every affected OTA stay. An
  unreadable cell is now an error row; an *empty* cell still means no commission.

---

## Fixed but not a defect

`recordMinibarMovementAction` passed `charge_state` from the form to the database with no
whitelist, where `movement` beside it is whitelisted. A bad value surfaced as a CHECK
violation the operator could not act on. Now refused with a sentence.

## Looked at hard and found sound

These are recorded because "we checked" is worth as much as "we fixed".

- **Stale reads.** Every PostgREST call in the application goes through the one
  `supabaseAdmin()` client with `cache: 'no-store'`; there is no second client
  (`lib/admin/auth.ts` creates one for GoTrue sign-in only, which is a POST). The Next
  Data Cache cannot answer a booking, finance or availability read.
- **Bayreuth Hebesatz.** Correctly left gated: 390 % seeded with `reviewRequired: true`,
  effective-dated, source-referenced, configurable through an action that demands a legal
  reference, and the estimate carries a caveat naming it a placeholder. **Not touched.**
- **Money.** Integer cents and basis points throughout; `roundHalfUp` half-away-from-zero;
  largest-remainder `allocate` that always sums to the whole. No float represents money.
- **Minibar.** COGS is its own `cogs` transaction and is never netted into revenue;
  complimentary items use their own movement type and post nothing; stock adjustments are
  not revenue; the sale key makes a replay a no-op. Proven by `scripts/db-test.sh`.
- **Cleaning.** `bolagio_sync_turnovers` voids a turnover whose stay left `confirmed`,
  reopens one whose departure moved, and announces both. `syncTurnoverCosts` writes an
  expectation to its own table, never an expense, and no report reads it as one.
- **Period locks.** Enforced in the database (function *and* trigger), not in TypeScript;
  a reversal into an open period is the correction path and the original is frozen, never
  edited.
- **Authorization.** All 27 finance actions gate server-side before doing anything; a
  viewer reaches none of them; `finance.tax_review` and `finance.configure` are the
  administrator's alone. Now asserted **structurally** by
  `tests/finance/actions-gated.test.ts`, which reads the source so an action that ships
  without a gate fails the build rather than waiting to be noticed.
- **Shared Supabase.** `tests/shared-project-sql.test.ts` proves over the files that no
  BoLaGio migration touches anything not `bolagio_*`, that no browser role is granted, and
  that no workflow carries a credential; `shared_project_verify.sql` proves it against a
  real cluster. RLS-on-no-policy is asserted against the live stack by the integration
  suite.
- **n8n.** 55 contract assertions: namespace separation from Cogniiq, no secret-looking
  material in node parameters, transports default to `disabled`, outbox claims idempotent
  under one worker name, health alerts fire only on change. **Live n8n not touched.**
- **Migration chain.** `scripts/db-ops-check.sh` runs preflight → all eight migrations →
  verify → rollback → re-apply → verify again on a throwaway cluster, and passes. The
  re-apply is the double-apply safety proof; the `drop … if exists` notices are it working.

### Minibar VAT rounding — checked, and not a defect

`bolagio_minibar_record_movement` computes `round(v_gross / (1 + rate/10000.0))` in
**double precision**, where Postgres `round()` is banker's rounding (`round(2.5) = 2`)
against the documented half-up policy. Brute-forced every gross from €0.01 to €20,000.00
at both 7 % and 19 %: **zero divergence**. The division never lands exactly on a half
cent, so the difference is unreachable. Recorded as a latent violation of the "no floats"
invariant, not fixed — a migration is not worth spending on an unreachable case.

---

## Dependencies — the trade-off, not an upgrade

`next@14.2.35` carries a long advisory list whose only offered remedy is `next@16.3.5`,
**two majors up** (14 → 16), on a Next 14 App Router application deployed through
OpenNext to Cloudflare Workers. Not attempted. What applies here, checked rather than
assumed:

| Advisory | Applies? | Evidence |
|---|---|---|
| Critical — RCE on Windows-hosted servers | **No** | Deployed to Cloudflare Workers |
| Critical — RCE in Image Optimization API via AVIF | **Unlikely** | `images.unoptimized: true`; the OpenNext worker routes `/_next/image` to its own `handleImageRequest`, not Next's optimizer |
| High — SSRF in rewrites | **No** | `next.config.js` declares `redirects` and `headers`; no `rewrites` |
| High — Middleware bypass, Pages Router + i18n | **No** | App Router; middleware matches `/admin` only |
| High — SSRF / DoS in Server Actions | **Partly** | Server Actions are used; all finance actions sit behind the session gate and a capability check |
| High — DoS via Server Components | **Partly** | Applies to public routes |
| High — PostCSS `sourceMappingURL` file read | **No** | Build-time only; `.next/static` emits **zero** `.map` files |

The residual exposure is denial of service on public routes, not disclosure or execution.
**Recommendation: plan the Next 15 LTS upgrade as its own change with its own test run —
not as part of a review branch.**

`@playwright/test@1.49.1` is a devDependency affected by an advisory fixed in 1.56.1. The
bump is low risk and CI would exercise it (`npx playwright install` runs there), but it
**could not be verified in this environment** — the sandbox has a pinned Chromium at
`PLAYWRIGHT_BROWSERS_PATH` and cannot download the build a newer Playwright expects.
Shipping an unverified bump to the e2e tooling is exactly the speculative push this review
exists to prevent, so it is recommended rather than applied.

---

## Files changed

| File | Change |
|---|---|
| `lib/finance/errors.ts` | **New.** `FinanceCommandError`, `asFinanceError`, `errorMessage` |
| `lib/finance/commands.ts` | Independent failure boundary per fact; refund cash recorded unconditionally; `refundsWithoutRevenue`; real errors; cancelled OTA charge on the review code |
| `lib/finance/ingestion-rules.ts` | `refundCashFact` extracted; `refundPosting` reuses it |
| `lib/finance/import/adapters.ts` | `cancelled` flag; EUR-only guard on all four adapters; unreadable commission is an error |
| `lib/finance/actions.ts` | `errorMessage` in `fail()`; `charge_state` whitelist; anomaly in the audit detail |
| `lib/finance/queries.ts` | `errorMessage` in the query diagnostic |
| `lib/booking/operations.ts` | `refundsWithoutRevenue` in the operations summary |
| `tests/integration/finance-invariants.test.ts` | **New.** 5 cross-domain cases against the real schema |
| `tests/finance/ingestion-invariants.test.ts` | **New.** 11 pure-rule cases |
| `tests/finance/actions-gated.test.ts` | **New.** 10 structural authorization cases |

Four of the five integration cases **fail on `1b2af23`** and pass after the fix; the fifth
(a real stay still posts at 7 %) passes both ways, which is the point of including it.

## Test results

| Suite | Before | After |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run lint` | clean | clean |
| `npm test` | 605 / 41 files | **626 / 43 files** |
| `npm run test:integration` | 88 / 7 files | **93 / 8 files** |
| `scripts/db-test.sh` | pass | pass |
| `scripts/db-ops-check.sh` | pass | pass |
| `npx playwright test` | 37 | 37 |
| `npm run build` | pass | pass |
| `npm run cf:build` | pass | pass |

## Not performed

No live Supabase, Beds24, PayPal or n8n call was made. No guest message was sent. Direct
booking was not enabled. Nothing was merged and no pull request was opened. The two
`[TEMP] [LIVE]` workflows were reviewed and **kept**: both are `workflow_dispatch`-only
behind typed confirmations, and the Beds24 write test has not yet been run — it is
outstanding validation, not dead weight.
