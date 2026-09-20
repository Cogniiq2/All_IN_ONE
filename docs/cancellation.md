# Cancellation and refund — the saga

What happens when a booking is to end, where each decision is taken, and what
the database refuses whatever the application does. Sources: the header of
`lib/booking/cancellation.ts`, `lib/booking/refunds.ts`, section 2 of
`supabase/migrations/20260921120000_platform_completion.sql`, and the tests
listed in §7.

Nothing in this saga calls the payment provider except the refund command in
§4, and that command is behind a gate that production refuses.

---

## 1. Four separate facts

The booking `status` says where the **reservation** is. Four further facts
about ending it are kept apart on purpose, so that "cancellation requested,
release unknown, refund not yet executed" is a representable row rather than a
guess.

| Fact | Meaning | Where it is decided | Columns on `bolagio_booking_intents` |
|---|---|---|---|
| **Intent** | someone wants the booking to end: who, why, and whether a person took responsibility | `bolagio_request_cancellation()` | `cancellation_requested_at`, `cancellation_requested_by` (≤200 chars), `cancellation_reason` (≤400), `cancellation_authorized_by` (≤200) |
| **Release** | the channel manager no longer holds the nights, verified against the calendar | the release saga (`lib/booking/release.ts`), `status` `releasing → released` | `status`, `released_at`, `last_failure_code` |
| **Refund** | money goes back, or is decided not to | `bolagio_request_cancellation()` records the decision; `bolagio_begin_refund()` / `bolagio_record_refund_outcome()` / `bolagio_reset_refund()` execute and settle it | `refund_state`, `refund_required_cents`, `refund_id`, `refund_requested_at`, `refund_completed_at`, `refund_last_error`, plus the pre-existing `refunded_amount_cents` and `payment_status` |
| **End state** | `status = cancelled`, reachable only once the release is verified | `bolagio_complete_cancellation()` (or directly by `bolagio_request_cancellation()` when nothing was ever held) | `status`, `cancellation_completed_at` |

`refund_state` is one of `none`, `not_required`, `required`, `pending`,
`completed`, `unknown`, `failed` (constraint `bolagio_refund_state_check`).
The refund state machine, from `lib/booking/refunds.ts`:

```
required ──begin──▶ pending ──provider──▶ completed
                       │                     ▲
                       ├── answered no ──▶ failed ──reset──▶ required
                       └── no answer ────▶ unknown ──reconcile / webhook──┘
```

The columns of the first and third rows can only be written by their command
functions: the status-guard trigger refuses any other write (see §3).

---

## 2. The cases A–M

Enumerated in the header comment of `lib/booking/cancellation.ts`; each is
decided by `bolagio_request_cancellation()` unless stated otherwise.
"Payment evidence" means `payment_status` is not one of `not_created`,
`order_created`, `cancelled`, `denied`. "Paid side" means `status` is one of
`paid`, `finalizing`, `confirmed`, `paid_unfinalized`, `finalization_failed`,
or `payment_status` is one of `paid`, `partially_refunded`, `disputed`,
`refunded`.

Who may do it, in code today:

* **operator / admin** — through `cancelBookingAction` in BoLaGio Control
  (`lib/admin/actions.ts`), the only caller of `cancelBooking()`. An operator
  may cancel a booking without payment evidence; a booking with payment
  evidence needs an administrator (§5).
* **system** — reconciliation finishes an already-requested cancellation
  (`finishCancellations` and `resolveRelease` in `lib/booking/reconciliation.ts`)
  and settles refunds (`resolveUncertainRefund`, the REFUNDED webhook). No
  scheduled process ever *starts* a cancellation.
* **guest** — no code path. `CancelBookingInput.actor` documents `guest` as a
  possible actor string, but no route or form calls the saga on a guest's
  behalf.

| Case | Trigger / precondition | Database function and outcome | Booking `status` after | `payment_status` after | `refund_state` after | Who, and the gate |
|---|---|---|---|---|---|---|
| **A** unpaid, nothing held | `status` in `draft`, `quoted`, `quote_expired`, `unavailable`, `hold_failed`, `released`; no payment evidence | `bolagio_request_cancellation` → `cancelled`; transitions to `cancelled` itself, emits `booking.cancelled`, sets `cancellation_completed_at`. No provider call. | `cancelled` | unchanged | `none` | operator or admin; `cancel_unpaid_booking`; typed reference |
| **B** held, unpaid | `beds24_booking_id` set, no payment evidence | → `release_required`, emits `booking.cancellation_requested` once. The saga runs `releaseHold()` (Beds24 cancel + calendar read-back), then `bolagio_complete_cancellation` → `cancelled`. | `cancelled` | unchanged | `none` | operator or admin; `cancel_unpaid_booking`; typed reference |
| **C** declined / abandoned | `payment_status` `denied` or `cancelled`: a definitive no is not evidence | as B | `cancelled` | unchanged | `none` | as B |
| **B′** held, payment evidence, no capture | e.g. `payment_status = approved` (an approved PayPal order) | refused `AUTHORIZATION_REQUIRED` unless `p_authorized = true`; with authorisation → `release_required`, `refund_state` stays `none` (nothing captured) → release → `cancelled` | `cancelled` | unchanged | `none` | admin only (`cancel_paid_booking`) and `OPERATOR_PAID_CANCELLATION_ENABLED=true`; Control passes `refundCents = 0`, which the function ignores for this class |
| **D** paid and confirmed | paid side | refused `AUTHORIZATION_REQUIRED` without `p_authorized`; refused `REFUND_DECISION_REQUIRED` without `p_refund_cents`; refused `INVALID_REFUND_AMOUNT` if `< 0` or `> paid_amount_cents − refunded_amount_cents`. With both → `release_required`, `cancellation_authorized_by = actor`, refund decision recorded → release (the trigger now permits `confirmed → releasing`) → `cancelled`. The refund is **not** executed by this path. | `cancelled` | unchanged (`paid`) | `not_required` (H) or `required` (I) | admin only; `cancel_paid_booking`; `OPERATOR_PAID_CANCELLATION_ENABLED=true`; typed reference; explicit refund decision |
| **E** Beds24 release succeeds | release saga: Beds24 answered and the read-back shows the nights open | `releasing → released` (release saga), then `bolagio_complete_cancellation` → `cancelled` | `cancelled` | unchanged | as decided | saga, after A–D |
| **F** Beds24 answer unknown | release saga: timeout / lost response | `release_failed` with `last_failure_code = BEDS24_RELEASE_FAILED`; **still reserved** locally (`bolagio_status_reserves` is true); `cancellation_requested_at` set, `cancellation_completed_at` null. The saga returns `release_pending`. Reconciliation (`resolveRelease`) re-checks; `finishCancellations` completes it once `released`. | `release_failed`, later `cancelled` | unchanged | as decided | system (reconciliation) finishes it |
| **G** release fails / unverified | Beds24 said cancelled but the nights are still closed (`BEDS24_RELEASE_UNVERIFIED`), or refused | as F | as F | unchanged | as decided | as F |
| **H** refund not required | D with `p_refund_cents = 0` | `refund_state = 'not_required'` | as D | `paid` | `not_required` | admin, as D |
| **I** refund required, not run | D with `p_refund_cents > 0` | `refund_state = 'required'`, `refund_required_cents = p_refund_cents`. Nothing is sent. `executeRefund()` refuses with `EXECUTION_DISABLED` while `PAYMENT_REFUND_EXECUTION_ENABLED` is not `true`. | as D | `paid` | `required` | admin decides; execution: §4 |
| **J** refund executed, completed | gate on; `bolagio_begin_refund` → `pending`; provider returns `refunded` with a refund id | `bolagio_record_refund_outcome('completed', refund_id, amount)` → `completed`, `refunded_amount_cents` accumulated, `payment_status` → `refunded` (total ≥ paid) or `partially_refunded`, emits `payment.refunded` once, resolves any `PAYMENT_REFUND_UNCERTAIN` job. Idempotent on the refund id (a second identical evidence returns `duplicate: true`). | unchanged | `refunded` / `partially_refunded` | `completed` | `executeRefund()` (no caller in routes or actions today, see §6), or the REFUNDED webhook, or read-back |
| **K** refund outcome lost | provider timeout / 5xx / `PENDING` state / an earlier unresolved attempt | `bolagio_record_refund_outcome('unknown')` → `unknown`, queues `PAYMENT_REFUND_UNCERTAIN` (severity 1), emits `booking.manual_review_required` with that code. Reconciliation reads the order (`resolveUncertainRefund`): a refund with `state = refunded` and `amountCents = refund_required_cents` completes it (source `readback`); none listed → job retried (`retry`), nothing re-sent. The REFUNDED webhook settles it too. | unchanged | `paid` until evidence | `unknown`, then `completed` | system |
| **L** duplicate cancellation | a second request on the same booking | `already_cancelled` when `status = cancelled`; otherwise idempotent: first requester and reason kept, `booking.cancellation_requested` not re-emitted; a second saga run re-runs the (idempotent) release and finds nothing to do | unchanged | unchanged | unchanged | anyone allowed to run the first |
| **M** duplicate refund | a second `begin` while `pending` or `unknown`, or after `completed` | `bolagio_begin_refund` refuses `REFUND_IN_PROGRESS` / `REFUND_ALREADY_COMPLETED`. The external-operations ledger (`operationKey.paypalRefund(captureId)`) refuses a blind resend after an unknown outcome (`UnresolvedOperationError` → `UNRESOLVED_PREVIOUS_ATTEMPT`). Evidence of a **different** refund id on a completed row → `PAYMENT_REFUND_DUPLICATE` (severity 1 job), never adopted. | unchanged | unchanged | unchanged | — |

Two more refusals from `bolagio_request_cancellation` that are not lettered:

| Situation | Outcome |
|---|---|
| `status` in `locking`, `releasing` | `in_progress` — the saga reports `release_pending` with code `IN_PROGRESS`; Control shows "mid-transition" |
| `status = manual_review` | refused `MANUAL_REVIEW` — a person owns it; use the runbook (`docs/booking-runbook.md`) |
| unknown id | refused `NOT_FOUND` |

Provider refusal (not lettered in the header): an answered `rejected`,
`not_found`, `not_configured` or `unauthorized` from the adapter is a definite
failure → `bolagio_record_refund_outcome('failed')` → `refund_state = failed`,
job `PAYMENT_REFUND_FAILED` (severity 2, escalated to a person). A retry needs
an explicit `bolagio_reset_refund()` (`failed → required`); no caller for
`resetRefund()` exists in routes or actions today.

Every request also calls `bolagio_suppress_message_deliveries(intent,
'cancellation_requested')`, so pending or failed guest messages never go out
(see `docs/guest-messaging.md` §5).

---

## 3. Database invariants

All from section 2 of the migration. "Refuses" means `raise exception … using
errcode = 'check_violation'` or a check-constraint violation; the write is
rolled back.

### Check constraints on `bolagio_booking_intents`

| Constraint | Refuses |
|---|---|
| `bolagio_refund_state_check` | a `refund_state` outside `none`, `not_required`, `required`, `pending`, `completed`, `unknown`, `failed` |
| `bolagio_refund_required_cents_check` | a negative `refund_required_cents` |
| `bolagio_refund_completed_evidence` | `refund_state = completed` without a `refund_id` and a `refunded_amount_cents > 0` — a completed refund without provider evidence is not a fact |
| `bolagio_refund_requires_money` | any `refund_state` other than `none` / `not_required` unless `payment_status` is one of `paid`, `partially_refunded`, `refunded`, `disputed`, `unknown`, `capture_pending` (`unknown` and `capture_pending` are allowed so a decision can be taken while the payment is still being reconciled) |
| `bolagio_refund_requires_authorization` | any `refund_state` other than `none` / `not_required` while `cancellation_authorized_by` is null — every refund is the consequence of an authorised cancellation |
| `bolagio_refund_required_amount` | `refund_state` in `required`, `pending` without `refund_required_cents > 0` |

Index: `bolagio_booking_intents_refund_idx` on `refund_state` for the rows in
`required`, `pending`, `unknown`, `failed`.

### Trigger guards in `bolagio_booking_status_guard()` (`BEFORE UPDATE`)

| Guard | Refuses |
|---|---|
| direct status change | any `status` change made without `bolagio.transition_ok = yes`, i.e. outside `bolagio_booking_transition()` (pre-existing) |
| illegal transition | a `status` change not in `bolagio_transition_allowed()` (pre-existing; this migration adds the edge `manual_review → hold_created`) |
| **release needs authorisation** (new) | entering `releasing` when the old status is on the paid side (`paid`, `finalizing`, `confirmed`, `paid_unfinalized`, `finalization_failed`) **or** the new `payment_status` is not one of `not_created`, `order_created`, `cancelled`, `denied` — unless `cancellation_authorized_by` is set. No timer, sweep, webhook or click can release a booking with payment evidence. |
| illegal payment transition | a `payment_status` change not in `bolagio_payment_transition_allowed()` (pre-existing; now also checked on a same-state call) |
| **cancellation columns** (new) | a change to `cancellation_requested_at`, `cancellation_requested_by`, `cancellation_authorized_by` or `cancellation_completed_at` without `bolagio.cancel_ok = yes`, i.e. outside `bolagio_request_cancellation()` / `bolagio_complete_cancellation()` |
| **refund columns** (new) | a change to `refund_state`, `refund_id`, `refund_completed_at` or `refunded_amount_cents` without `bolagio.refund_ok = yes`, i.e. outside `bolagio_request_cancellation()`, `bolagio_begin_refund()`, `bolagio_record_refund_outcome()`, `bolagio_reset_refund()` |

The application check in `releaseHold()` (`lib/booking/release.ts`) — refuse a
paid-side release when `intent.cancellationAuthorizedBy` is null — is the
application agreeing with the trigger, not the guarantee itself.

Section 1 of the same migration is a prerequisite: a same-state
`bolagio_booking_transition()` call **with** a patch or an outbox type is now
applied, which is how `payment_status = refunded` and `payment.refunded` are
written on a `cancelled` booking. A same-state call with neither is still the
idempotent no-op.

The rollback (`supabase/ops/rollback_20260921.sql`) refuses to run while any
row has `refund_state` in `required`, `pending`, `unknown`, `failed` or a
cancellation requested but not completed.

---

## 4. The refund command

`executeRefund(intent, actor, logger)` in `lib/booking/refunds.ts`. The amount
comes from the row (`refund_required_cents`), never from a parameter.

### Gates

| Gate | Where | Effect |
|---|---|---|
| `PAYMENT_REFUND_EXECUTION_ENABLED` must be `true` | `refundExecutionEnabled()` in `lib/booking/config.ts`; off by default | otherwise `refused` / `EXECUTION_DISABLED`, nothing written |
| production refuses the gate | `validateEnvironment()` in `lib/config/environment.ts`: finding `REFUND_EXECUTION_UNVALIDATED` is a **refusal** on `production` and a warning elsewhere | the configuration is refused until `docs/payment-paypal.md §8` records the refund cases as proven in the sandbox and the rule is relaxed |
| `bolagio_begin_refund` | database | refuses `NOT_FOUND`, `REFUND_ALREADY_COMPLETED`, `REFUND_IN_PROGRESS` (`pending` or `unknown`), `REFUND_NOT_REQUIRED`, `NO_CAPTURE`, `AUTHORIZATION_REQUIRED`; otherwise `required → pending`, `refund_requested_at` set, audit row `refund_started` |

### Idempotency

* `required → pending` happens once (`bolagio_begin_refund`).
* External-operations ledger key: `operationKey.paypalRefund(captureId)` —
  one operation per capture. `trackedCall` throws `UnresolvedOperationError`
  when an earlier attempt's outcome is unknown and unreconciled; the saga
  records `unknown` and returns `UNRESOLVED_PREVIOUS_ATTEMPT` without calling
  the provider.
* Provider request id: `refund:<captureId>:<amountCents>` (truncated to 108
  characters), deterministic.

### Outcome handling

| Provider result | Recorded as | Follow-up |
|---|---|---|
| `state = refunded` with a `refundId` | `completed` (source `saga`) | `payment.refunded` emitted; `payment_status` updated |
| definite failure: `PaymentProviderError` with code `rejected`, `not_found`, `not_configured`, `unauthorized` | `failed` | job `PAYMENT_REFUND_FAILED` (severity 2, escalated); retry only after `bolagio_reset_refund()` |
| any other throw (timeout, 5xx): `UncertainOperationError` | `unknown` | job `PAYMENT_REFUND_UNCERTAIN` (severity 1), `booking.manual_review_required` emitted; reconciliation reads the order |
| accepted but not completed (e.g. `PENDING`, or no refund id) | `unknown` (`provider refund state <state>`) | as above |
| `completed` refused by the database (`PAYMENT_REFUND_DUPLICATE`, `UNAUTHORIZED_REFUND_EVIDENCE`) | returned as `failed` with `issue = <code>` | the database has queued the job; a person decides |

### Webhook settlement (`lib/booking/payments.ts`)

On a `refunded` / `partially_refunded` payment event whose intent has
`refund_state` in `pending`, `unknown`, `completed` and carries a capture id
and amount, the event's resource id (on `PAYMENT.CAPTURE.REFUNDED` the resource
**is** the refund) and amount are passed to `recordRefundOutcome('completed',
source 'webhook')`. Recorded or duplicate → `applied`;
`PAYMENT_REFUND_DUPLICATE` → `escalated`.

Any other refund event (including one on a row whose `refund_state` is
`required`, `not_required` or `none`) is treated as somebody's dashboard
refund: `payment_status` set to the event state, `reconciliation_state =
manual`, `payment.refunded` emitted (without `refundId`), job
`PAYMENT_REFUNDED` (severity 3) queued for a person. The booking status and
`refund_state` are **not** changed.

### Duplicate refund escalation

`bolagio_record_refund_outcome('completed')` with a refund id different from
the one already recorded on a `completed` row queues
`PAYMENT_REFUND_DUPLICATE` (severity 1, "money moved twice") and returns
`ok: false`. Reconciliation escalates that job unconditionally
(`lib/booking/reconciliation.ts`, the "financially ambiguous" group).

---

## 5. The operator flow in BoLaGio Control

Booking detail page, section "Cancellation" → `CancelPanel`
(`components/admin/booking/cancel-panel.tsx`) → `cancelBookingAction`
(`lib/admin/actions.ts`). The page derives the case with
`classifyCancellation()`; the action re-derives all of it server-side.

| Panel mode | `classifyCancellation` kind | Requires |
|---|---|---|
| `unpaid` | `nothing_held`, `held_unpaid` | role `operator` or `admin` (`cancel_unpaid_booking`); typed reference |
| `evidence` | `payment_evidence` (evidence, no settled capture) | role `admin` (`cancel_paid_booking`); `OPERATOR_PAID_CANCELLATION_ENABLED=true`; typed reference. The action passes `authorized: true` and `refundCents: 0` |
| `paid` | `paid` | as `evidence`, plus an explicit refund decision: no refund (0), full (`paid_amount_cents`), or partial (whole cents between 0 and the captured amount, else `invalid_refund`) |
| (none) | `terminal`, `in_progress`, `manual_review` | no panel; the action returns `already_cancelled`, `in_progress`, `manual_review` respectively |

Roles: `viewer` has `view` only; `operator` has `cancel_unpaid_booking`;
`admin` additionally has `cancel_paid_booking` (`lib/admin/permissions.ts`).
A preview session is refused everything but `view` (`previewAllows`), and
`adminMode() !== 'supabase'` (fixtures) returns `fixture`.

Ordering in the action: permission `cancel_unpaid_booking` → reference format
→ `confirmReference` equals the reference (upper-cased) → fixture check → find
intent → classify → for the paid path, `cancel_paid_booking` (audited as
`denied:forbidden`) then the configuration switch (audited as
`denied:paid_cancellation_disabled`) then the refund amount → `cancelBooking()`
→ audit (`booking.cancel` with class, before/after status, `refundCents`,
release code) → `revalidatePath` on the admin pages.

Results shown: `cancelled` with the refund state; `already_cancelled`;
`release_pending` with the code (F/G — "the nights stay protected locally and
reconciliation keeps re-checking"); a refusal with the booking-core code.

`OPERATOR_PAID_CANCELLATION_ENABLED=true` raises the environment warning
`PAID_CANCELLATION_ENABLED` on every deployment (the Beds24 cancellation of a
confirmed reservation is unvalidated on the live account).

What the action can never do:

* move money — no code path from Control calls `executeRefund()`;
* release a paid booking without a named administrator — the trigger refuses;
* cancel a booking in `manual_review`, `locking` or `releasing`;
* bypass the release verification — `cancelled` is reached only through
  `released`, except for case A where nothing was held.

---

## 6. What remains manual

`executeRefund()` and `resetRefund()` have **no caller** in any route or
server action; they are exercised by the integration tests only. Refund
execution is additionally refused on production by `REFUND_EXECUTION_UNVALIDATED`.
So, for a paid cancellation with `refund_state = required` today:

1. **Decide and record** in Control (§5): authorise the cancellation with the
   refund amount. The row now reads `refund_state = required`,
   `refund_required_cents = <amount>`, and appears in `bolagio_ops_attention`
   with severity 3 and raises the HIGH alert `REFUND_DECIDED_NOT_EXECUTED`
   in `lib/ops/alerts.ts` (`unknown` / `failed` raise the CRITICAL
   `REFUND_ATTENTION` instead).
2. **Execute at PayPal** by hand, in the PayPal dashboard, against the
   capture shown on the booking (`payment_capture_id`), for exactly
   `refund_required_cents`.
3. **What the system records by itself.** The `PAYMENT.CAPTURE.REFUNDED`
   webhook arrives on a row whose `refund_state` is `required`. Because the
   cancellation was authorised, the webhook settles it through
   `bolagio_record_refund_outcome(…, 'completed', <refund id>, <amount>, …,
   'webhook')`: `refund_state = completed`, `refund_id` = PayPal's refund id,
   `refunded_amount_cents` accumulated, `payment_status` `refunded` or
   `partially_refunded`, one `payment.refunded` event, no job for a person
   (`tests/integration/cancellation.test.ts`, "I′ — a decided refund done by
   hand at the provider settles the ledger through the REFUNDED webhook,
   once"). A refund on a row with **no** authorised cancellation is still
   treated as a dashboard refund: recorded as a payment fact, emitted,
   escalated (`PAYMENT_REFUNDED`), never adopted as ours.
4. **If the webhook never arrives** (misconfigured, or the refund was made
   before the webhook existed), the row is settled with the service role,
   using the same command function so the invariants and the audit apply:

   ```sql
   select bolagio_record_refund_outcome(
     '<intent uuid>', 'completed', '<PayPal refund id>', <amount cents>, null, 'webhook');
   ```

   The function requires the refund id and a positive amount
   (`EVIDENCE_REQUIRED` otherwise), refuses a different refund id on an
   already-completed row (`PAYMENT_REFUND_DUPLICATE`) and refuses when nobody
   authorised the cancellation (`UNAUTHORIZED_REFUND_EVIDENCE`). It sets
   `refund_state = completed`, accumulates `refunded_amount_cents`, updates
   `payment_status` and emits `payment.refunded` (a second emission if step 3
   already emitted one from the webhook — the two carry different payloads:
   only the command's includes `refundId`).
5. **Resolve the `PAYMENT_REFUNDED` job** from step 3 in the reconciliation
   queue (it is escalated, never auto-resolved): `bolagio_reconciliation_jobs`
   with `reason = 'PAYMENT_REFUNDED'` for the booking.

The Control copy ("the refund … is otherwise done at the provider and recorded
by the webhook") describes step 3 only; step 4 is required for `refund_state`
to read `completed`. Which of the two is the intended long-term path is not
defined in code.

---

## 7. Tests that prove each case

| Case | File : test |
|---|---|
| A | `tests/integration/cancellation.test.ts` : `A — nothing held: cancelled outright, no provider call`; `tests/sql/completion.sql` §2 "Cases A, B, C, E, G, H at the database level" (A, A/L) |
| B, L | `tests/integration/cancellation.test.ts` : `B — held, unpaid: released at Beds24, verified, cancelled; a repeat is idempotent (L)`; `tests/sql/completion.sql` §2 (B: `hold_created → releasing` accepted without authorisation) |
| C | `tests/integration/cancellation.test.ts` : `C — declined payment: releasable without authorisation`; `tests/sql/completion.sql` §2 (C) |
| B′ | `tests/integration/cancellation.test.ts` : `B′ — an approved order is payment evidence: refused without authorisation, released with it`; `tests/sql/completion.sql` §2 (B′, including the trigger refusing `awaiting_payment → releasing`) |
| D, H | `tests/integration/cancellation.test.ts` : `D/H — confirmed and paid: refused without authorisation and without a refund decision; with both, released and cancelled, no refund sent`; `tests/sql/completion.sql` §2 "Cancellation and refund invariants" (D guard, D refusals, `INVALID_REFUND_AMOUNT`) |
| E | `tests/integration/cancellation.test.ts` : `E — a paid cancellation whose Beds24 release is unknown keeps the dates protected and finishes later`; `tests/sql/completion.sql` §2 (`releasing → released` → `bolagio_complete_cancellation` → `cancelled`, `not_yet` before) |
| F, G | `tests/integration/cancellation.test.ts` : `F/G — release outcome unknown: dates stay protected; reconciliation finishes the cancellation later` |
| I | `tests/integration/cancellation.test.ts` : `I — refund required is RECORDED, never executed while the gate is off`; `tests/sql/completion.sql` §2 (D/I release required, refund required) |
| J, M | `tests/integration/cancellation.test.ts` : `J — refund executed (gate on): completed with the provider refund id; the REFUNDED webhook is a duplicate`; `tests/sql/completion.sql` §2 (J evidence after unknown, idempotent on the refund id, `PAYMENT_REFUND_DUPLICATE`, M `REFUND_IN_PROGRESS`) |
| K | `tests/integration/cancellation.test.ts` : `K — refund response lost: unknown, a severity-1 job, then the order read-back completes it`; `K′ — refund timed out and never executed: read-back finds no refund, the job keeps waiting, nothing is sent blind`; `tests/sql/completion.sql` §2 (K unknown recorded, severity-1 job) |
| provider refusal / reset | `tests/integration/cancellation.test.ts` : `refund refused by the provider: failed, escalated, and retryable only through an explicit reset` |
| L (database) | `tests/sql/completion.sql` §2 (duplicate request idempotent, first requester kept, no second `booking.cancellation_requested`) |
| manual_review refusal | `tests/sql/completion.sql` §2 (`MANUAL_REVIEW`) |
| column guards | `tests/sql/completion.sql` §2 (refund columns and cancellation columns cannot be written directly; `EVIDENCE_REQUIRED`) |
| no auto-release, no auto-refund | `tests/integration/cancellation.test.ts` : `never auto-refunds and never releases a paid booking without a person, whatever fails` |
| suppression of guest messages | `tests/integration/messaging.test.ts` : `a cancelled booking suppresses every pending guest message and refuses new ones` |
| no turnover survives a cancellation | `tests/integration/cancellation.test.ts` (D/H, last assertion: no turnover row after reconcile); `tests/sql/completion.sql` §4 (an existing turnover is voided and `cleaning.cancelled` emitted) |
| refund attention in Control | `tests/integration/admin-ops.test.ts` : `a refund with an unknown outcome is a CRITICAL alert naming the booking` |
| same-state transition carries its patch (prerequisite) | `tests/sql/completion.sql` §1 |
| rollback refusals | `supabase/ops/rollback_20260921.sql` (refuses on refunds or cancellations in flight); exercised by `./scripts/db-ops-check.sh` |

The server action itself (cookie, request scope) is not covered here; see the
Playwright admin cases referenced in `tests/integration/admin-ops.test.ts`.
