# Cleaning operations — turnovers, the board, and the routing

A turnover is a fact the booking core derives from a confirmed departure.
Nothing in this document invents one, and nothing here knows an access code
or a cleaner's phone number. Sources: section 4 of
`supabase/migrations/20260921120000_platform_completion.sql`,
`lib/booking/commands.ts`, `lib/admin/cleaning.ts`, `lib/admin/actions.ts`,
`app/(admin)/admin/(control)/cleaning/page.tsx`, `lib/ops/alerts.ts`,
`n8n/workflows/bolagio-cleaning-routing.json`, and the tests in §6. The
foundation (house rules, timing columns) is `docs/guest-operations.md`.

---

## 1. Turnovers are derived facts

`bolagio_sync_turnovers(p_horizon_days default 60, p_now default now())`
runs inside the operations pass (`runOperationsPass` in
`lib/booking/operations.ts`, called from `POST /api/booking/reconcile`), via
`syncTurnovers(horizonDays = 60)` in `lib/booking/commands.ts`. `p_now` is an
injectable clock so DST and same-day cases are provable in SQL; the
application never passes it.

### Which stays

Every intent with `status = confirmed` whose `check_out` lies between
**yesterday** and **today + horizon** (horizon clamped to 1–365), where
"today" is `p_now` in the **unit's timezone** (`bolagio_units.timezone`).
One row per stay in `bolagio_turnovers`, keyed on `intent_id` (unique).

### The window

```
window_start = (check_out + unit.check_out_time) at time zone unit.timezone
window_end   = (check_out + unit.check_in_time)  at time zone unit.timezone
```

Local wall-clock on the departure day, converted in the unit's zone — so a
window of 11:00–14:00 Europe/Berlin is 09:00–12:00 UTC in summer and
10:00–13:00 UTC in winter (`tests/sql/completion.sql` §5).

### Same-day

`next_arrival` = the earliest `check_in` of another **confirmed** intent on
the same unit with `check_in >= check_out`. `same_day = (next_arrival =
check_out)`, false when there is no next arrival.

### What one pass does

| Situation | Effect | Audit (`bolagio_turnover_events`) | Outbox event |
|---|---|---|---|
| no turnover for a confirmed stay in range | insert `required` | — | `cleaning.required` |
| turnover is `void` and the stay is `confirmed` again | update, `status = required` | `void → required`, actor `system`, "stay confirmed again" | `cleaning.required` (counted as created) |
| `departure`, `next_arrival` or `same_day` changed | update window, next arrival, same-day | — | `cleaning.rescheduled` with `previousDeparture` |
| … and the turnover was `done` and the **departure** moved | additionally `status = required`, `done_at` and `done_by` cleared ("the cleaning already done was for another day") | `done → required`, actor `system`, "departure moved from X to Y" | `cleaning.rescheduled` (counted as reopened and updated) |
| turnover `required` or `in_progress` and its stay is no longer `confirmed` (any other status) | `status = void`; never deleted | `<status> → void`, actor `system`, "stay no longer confirmed" | `cleaning.cancelled` |

A `done` turnover whose stay leaves `confirmed` is left as `done`. A `done`
turnover whose next arrival changes (departure unchanged) is updated and
announced as rescheduled but stays `done`. A second pass with nothing
changed writes nothing (`created/updated/voided/reopened` all 0).

Return value: `{ created, updated, voided, reopened }`.

### Payloads

| Event | `aggregate_type` | Payload |
|---|---|---|
| `cleaning.required` | `turnover` | `reference`, `unitSlug`, `departure`, `nextArrival`, `sameDay`, `windowStart`, `windowEnd` |
| `cleaning.rescheduled` | `turnover` | the same, plus `previousDeparture` |
| `cleaning.cancelled` | `turnover` | `reference`, `unitSlug`, `departure` |

`aggregate_id` is the intent id in all three. No guest data.

---

## 2. Statuses and the audit trail

`bolagio_turnovers.status` (constraint `bolagio_turnovers_status_check`):
`required`, `in_progress`, `done`, `void`. Columns added by this migration:
`assigned_to` (≤120), `note` (≤400), `started_at`. Pre-existing: `done_at`,
`done_by`, `departure`, `window_start`, `window_end`, `next_arrival`,
`same_day`.

### Operator transitions — `bolagio_set_turnover_status(id, to, actor, note)`

| From → to | Allowed | Side effects |
|---|---|---|
| `required → in_progress` | yes | `started_at = coalesce(started_at, now())` |
| `required → done`, `in_progress → done` | yes | `done_at = now()`, `done_by = actor` |
| `in_progress → required`, `done → required` | yes (an explicit reopen) | `done_at`, `done_by` cleared |
| same status | no-op, `{ ok: true, noop: true }` | nothing written |
| any → `void` | refused `SYNC_ONLY` — "a turnover is void because its stay left `confirmed`, never because someone pressed a key" | — |
| from `void` | refused `VOIDED` | — |
| `done → in_progress`, anything else | refused `ILLEGAL` | — |
| unknown id | refused `NOT_FOUND` | — |

`note` replaces the stored note when given (`coalesce(left(p_note, 400),
note)`). Every accepted move appends to `bolagio_turnover_events`.

### Assignment — `bolagio_assign_turnover(id, assignee, actor)`

Sets `assigned_to` (empty string → null, i.e. unassigned) on any non-void
turnover; returns `false` for an unknown or void id. Appends an event with
`from_status = to_status` and the note `assigned: <name>` or `unassigned`.

### `bolagio_turnover_events`

Append-only: `turnover_id` (cascade delete), `from_status` (null on a
create-time event — none is written today), `to_status`, `actor` (default
`system`), `note`, `created_at`. Index `(turnover_id, created_at desc)`.
RLS enabled, revoked from `anon` and `authenticated`. Comment: "No guest
data." The application reads it through `loadTurnoverEvents` →
`TurnoverEventDto`.

The rollback (`supabase/ops/rollback_20260921.sql`) refuses while any
turnover is `in_progress`; otherwise it maps `in_progress` back to
`required` and drops the three columns and the events table.

---

## 3. The board in BoLaGio Control

`/admin/cleaning` (`app/(admin)/admin/(control)/cleaning/page.tsx`), data
from `loadCleaningBoard()` (`lib/admin/queries.ts`): open turnovers
(`required`, `in_progress`, up to 200) plus `done`/`void` rows with a
departure in the last 14 days (up to 40), passed to `buildCleaningBoard(rows,
today, now)` in `lib/admin/cleaning.ts`. `today` is the property's local
date (`propertyTodayIso`). Refreshes every 120 s.

### Attention (`turnoverAttention`)

The single most pressing reason to look at a turnover, evaluated in this
order; closed turnovers (`done`, `void`) never need attention:

| Attention | Condition |
|---|---|
| `overdue` | `window_end < now` |
| `due_today` | `departure = today` |
| `same_day` | `same_day` is true |
| `unassigned` | `status = required`, no `assigned_to`, and `departure − today ≤ 3` days (`UNASSIGNED_HORIZON_DAYS`) |
| `null` | on track |

### Groups

| Group | Rows | Order |
|---|---|---|
| Overdue | open, attention `overdue` | oldest `window_end` first |
| Today | open, not overdue, `departure = today` | by attention rank, then same-day first, then `window_start`, then unit name |
| Upcoming | open, not overdue, `departure > today` | by departure, then the same urgency order |
| Recently closed | `done` and `void` | most recently updated first, at most 20 |

Counts shown in the header: `open`, `overdue`, `sameDay` (open and
same-day), `unassigned` (open, `required`, no assignee — **not** limited to
the three-day horizon). `unitName` comes from `lib/content/apartments.ts`,
never the slug alone.

### Actions and roles

`setTurnoverStatusAction(id, to, note?)` and `assignTurnoverAction(id,
assignee)` in `lib/admin/actions.ts`, both behind capability
`manage_cleaning` (roles `operator` and `admin`; `viewer` reads only; a
preview session and fixture mode are refused). `to` must be one of
`required`, `in_progress`, `done` — `void` is not an operator target. Notes
are trimmed to 300 characters, assignee names to 80. Each call is audited
(`turnover.status` with from/to, or `turnover.assign`) and revalidates
`/admin/cleaning`. A refusal from the database is returned as `refused` with
its code.

The page states what it does not do: routing to a person or a calendar
happens in the automation platform from the cleaning events, not from this
screen. The booking detail page shows the booking's own turnovers
(`loadTurnoversForBooking`).

---

## 4. n8n cleaning routing

Workflow **BoLaGio · Cleaning Routing**
(`n8n/workflows/bolagio-cleaning-routing.json`), a sub-workflow the Outbox
Event Pump calls for `cleaning.required` and `cleaning.rescheduled`
(`cleaningAction = upsert`) and `cleaning.cancelled` (`cancel`).

```
Build work item        resolve BOLAGIO_CLEANING_TRANSPORT (disabled | webhook; else throw)
                       require a well-formed reference; build the work item
Cleaning transport     disabled → Skip           {ok:true, outcome:'skipped'} — the pump acks
                       webhook  → POST BOLAGIO_CLEANING_WEBHOOK_URL (JSON, 15 s timeout)
                                  → Return result 2xx → {ok:true, outcome:'delivered'}; error → {ok:false} — the pump fails the event (retry, dead-letter after 8)
```

Work item:

```json
{ "action": "upsert" | "cancel", "key": "bolagio:turnover:BLG-XXXXXX", "reference": "BLG-XXXXXX",
  "unitSlug": "…", "departure": "…", "nextArrival": "…", "sameDay": false,
  "windowStart": "…", "windowEnd": "…", "previousDeparture": "…" }
```

`key` is deterministic per stay, so `required` and `rescheduled` upsert the
same item and `cancelled` cancels it — a downstream tool that honours the key
never holds two tasks for one turnover, however often an event is
redelivered. Missing payload fields are sent as `null`; `previousDeparture`
only when present. Error texts pass through `redact()` (e-mail addresses
masked, 400 characters).

What it never does: write to the backend (there is no endpoint for it),
change a turnover's status or assignee, read the database, carry guest data
(the payload has none), or send anything while the transport is `disabled`
(the default). Configuration names: `BOLAGIO_CLEANING_TRANSPORT`,
`BOLAGIO_CLEANING_WEBHOOK_URL` (`n8n/README.md` §5).

---

## 5. Alerts

From `deriveAlerts` in `lib/ops/alerts.ts`, fed by `loadAlerts` in
`lib/admin/queries.ts` with `turnovers = { overdue: board.counts.overdue,
unassignedSoon: <rows in Today and Upcoming whose attention is 'unassigned'> }`:

| Code | Level | When | Count |
|---|---|---|---|
| `TURNOVER_OVERDUE` | HIGH | `overdue > 0` | overdue turnovers |
| `TURNOVER_UNASSIGNED` | MEDIUM | `overdue = 0` and `unassignedSoon > 0` (an `else if`: never alongside `TURNOVER_OVERDUE`) | turnovers within three days with no assignee |

`unassignedSoon` counts rows whose *most pressing* attention is
`unassigned`; a turnover that is due today or same-day and unassigned is
ranked by that stronger reason and not counted here. When the board cannot be
loaded, `turnovers` is `null` and the report lists `turnovers` under
`notInstrumented` rather than reporting it as fine.

---

## 6. Tests

| What | File : test |
|---|---|
| create; operator cannot void; `required → in_progress → done` with `started_at`/`done_at`/`done_by`; two audit events; `done → in_progress` illegal; assignment stored | `tests/sql/completion.sql` §4 "Turnover operations" |
| moved departure reopens a `done` turnover, clears `done_at`, emits `cleaning.rescheduled` once, `cleaning.required` still once | `tests/sql/completion.sql` §4 |
| same-day flagged when the next confirmed arrival is the departure day | `tests/sql/completion.sql` §4 |
| cancellation voids, emits `cleaning.cancelled`; a second pass is a no-op | `tests/sql/completion.sql` §4 |
| window across spring-forward (09:00–12:00 UTC) and fall-back (10:00–13:00 UTC) with the injectable clock | `tests/sql/completion.sql` §5 |
| a cancelled paid booking has no open turnover after reconcile (the table is empty for it) | `tests/integration/cancellation.test.ts` : `D/H — confirmed and paid: …` (last assertion) |
| board shows a derived turnover as upcoming with no attention; assign, start (noop repeat), done; three audit rows; moves to Recently closed; per-booking view | `tests/integration/admin-ops.test.ts` : `shows a turnover derived from a confirmed departure, and the status commands obey the ledger` |
| unknown turnover refused `NOT_FOUND` | `tests/integration/admin-ops.test.ts` : `a turnover cannot be voided by an operator, and an unknown one is refused` |
| attention: closed never; overdue outranks everything; today > same-day > unassigned; unassigned only inside 3 days and only while `required` | `tests/admin-cleaning.test.ts` : `turnoverAttention` (4 cases) |
| grouping into exactly one group; ordering; counts; unit name from content | `tests/admin-cleaning.test.ts` : `buildCleaningBoard` (3 cases) |
| health report: `turnovers` instrumented after a real pass | `tests/integration/admin-ops.test.ts` : `reports every signal never observed on a fresh database, and observed after real traffic` |
| workflow structure and byte-identical build | `tests/n8n-workflows.test.ts` |
| rollback refuses on `in_progress` | `supabase/ops/rollback_20260921.sql`; exercised by `./scripts/db-ops-check.sh` |
