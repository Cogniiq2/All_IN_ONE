# BoLaGio n8n package

Six workflows that turn the BoLaGio backend's durable events into guest
messages, cleaning work items and operator alerts, and that watch the
backend's health. They run on the **shared** Cogniiq/BoLaGio n8n instance
(n8n 1.x, `executionOrder: v1`) and are logically isolated from everything
else on it.

The backend contract they implement is `docs/n8n-booking-contract.md`. If a
workflow and that document disagree, the workflow is wrong.

```
n8n/
  build.mjs                   generator — `node n8n/build.mjs` writes workflows/*.json
  workflows/*.json            the importable n8n exports (generated, committed)
  README.md                   this file
  credentials-matrix.md       every variable and credential, where it is set
  test-mode.md                running the package without sending anything
  runbooks/staging-activation.md
  runbooks/production-activation.md
tests/n8n-workflows.test.ts   structural checks + "build output is byte-identical"
```

---

## 1. What n8n does here — and what it cannot

n8n **transports**. It claims events, asks the backend for a rendered message,
sends it through a transport, and reports back. It does not decide whether a
booking is confirmed, does not render templates, does not compute who gets
which message when, and has no endpoint through which it could change a
booking. The exactly-once guarantee for guest messages is the backend's
delivery ledger (`bolagio_message_deliveries`), not anything in n8n.

Every request to the backend is signed: HMAC-SHA256 over
`v1:<unix seconds>:<raw body>` with `BOLAGIO_N8N_INTERNAL_SECRET`, headers
`x-bolagio-timestamp` and `x-bolagio-signature: v1=<hex>`; a GET signs the
empty string. The body string is built once in a Code node and handed to
n8n's HTTP helper unchanged, so the signature is over the bytes that leave
the node. The same client block (marked `═══ BoLaGio internal API client`)
is copied verbatim into every Code node that talks to the backend;
`tests/n8n-workflows.test.ts` asserts the copies are identical.

---

## 2. The workflows

| File | Name | id | Trigger | Role |
|---|---|---|---|---|
| `bolagio-outbox-event-pump.json` | BoLaGio · Outbox Event Pump | `FEBPCqRDXnNsGHQt` | every 60 s | claim → route → sub-workflow → ack/fail |
| `bolagio-guest-message.json` | BoLaGio · Guest Message | `uGLX4W7hDCGFAzpW` | called by the pump | prepare → transport → complete |
| `bolagio-cleaning-routing.json` | BoLaGio · Cleaning Routing | `Ofnr3ItMsitTJQ6b` | called by the pump | idempotent turnover work item |
| `bolagio-operational-alert.json` | BoLaGio · Operational Alert | `Ms3RTuwUWzoCaAdr` | called by pump / health | alert a person, no guest data |
| `bolagio-health-poll.json` | BoLaGio · Health Poll | `G6nT09jY98fjeRBP` | every 5 min | signed GET health, alert on change |
| `bolagio-error-handler.json` | BoLaGio · Error Handler | `A2cTUS2WXAeObiEM` | Error Trigger | failed execution → alert transport |

Ids are derived from the names by `build.mjs` (SHA-256, 16 characters) and
are what the Execute Workflow nodes point at. See §4 for what that means on
import.

### A · Outbox Event Pump

```
Every 60 seconds
  → Claim events                    Code: signed POST /api/internal/outbox
                                    {action:'claim', worker:'n8n-bolagio', limit:20}
                                    one item per event; no events → nothing else runs
  → Loop over events (batch 1)      Split In Batches v3
      ├─ done → Batch complete      No-Op
      └─ loop → Classify event      Code (per item): version===1 and known type → route
              → Route by type       Switch on $json.route, 9 rules + fallback
                  guest:booking_confirmation → Guest Message · Confirmation   ┐
                  guest:prearrival           → Guest Message · Pre-arrival    │ Execute Workflow
                  guest:checkin              → Guest Message · Check-in       │ → BoLaGio · Guest Message
                  guest:checkout             → Guest Message · Check-out      │   (kind travels in the item)
                  guest:review_request       → Guest Message · Review request ┘
                  cleaning                   → Cleaning Routing               Execute Workflow
                  alert                      → Operational Alert              Execute Workflow
                  silent                     → Handled silently               Code: {ok:true}
                  unsupported / fallback     → Reject unsupported event       Code: {ok:false, error:'unsupported type/version'}
              → Settle event (ack or fail)   Code: ok → ack, else → fail with the error
              → back to Loop over events
```

Event routing:

| Event type (version 1) | Route |
|---|---|
| `booking.confirmed` | guest message `booking_confirmation` |
| `guest.prearrival_ready` | guest message `prearrival` |
| `guest.checkin_ready` | guest message `checkin` |
| `guest.checkout_ready` | guest message `checkout` |
| `review.requested` | guest message `review_request` |
| `cleaning.required`, `cleaning.rescheduled` | cleaning `upsert` |
| `cleaning.cancelled` | cleaning `cancel` |
| `booking.paid_unfinalized`, `booking.manual_review_required`, `booking.release_failed`, `booking.cancellation_requested`, `payment.refunded`, `payment.failed`, `invoice.required` | operational alert (no guest message) |
| `booking.held`, `payment.order_created`, `payment.completed`, `booking.cancelled`, `booking.expired` | acknowledged silently |
| anything else, or `version !== 1` | **failed** with `unsupported type/version` — retried with backoff, dead-lettered after 8 attempts, visible in the ops queue |

The five guest flows are explicit Switch outputs and explicit Execute
Workflow nodes so they can be watched, disabled and re-wired individually,
but they all call the **same** sub-workflow with `kind` in the item. That is
deliberate: the backend decides the template, the recipient and whether the
message is still due; the transport is identical for all five; one
implementation means one place to get it right.

Every Execute Workflow node has *On Error → continue (regular output)*, so a
crashed sub-workflow becomes an item with `error` and the event is **failed**
(retry with backoff) rather than left to a lapsed lease. If *Settle* itself
cannot reach the backend, the execution errors, the Error Handler alerts,
and the five-minute lease lapses — the event is claimed again next time.
That is the at-least-once guarantee doing its job; everything downstream is
idempotent.

### B · Guest Message (sub-workflow, serves all five kinds)

```
When called by the pump                 Execute Workflow Trigger (passthrough)
  → Prepare message                     Code: resolve BOLAGIO_MESSAGING_TRANSPORT (before claiming),
                                        signed POST /api/internal/messages {action:'prepare', kind, reference, eventId}
  → Claimed?                            If $json.outcome === 'claimed'
      ├─ true  → Messaging transport    Switch on $json.transport: disabled | test | smtp (fallback → disabled)
      │             disabled → Skip (transport disabled)        completion {skipped, provider 'disabled'}
      │             test     → Simulate send (test transport)   completion {sent, provider 'test', 'test-<deliveryId>'}
      │             smtp     → Send e-mail (SMTP)               Send Email v2.1, credential "BoLaGio SMTP",
      │                        → Record SMTP result             from BOLAGIO_MAIL_FROM, to message.to
      │        → Complete delivery      Code: signed POST {action:'complete', deliveryId, outcome, provider, …}
      └─ false → Acknowledge without sending
                 already_sent / suppressed / in_progress / backoff / not_retryable → {ok:true}
                 unknown_reference (or anything else)                                → {ok:false}
  → Return result                       {eventId, ok, error?, outcome, sent}
```

Rules, as implemented:

* `claimed` → send → `complete(sent|failed)` → the pump acks (sent, skipped)
  or fails the event (failed). A failed delivery is `complete(failed,
  retryable)` **and** a failed outbox event: the next attempt asks the ledger
  again and gets `backoff` or a fresh claim.
* Not claimed → the pump acks without sending. `in_progress` means another
  worker holds the lease; acking is correct, that worker settles it.
* The guest's address exists only inside the `message` object between
  *Prepare* and the send node. It is never logged, never in an error text
  (`redact()` masks e-mail addresses), never in an alert.
* An invalid `BOLAGIO_MESSAGING_TRANSPORT` value throws **before** a slot
  is claimed: nothing is skipped by accident, the event fails visibly.

### C · Cleaning Routing (sub-workflow)

```
When called by the pump → Build work item → Cleaning transport (disabled | webhook, fallback → disabled)
                                                disabled → Skip (transport disabled)  {ok:true}
                                                webhook  → POST to cleaning webhook   HTTP Request v4.2 → BOLAGIO_CLEANING_WEBHOOK_URL
                                                         → Return result              2xx → {ok:true}; error → {ok:false, error}
```

Work item, posted as JSON:

```json
{ "action": "upsert" | "cancel", "key": "bolagio:turnover:BLG-XXXXXX", "reference": "BLG-XXXXXX",
  "unitSlug": "…", "departure": "…", "nextArrival": "…", "sameDay": false, "windowStart": "…", "windowEnd": "…",
  "previousDeparture": "…" }
```

`required` and `rescheduled` both **upsert** the same `key`; `cancelled`
**cancels** it. A downstream tool that honours the key never holds two tasks
for one turnover, however many times an event is redelivered.

### D · Operational Alert (sub-workflow)

```
When called → Shape alert → Alert transport (disabled | webhook | email, fallback → disabled)
                              disabled → Skip (transport disabled)
                              webhook  → POST to alert webhook   HTTP Request v4.2 → BOLAGIO_ALERT_WEBHOOK_URL
                              email    → Send alert e-mail       Send Email v2.1, "BoLaGio SMTP", to BOLAGIO_ALERT_EMAIL_TO
                           → Return result
```

*Shape alert* accepts either an outbox event (from the pump) or a pre-shaped
`{ alert: {level, code, title, detail, reference?, environment?} }` (from
the Health Poll). The webhook payload is
`{level, code, title, detail, reference, environment, source, text, content}`:
`text` is what Slack and Teams incoming webhooks read, `content` is what
Discord reads, the structured fields are for anything else. Bodies carry a
booking reference and a code — never a name, an address or an amount that
could identify a guest.

### E · Health Poll

```
Every 5 minutes → Poll health and diff state → Operational Alert
```

Signed `GET /api/internal/health`. State is kept in
`$getWorkflowStaticData('global')` and an alert is produced **only on
change**:

| Condition | Alert |
|---|---|
| a `CRITICAL`/`HIGH` code appears that was not active at the last poll | `HEALTH_ALERTS` (level = highest new level) listing the new codes, counts, environment, up to 5 references |
| no `CRITICAL`/`HIGH` left after an alert was raised | `HEALTH_ALL_CLEAR` (MEDIUM) |
| 2 consecutive polls without a verdict (503, 401, unreachable) | `HEALTH_NO_VERDICT` (CRITICAL), once |
| a verdict again after `HEALTH_NO_VERDICT` | `HEALTH_VERDICT_RESTORED` (MEDIUM) |
| same state as last poll, a code disappearing while others remain, MEDIUM-only changes | nothing |

Static data persists for **production** (activated) executions only; a
manual "Test workflow" run starts from an empty state each time.

### F · Error Handler

```
On workflow error → Shape error alert → Alert transport (disabled | webhook | email, fallback → disabled)
```

Referenced by `settings.errorWorkflow` of the other five. It has **no**
`errorWorkflow` of its own, calls **no** other workflow (its transport nodes
are a copy of the Operational Alert's, with the same formatter text), returns
nothing when the failing workflow is itself, and ignores any workflow whose
name does not start with `BoLaGio ·`. An error inside it cannot start a loop.
The alert detail is workflow name, node, execution id and URL, and the error
message with e-mail addresses masked.

---

## 3. Isolation on the shared instance

| Concern | Rule in this package |
|---|---|
| Names | every workflow name starts with `BoLaGio · ` |
| Tags | every workflow carries exactly the tag `bolagio` |
| Environment | every variable read is `BOLAGIO_*` (`$env.BOLAGIO_…`); the test fails on anything else |
| Credentials | only `BoLaGio SMTP` is referenced; no Cogniiq credential can be selected without editing a node |
| Webhooks | none. No workflow exposes an HTTP endpoint; all traffic is outbound. (A future webhook would use the `/bolagio/` path prefix.) |
| Errors | `settings.errorWorkflow` points at `BoLaGio · Error Handler`, which ignores non-BoLaGio workflows |
| Data | the backend is reached only through the three signed internal routes; nothing reads a database |

Two things the instance itself must provide:

* **`$env` in Code nodes and expressions.** n8n blocks `$env` when
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`. This package needs it **`false`**
  (the n8n default). Trade-off, considered: a "BoLaGio Config" Set node
  would avoid that requirement, but it would put the HMAC secret into
  workflow JSON, execution data and every export — the exact thing the
  signed contract exists to avoid. `$env` keeps secrets in the process
  environment where n8n's own encryption key lives, at the cost of one
  instance-level setting that Cogniiq's workflows share. If Cogniiq needs
  `$env` blocked, the alternative is a second n8n instance, not a Set node.
* **`require('crypto')` in Code nodes.** Set `NODE_FUNCTION_ALLOW_BUILTIN`
  to include `crypto` (e.g. `NODE_FUNCTION_ALLOW_BUILTIN=crypto`). Without
  it *Claim events* fails with a module error on the first run.

---

## 4. Importing

The Execute Workflow nodes reference sub-workflows **by id**. Whether those
ids survive the import decides whether anything needs re-wiring.

### 4a. CLI import — ids preserved (recommended)

On the n8n host (or in the container), from a checkout of this repository:

```bash
n8n import:workflow --separate --input=n8n/workflows
```

`--separate` imports every file in the directory as one workflow and keeps
the `id` of each. The Execute Workflow references therefore resolve as
committed and the `errorWorkflow` setting resolves too. Re-running the
command **updates** the existing workflows in place (same ids), which is how
a new version of the package is rolled out. Workflows are imported
**inactive**.

The importer creates or matches the tag `bolagio` by name and resolves the
`BoLaGio SMTP` credential by **name and type** (the id in the JSON is a
placeholder). Create the credential before importing.

Optionally import for a specific user/project: `--userId=<id>` or
`--projectId=<id>` (n8n ≥ 1.4x), so the workflows land in the BoLaGio
project on an instance that uses projects.

### 4b. UI import — ids regenerated

*Workflow → ⋯ → Import from file* works but n8n assigns a **new id** to the
imported workflow. After importing all six this way:

1. Open **BoLaGio · Outbox Event Pump**. In each of the seven Execute
   Workflow nodes (five *Guest Message ·* nodes, *Cleaning Routing*,
   *Operational Alert*) re-select the target workflow from the list.
2. Open **BoLaGio · Health Poll**, re-select *Operational Alert*.
3. In every workflow, *Settings → Error workflow* → select
   **BoLaGio · Error Handler**.
4. Add the tag `bolagio` if the import did not.
5. In the two Send Email nodes (Guest Message, Operational Alert, Error
   Handler) select the credential **BoLaGio SMTP**.

Because of steps 1–3, prefer the CLI. Never fix a broken reference by
editing the JSON by hand: regenerate with `build.mjs` and re-import.

### 4c. Verify on import

Things worth a glance in the UI after either route, because they depend on
the exact n8n version:

* the Switch nodes show nine (pump) / two–three (transports) named outputs
  plus a *Fallback* output;
* the Execute Workflow nodes show the target workflow's name (the id
  resolved);
* the Code nodes open without a "$env is not available" banner;
* the Send Email nodes show the credential as selected.

---

## 5. Configuration

See `credentials-matrix.md` for every variable, where it is set and what it
must never contain. Summary:

| Variable | Purpose | Default |
|---|---|---|
| `BOLAGIO_SITE_URL` | backend base URL, no trailing slash | required |
| `BOLAGIO_N8N_INTERNAL_SECRET` | HMAC secret, identical to `N8N_INTERNAL_SECRET` on the worker | required |
| `BOLAGIO_ENVIRONMENT` | `staging` / `production` label in alerts | `unknown` |
| `BOLAGIO_MESSAGING_TRANSPORT` | `disabled` / `test` / `smtp` | `disabled` |
| `BOLAGIO_MAIL_FROM` | sender for guest mail and alert mail | required for `smtp`/`email` |
| `BOLAGIO_ALERT_TRANSPORT` | `disabled` / `webhook` / `email` | `disabled` |
| `BOLAGIO_ALERT_WEBHOOK_URL` | incoming-webhook URL | required for `webhook` |
| `BOLAGIO_ALERT_EMAIL_TO` | alert recipient | required for `email` |
| `BOLAGIO_CLEANING_TRANSPORT` | `disabled` / `webhook` | `disabled` |
| `BOLAGIO_CLEANING_WEBHOOK_URL` | where turnover work items go | required for `webhook` |

Every transport defaults to `disabled`; a transport set to a value outside
its list makes the workflow fail loudly rather than skip silently.
Changing a variable requires an n8n restart — `$env` is read from the
process environment.

---

## 6. Test mode

`test-mode.md` describes running the whole package against staging with
every transport `disabled` or `test`, so nothing is ever sent, and what to
assert in the backend afterwards. `runbooks/` has the ordered activation
steps for staging and production, including rollback.

---

## 7. Regenerating

Edit `build.mjs`, then:

```bash
node n8n/build.mjs
npx vitest run tests/n8n-workflows.test.ts
```

The test regenerates into a temporary directory and compares byte for byte,
so a committed JSON that was edited by hand fails CI. Ids are derived from
names: renaming a workflow changes its id, which is a new workflow on the
instance — rename deliberately and re-import with the CLI.
