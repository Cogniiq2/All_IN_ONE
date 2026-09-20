# Guest messaging — the delivery ledger and the internal endpoint

How a guest message is rendered, claimed, transported and recorded exactly
once, on top of an outbox that delivers at least once. Sources: section 3 of
`supabase/migrations/20260921120000_platform_completion.sql`,
`lib/messaging/*.ts`, `app/api/internal/messages/route.ts`,
`n8n/workflows/bolagio-guest-message.json`, `n8n/README.md`, and the tests in
§8. The outbox itself and the HMAC are specified in
`docs/n8n-booking-contract.md`.

The split, from `lib/messaging/deliveries.ts`: **the backend renders; the
automation platform transports.** n8n never sees a template, never decides
whether a message is due, and cannot make the ledger say "sent" without a
transport saying so.

---

## 1. The delivery ledger — `bolagio_message_deliveries`

One row per (booking, message kind, sequence). No message body is stored; the
destination is kept masked and hashed.

| Column | Type / default | Meaning |
|---|---|---|
| `id` | uuid | the `deliveryId` the endpoint hands out |
| `intent_id` | uuid → `bolagio_booking_intents`, cascade delete | the booking |
| `reference` | text, not null | booking reference |
| `kind` | text, check | one of `booking_confirmation`, `prearrival`, `checkin`, `checkout`, `review_request` |
| `sequence` | smallint ≥ 1, default 1 | a deliberate resend is a **new row** with the next sequence, never a rewrite of the row that recorded the first send |
| `dedupe_key` | text, **unique** | `<reference>:<kind>:<sequence>` |
| `channel` | `email` (default), `sms`, `none` | only `email` is produced today |
| `locale` | text, default `de` | `de` or `en`, from the guest |
| `template_id`, `template_version` | text | which wording went out (e.g. `booking_confirmation.de`, `1`); `unrendered` when rendering failed |
| `destination_masked` | text | e.g. `a***@example.com` (first character of the local part) |
| `destination_hash` | text | SHA-256 hex of the trimmed, lower-cased address |
| `status` | check | `pending`, `sending`, `sent`, `failed`, `skipped`, `suppressed` |
| `retryable` | boolean, default true | false after a non-retryable failure or once `attempts ≥ max_attempts` |
| `attempts` / `max_attempts` | smallint, 0 / 5 | claims made / budget |
| `claim_expires_at` | timestamptz | the lease held by the current `sending` claim |
| `next_attempt_at` | timestamptz | backoff after a retryable failure |
| `provider`, `provider_message_id` | text (≤60 / ≤200) | what the transport reported (`smtp`, `test`, `disabled`, `renderer`) |
| `last_error` | text ≤400 | the transport's or renderer's error; the suppression reason |
| `outbox_event_id` | uuid | the outbox event that triggered the prepare, when n8n passed one |
| `sent_at`, `failed_at`, `requeued_at`, `requeued_by` | | timestamps and the requeueing operator |
| `created_at`, `updated_at` | | `updated_at` maintained by trigger `bolagio_message_deliveries_touch` |

Indexes: `(intent_id, created_at desc)`, `(reference)`, and a partial
`(status, created_at)` for `pending`, `sending`, `failed`. RLS enabled; all
privileges revoked from `anon` and `authenticated`; the command functions are
executable by `service_role` only.

### Statuses

| Status | Set by | Meaning |
|---|---|---|
| `pending` | insert; `bolagio_requeue_message_delivery` | waiting for a claim |
| `sending` | `bolagio_begin_message_delivery` | a worker holds the lease (`claim_expires_at`) |
| `sent` | complete `sent` | a transport reported delivery; `provider`, `provider_message_id`, `sent_at` set |
| `failed` | complete `failed` | `failed_at`, `last_error`; `retryable` and `next_attempt_at` decide what happens next |
| `skipped` | complete `skipped` | the transport chose not to send (n8n's `disabled` transport). Final for this (booking, kind, sequence) |
| `suppressed` | complete `suppressed`, or `bolagio_suppress_message_deliveries` | must not go out (the stay ended). Final |

### What is never stored

The rendered subject and body, and the full e-mail address. The prepared
message (name, address, text) exists only in the response to a signed
`prepare` request. Asserted by `tests/integration/messaging.test.ts` (no row
serialises to contain "Guten Tag") and `tests/integration/admin-ops.test.ts`
(the Control DTO carries the masked destination, not the address).

---

## 2. The exactly-once model

The outbox pump is at-least-once: a lease that lapses, a second worker or a
re-run redelivers the same event. The ledger turns that into one **effect**:

1. `bolagio_begin_message_delivery(reference, kind, …, sequence, lease_seconds)`
   inserts the row `on conflict (dedupe_key) do nothing`, then locks it
   `for update` and decides:

   | Outcome | When | What the caller does |
   |---|---|---|
   | `claimed` | row is `pending`, or `failed` and retryable with its backoff elapsed, or `sending` with a **lapsed** lease | send, then complete. `attempts` is incremented, `status = sending`, `claim_expires_at = now() + lease` (clamped to 30–3600 s; the application passes 300) |
   | `already_sent` | `status` in `sent`, `skipped`, `suppressed` — returns `status`, `provider`, `provider_message_id`, `sent_at` | nothing; acknowledge the event |
   | `in_progress` | `status = sending` and the lease has not lapsed | nothing; another worker settles it; acknowledge |
   | `not_retryable` | `status = failed` and `retryable = false` (returns `last_error`) | nothing; an operator requeues (§7) |
   | `backoff` | `status = failed`, retryable, `next_attempt_at` in the future (returned) | nothing now |
   | `unknown_reference` | no intent with that reference | a data fault |

2. `bolagio_complete_message_delivery(id, outcome, provider, provider_message_id, error, retryable)`
   settles **only a row in `sending`** — a late completion from a lapsed
   attempt returns `false` and changes nothing. `sent` clears the lease and
   error; `skipped` / `suppressed` set that status; `failed` sets
   `retryable = p_retryable and attempts < max_attempts` and
   `next_attempt_at = now() + min(3600, 2^min(attempts, 8) × 30)` seconds
   (30 s, 60 s, 120 s, …, capped at one hour). Any other outcome returns
   `false`.

The row is written **before** the message leaves the server, so a crash
between claim and send leaves a lease that lapses, not a second e-mail. Two
workers claiming concurrently are serialised by the row lock: one gets
`claimed`, the other `in_progress` (`tests/sql/race-delivery.sh`).

`prepareGuestMessage()` adds one outcome of its own, **before** touching the
ledger: `suppressed` with a `reason` when the booking is not `confirmed` or
has no guest e-mail. No ledger row is created in that case. (A ledger row that
was suppressed by a cancellation comes back from the claim as
`already_sent` with `status: "suppressed"`.)

---

## 3. `POST /api/internal/messages`

`app/api/internal/messages/route.ts`. Node runtime, `force-dynamic`.

### Authentication

The same HMAC as the outbox endpoint (`docs/n8n-booking-contract.md` §2):
`x-bolagio-timestamp` (UNIX seconds) and `x-bolagio-signature: v1=<hex>`,
where the signature is HMAC-SHA256 with `N8N_INTERNAL_SECRET` over
`v1:<timestamp>:<raw body>`. Verified against the exact bytes received.
A failure is **401 with no body**; the reason (`not_configured`,
`missing_headers`, `bad_timestamp`, `expired`, `bad_signature`) is logged
under `n8n.request`. The signature is checked before anything else, including
the backend check.

### Common rules

* Body over 32 000 characters → **413**, no body (checked before the
  signature).
* Not JSON, unknown `action`, or invalid fields → **400**
  `{ "error": "invalid_input" }`.
* Supabase not configured → **503** `{ "error": "provider_unavailable" }`.
* Anything thrown → **500** `{ "error": "unexpected" }`, cause logged with
  the correlation id.
* Every response carries `cache-control: no-store, max-age=0` and
  `x-correlation-id`. Every business outcome, including refusals such as
  `not_retryable` or `test_completion_refused`, is **200**.
* Each call leaves an integration observation: `n8n:last_message_prepare`
  (detail `<kind>: <outcome>`) or `n8n:last_message_complete`
  (`<outcome>: recorded | test_completion_refused`).

### Action `prepare`

```json
{ "action": "prepare", "kind": "booking_confirmation", "reference": "BLG-7K2M9Q", "eventId": "8f3c1e2a-…", "sequence": 1 }
```

| Field | Rule |
|---|---|
| `kind` | one of the five kinds; else 400 |
| `reference` | a booking reference (`isBookingReference`); else 400 |
| `eventId` | optional; kept only if it is a 36-character uuid-shaped string, stored as `outbox_event_id` |
| `sequence` | optional integer 1–20; anything else is treated as 1 |

Steps (`prepareGuestMessage`): find the intent → require `status =
confirmed` and a guest e-mail → render the template in the guest's locale
(§4) → claim the ledger slot.

Responses (all 200):

| `outcome` | Body | Meaning |
|---|---|---|
| `claimed` | `deliveryId`, `attempt`, `message: { channel: "email", to, subject, text, locale, templateId, templateVersion }` | send it, then `complete` |
| `already_sent` | `deliveryId`, `status` (`sent`, `skipped` or `suppressed`) | nothing to send |
| `in_progress` | `deliveryId` | another worker holds the lease |
| `backoff` | `deliveryId`, `nextAttemptAt` | a failed attempt is waiting out its backoff |
| `not_retryable` | `deliveryId`, `reason` | failed for good (transport said so, or the template could not render — §4); an operator requeues |
| `suppressed` | `reason` (`booking is <status>` / `booking has no guest email`); no `deliveryId` | the stay is not a confirmed stay; nothing is claimed |
| `unknown_reference` | — | no such booking |

### Action `complete`

```json
{ "action": "complete", "deliveryId": "…", "outcome": "sent", "provider": "smtp", "providerMessageId": "<id>", "error": "…", "retryable": true }
```

| Field | Rule |
|---|---|
| `deliveryId` | uuid-shaped; else 400 |
| `outcome` | `sent`, `failed` or `skipped`; else 400 (`suppressed` is not accepted from the transport) |
| `provider` | non-empty string; trimmed, lower-cased, ≤60 chars |
| `providerMessageId` | optional, ≤200 |
| `error` | optional, ≤400 |
| `retryable` | optional boolean; default true |

Response: `{ "recorded": boolean, "refused"?: "test_completion_refused" }`.

| Result | Meaning |
|---|---|
| `recorded: true` | the ledger row was in `sending` and is now settled |
| `recorded: false` | stale: the row was not in `sending` (lease lapsed and was reclaimed, already settled, or unknown id). Nothing changed |
| `recorded: true, refused: "test_completion_refused"` | `outcome = sent` with `provider = test` where test completions are not allowed (§6). The row is recorded as **`failed`, non-retryable**, `provider = test`, error "a test transport may not report a delivery as sent on this deployment" |

### What the endpoint cannot do

Send anything; change a booking; put a row into `sent` without a transport
reporting it; render for a booking that is not confirmed.

---

## 4. Templates

`lib/messaging/templates.ts` — data only, import-safe anywhere.

| Kind | Trigger event (see `docs/n8n-booking-contract.md` §5) | Template ids | Version | Required variables |
|---|---|---|---|---|
| `booking_confirmation` | `booking.confirmed` | `booking_confirmation.de`, `.en` | 1 | core + `nights`, `totalAmount`, `checkInTime`, `checkOutTime` |
| `prearrival` | `guest.prearrival_ready` | `prearrival.de`, `.en` | 1 | core + `checkInTime`, `contactPhone` |
| `checkin` | `guest.checkin_ready` | `checkin.de`, `.en` | 1 | core + `checkInTime`, `contactPhone` |
| `checkout` | `guest.checkout_ready` | `checkout.de`, `.en` | 1 | core + `checkOutTime` |
| `review_request` | `review.requested` | `review_request.de`, `.en` | 1 | core |

Core = `firstName`, `reference`, `unitName`, `checkInDate`, `checkOutDate`,
`brandName`, `contactEmail`. The full variable set additionally has
`lastName`, `adults`, `children`, `siteUrl`, `daysUntilArrival`. Locale is
`en` when the guest's locale is `en`, otherwise `de` (`toMessageLocale`).
`id` and `version` are written to the ledger with every claim; changing copy
means bumping `version`.

Deliberately absent from every template: access codes, door instructions,
Wi-Fi passwords, cleaner names, review links — facts this repository does not
hold.

### Rendering (`lib/messaging/render.ts`)

Three enforced rules: every required variable present and non-empty (a
number must be finite, a string non-blank); every `{{placeholder}}` names a
known variable; the output contains no `{{`. A violation throws
`TemplateRenderError` with code `template_missing`, `variable_missing`,
`variable_unknown` or `unresolved_placeholder` — never a message with a hole.

### Fail-safe on a render failure

In `prepareGuestMessage`, a `TemplateRenderError` is a configuration fault:
the ledger slot is still claimed (`template_version = 'unrendered'`) and
immediately completed as **`failed`, `provider = renderer`, `retryable =
false`**; the response is `not_retryable` with the error as `reason`.
Nothing leaves. The row shows on the Control automations board as "failed,
needs a person"; after the cause is fixed an operator requeues it (§7).

### Variables and their sources

| Variable | Source |
|---|---|
| `firstName`, `lastName` | the intent's guest |
| `unitName` | `lib/content/apartments.ts` name in the locale, else the unit's `displayName`, else the slug |
| `checkInDate`, `checkOutDate` | `formatDateOrDash` of the stay |
| `checkInTime`, `checkOutTime` | `bolagio_units.check_in_time` / `check_out_time` |
| `nights` | `nightsBetween` |
| `totalAmount` | `paid_amount_cents` (else the quoted total) in `paid_currency` (else `currency`), formatted `de-DE` or `en-GB` |
| `brandName`, `siteUrl` | `lib/content/brand.ts` |
| `contactEmail` | `MESSAGING_CONTACT_EMAIL`, else `contact.email` from the brand file — which is deliberately `null` until a real address is verified. Without the variable **every** template fails to render (all require it) |
| `contactPhone` | `MESSAGING_CONTACT_PHONE`, else `contact.phone` from the brand file |
| `daysUntilArrival` | not supplied by `prepareGuestMessage` today; no template requires it |

---

## 5. Suppression on cancellation

`bolagio_request_cancellation()` calls
`bolagio_suppress_message_deliveries(intent_id, 'cancellation_requested')` on
every request, before deciding anything else: every row of the booking in
`pending` or `failed` becomes `suppressed` (lease cleared, `last_error` =
the reason). Rows in `sent`, `skipped` or `sending` are untouched. A later
claim on a suppressed row returns `already_sent` with `status: "suppressed"`.

Independently, `prepareGuestMessage` refuses any booking whose `status` is
not `confirmed` with `outcome: "suppressed"`, so an event emitted before the
cancellation and delivered after it sends nothing. See
`docs/cancellation.md`.

---

## 6. What n8n does

Workflow **BoLaGio · Guest Message** (`n8n/workflows/bolagio-guest-message.json`),
a sub-workflow called by the Outbox Event Pump with `kind`, `reference` and
`eventId` in the item, for all five kinds:

```
Prepare message      resolve BOLAGIO_MESSAGING_TRANSPORT (throws on an unknown value, BEFORE claiming)
                     signed POST /api/internal/messages {action:'prepare', kind, reference, eventId}
Claimed?             outcome === 'claimed'
  yes → Messaging transport (Switch)
          disabled → Skip                 completion {skipped, provider 'disabled'}
          test     → Simulate send        completion {sent, provider 'test', providerMessageId 'test-<deliveryId>'}
          smtp     → Send e-mail (SMTP)   Send Email v2.1, credential "BoLaGio SMTP", from BOLAGIO_MAIL_FROM,
                     → Record SMTP result to message.to; on error → {failed, retryable}; recipient rejected
                                          → {failed, retryable:false}; else {sent, providerMessageId}
        → Complete delivery               signed POST {action:'complete', deliveryId, outcome, provider, …}
                                          ok = outcome !== 'failed'
  no  → Acknowledge without sending       already_sent / suppressed / in_progress / backoff / not_retryable → ok:true
                                          unknown_reference (or anything else) → ok:false
Return result                             {eventId, ok, error?, outcome, sent}
```

The pump acks the outbox event when `ok` is true and fails it (retry with
backoff, dead-letter after 8) when false. A `failed` delivery is therefore
both a `complete(failed)` in the ledger and a failed outbox event; the next
pump attempt asks the ledger again and receives `backoff` or a fresh claim.
The guest's address exists only in the `message` object between *Prepare*
and the send node; error texts pass through `redact()`, which masks e-mail
addresses and caps length.

A `prepare` that returns a non-2xx status makes the Code node throw
(`bolagioExpect`), so the sub-workflow errors, the Execute Workflow node
continues with an `error` item, and the pump fails the event.

### Configuration (names only — `n8n/README.md` §5, `n8n/credentials-matrix.md`)

| Name | Where | Purpose |
|---|---|---|
| `BOLAGIO_SITE_URL` | n8n env | backend base URL |
| `BOLAGIO_N8N_INTERNAL_SECRET` | n8n env | HMAC secret; must equal `N8N_INTERNAL_SECRET` on the worker |
| `BOLAGIO_MESSAGING_TRANSPORT` | n8n env | `disabled` (default) / `test` / `smtp` |
| `BOLAGIO_MAIL_FROM` | n8n env | sender address for guest mail |
| `BoLaGio SMTP` | n8n credential store (type SMTP, name exact) | the SMTP account used by the Send Email node |
| `N8N_INTERNAL_SECRET`, `N8N_REPLAY_WINDOW_SECONDS` | worker env | verification side |
| `MESSAGING_CONTACT_EMAIL`, `MESSAGING_CONTACT_PHONE` | worker env | template contact variables (§4) |
| `MESSAGING_TEST_COMPLETIONS_ALLOWED` | worker env | see below |

n8n needs `$env` access in Code nodes and `NODE_FUNCTION_ALLOW_BUILTIN`
including `crypto` (`n8n/README.md` §3).

### Test transport rules

`testCompletionsAllowed()` in `lib/booking/config.ts` decides whether a
`complete` with `outcome: sent, provider: test` is believed:

| `APP_ENV` | Believed? |
|---|---|
| `production` | never |
| `staging` | only when `MESSAGING_TEST_COMPLETIONS_ALLOWED=true` |
| `local`, `preview` | yes |

Elsewhere it is recorded as a non-retryable failure and the response carries
`refused: "test_completion_refused"` (§3). `validateEnvironment()` refuses
the configuration `MESSAGING_TEST_COMPLETIONS_ALLOWED=true` on production
outright (finding `TEST_MESSAGING_ON_PRODUCTION`).

A `skipped` (transport `disabled`) completion is final for that (booking,
kind, sequence): switching the transport on later does not send the skipped
message (`n8n/test-mode.md`). A deliberate resend is a `prepare` with the next
`sequence`; nothing in the workflows or in Control issues one today.

---

## 7. Operator requeue in BoLaGio Control

Page **Automations** (`app/(admin)/admin/(control)/automations/page.tsx`),
board built by `buildAutomationsBoard` (`lib/admin/automations.ts`):

| Group | Rows |
|---|---|
| Failed deliveries ("exhausted or non-retryable") | `failed` with `retryable = false` or `attempts ≥ max_attempts` |
| Retrying | `failed`, retryable, inside the budget |
| Waiting | `pending` or `sending` |
| Recent deliveries | `sent`, `skipped`, `suppressed`, newest 30 |

Only rows in the first group show **Requeue delivery** →
`requeueDeliveryAction` (`lib/admin/actions.ts`): capability
`requeue_automation` (roles `operator`, `admin`; a preview session and
fixture mode are refused), uuid check, then
`bolagio_requeue_message_delivery(id, actor)`. The function moves a **`failed`**
row (any failed row, not only exhausted ones) back to `pending`, sets
`retryable = true`, clears `next_attempt_at` and `claim_expires_at`, raises
`max_attempts` to at least `attempts + 3`, and records `requeued_at` /
`requeued_by`; `attempts` is kept. Any other status returns `false`
("Not requeueable in its current state"). The action is audited as
`delivery.requeue`.

The requeued row is picked up on the **next delivery of the same outbox
event** — the requeue does not itself emit or requeue an event. If the outbox
event was dead-lettered (`exhausted`), the operator also presses **Requeue
event** (`bolagio_requeue_outbox_event`, `exhausted` rows only;
`docs/n8n-booking-contract.md` §3.4). If the event was already acknowledged
(for example after a `failed, retryable` completion the pump failed and then
exhausted, or after a render failure that the pump acked as
`not_retryable`), no automatic path re-delivers it; that gap is not defined in
code.

Health: `MESSAGE_DELIVERY_FAILED` (HIGH) when any delivery is stuck;
`MESSAGE_DELIVERY_BACKLOG` (MEDIUM) when the oldest waiting row is older than
one hour (`lib/ops/alerts.ts`).

---

## 8. Tests

| What | File : test |
|---|---|
| one claim per (booking, kind); `in_progress` for a concurrent worker; `already_sent` on redelivery; one row; no body stored; masked destination | `tests/integration/messaging.test.ts` : `prepares a rendered confirmation once, then reports already_sent — exactly one send per booking` |
| 401 without a signature, no body | `tests/integration/messaging.test.ts` : `refuses an unsigned request with 401 and no body` |
| backoff after a retryable failure; attempt 2; `not_retryable` after `retryable: false` | `tests/integration/messaging.test.ts` : `a failed send is retried after its backoff, and a non-retryable one needs an operator` |
| suppression on cancellation; no `sending` row afterwards | `tests/integration/messaging.test.ts` : `a cancelled booking suppresses every pending guest message and refuses new ones` |
| render failure → `not_retryable`, `failed:false`, nothing sent (missing `MESSAGING_CONTACT_EMAIL`) | `tests/integration/messaging.test.ts` : `a template that cannot render sends nothing and records a non-retryable failure` |
| test transport believed locally, refused on staging (`test_completion_refused`, `failed:false`) | `tests/integration/messaging.test.ts` : `a test transport may report sent locally, but not where a real guest could exist` |
| English template for an `en` guest | `tests/integration/messaging.test.ts` : `renders English for an English-speaking guest` |
| claim → prepare → complete → ack; second ack false; `outbox_event_id` stored; event payload carries no e-mail; `n8n:last_ack` observed | `tests/integration/messaging.test.ts` : `claim → prepare → complete → ack, with the event acknowledged exactly once` |
| ledger at the database: unknown reference, claim, `in_progress`, stale completion ignored, `already_sent` with provider id, separate slot per kind, backoff, `not_retryable`, requeue, suppression leaves `sent` untouched, lapsed lease reclaimed as attempt 2, sequence 2 is its own row | `tests/sql/completion.sql` §3 "The delivery ledger" |
| two concurrent claims → one row, one attempt | `tests/sql/race-delivery.sh` |
| stuck / retrying / waiting / recent grouping; counts; error truncation to 300; no body field | `tests/admin-automations.test.ts` : `separates what needs a person from what the pump will retry`, `counts by outcome`, `truncates errors and never carries a message body` |
| every expected integration signal, "never observed" | `tests/admin-automations.test.ts` : `lists every expected signal as never observed when the table is empty`, `marks only what was observed…`, `every signal the code emits is one the board expects` |
| Control board lists a stuck delivery; requeue once; a sent row cannot be requeued; DTO carries the masked address only | `tests/integration/admin-ops.test.ts` : `lists a failed delivery as stuck, requeues it once, and refuses to requeue a sent one` |
| only an `exhausted` outbox event is requeued | `tests/integration/admin-ops.test.ts` : `requeues only a dead-lettered outbox event` |
| workflow structure and byte-identical build | `tests/n8n-workflows.test.ts` |
