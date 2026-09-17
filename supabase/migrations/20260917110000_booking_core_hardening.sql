-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — booking core, part 2 of 2: the transactional core.
--
-- Depends on 20260917100000_booking_core_states.sql having COMMITTED. See the
-- header of that file for why the split is mandatory rather than stylistic.
--
-- ── What this migration is for ────────────────────────────────────────────
-- The 2026-09-16 foundation gave the website somewhere to write a booking.
-- This one makes the booking SURVIVE things going wrong: a Beds24 POST that
-- times out after it took effect, a PayPal webhook delivered nine times, an
-- n8n instance that is offline for six hours, two guests pressing Book in the
-- same second, a payment that completes while a hold lease is expiring.
--
-- The organising rule is: **every hard guarantee is a database object.**
-- Application code may be redeployed, rewritten, called from a worker, an Edge
-- Function, a cron job or a psql session. A constraint cannot be forgotten.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — the state vocabulary, as functions
-- ══════════════════════════════════════════════════════════════════════════

-- ── Which states reserve inventory ─────────────────────────────────────────
--
-- The single most consequential definition in this file.
--
-- A state reserves the local date range from the moment we begin acquiring an
-- external hold until we have POSITIVELY established that no external hold
-- exists. That deliberately includes states that look like failures:
--
--   expired          the lease ran out. The Beds24 hold is still there.
--   payment_failed   the guest's card was declined. The hold is still there.
--   release_failed   we asked Beds24 to cancel and do not know if it did.
--   manual_review    we do not know what is true. Assume the worst.
--
-- Releasing the local range before the external hold is provably gone is how a
-- database ends up advertising a night that Booking.com has already sold.
-- Being wrong in this direction costs one unsold night; being wrong in the
-- other direction costs a guest their holiday.
create or replace function bolagio_status_reserves(s bolagio_booking_status)
returns boolean language sql immutable parallel safe as $$
  select s not in (
    'draft',          -- nothing acquired yet
    'quoted',         -- nothing acquired yet
    'quote_expired',  -- nothing acquired yet
    'unavailable',    -- the provider said no; nothing was created
    'hold_failed',    -- the provider answered, and the answer was no
    'released',       -- the release was verified
    'cancelled'       -- terminal, and only reachable from the above
  );
$$;

comment on function bolagio_status_reserves is
  'True when a booking intent in this state must block its date range locally.';

-- ── The transition table ───────────────────────────────────────────────────
--
-- Read docs/booking-state-machine.md for the diagram. Two properties worth
-- naming here because they are load-bearing:
--
--   * `expired → paid` and `payment_failed → paid` are LEGAL. A verified
--     capture that arrives after we gave up must win. The alternative is
--     keeping a guest's money and telling them their booking expired.
--   * `confirmed → cancelled` is NOT legal. A confirmed reservation leaves
--     through `releasing → released → cancelled` or through `manual_review`,
--     so a cancellation can never free the local range before the Beds24 side
--     is dealt with.
create or replace function bolagio_transition_allowed(
  p_from bolagio_booking_status,
  p_to   bolagio_booking_status
) returns boolean language sql immutable parallel safe as $$
  -- Compared as text: the CASE arms are text[] literals, and casting the whole
  -- CASE to the enum array type inside an ANY(...) is not how the parser binds it.
  select p_to::text = any (
    case p_from
      when 'draft' then
        array['quoted','unavailable','quote_expired','cancelled']
      when 'quoted' then
        array['quoted','locking','quote_expired','unavailable','cancelled']
      when 'quote_expired' then
        array['quoted','cancelled']
      when 'unavailable' then
        array['quoted','cancelled']
      when 'locking' then
        array['hold_created','hold_failed','unavailable','releasing','manual_review']
      when 'hold_failed' then
        array['quoted','cancelled','manual_review']
      when 'hold_created' then
        array['payment_session_created','awaiting_payment','payment_pending','paid',
              'payment_failed','payment_cancelled','expired','releasing','manual_review']
      when 'payment_session_created' then
        array['awaiting_payment','payment_pending','paid','payment_failed',
              'payment_cancelled','expired','releasing','manual_review']
      when 'awaiting_payment' then
        array['payment_pending','paid','payment_failed','payment_cancelled',
              'expired','releasing','manual_review']
      when 'payment_pending' then
        array['paid','payment_failed','payment_cancelled','expired','releasing','manual_review']
      when 'payment_failed' then
        array['payment_session_created','awaiting_payment','paid','expired',
              'releasing','manual_review']
      when 'payment_cancelled' then
        array['payment_session_created','awaiting_payment','paid','expired',
              'releasing','manual_review']
      when 'expired' then
        array['paid','releasing','manual_review']
      when 'paid' then
        array['finalizing','paid_unfinalized','confirmed','manual_review']
      when 'finalizing' then
        array['confirmed','finalization_failed','paid_unfinalized','manual_review']
      when 'paid_unfinalized' then
        array['finalizing','confirmed','finalization_failed','manual_review']
      when 'finalization_failed' then
        array['finalizing','confirmed','paid_unfinalized','manual_review']
      when 'confirmed' then
        array['releasing','manual_review']
      when 'releasing' then
        array['released','release_failed','manual_review']
      when 'release_failed' then
        array['releasing','released','manual_review']
      when 'released' then
        array['cancelled','manual_review']
      when 'manual_review' then
        array['confirmed','finalizing','releasing','released','paid_unfinalized','cancelled']
      else array[]::text[]
    end
  );
$$;

create or replace function bolagio_payment_transition_allowed(
  p_from bolagio_payment_status,
  p_to   bolagio_payment_status
) returns boolean language sql immutable parallel safe as $$
  select case
    -- 'unknown' is a reconciliation input, not a conclusion. Any later
    -- authoritative read of the provider may replace it — and any state may
    -- fall INTO it, because discovering a second capture or an unresolvable
    -- provider answer genuinely destroys what we thought we knew. Refusing
    -- that edge would force the code to keep asserting 'paid' while holding
    -- evidence that contradicts it.
    when p_from = 'unknown' or p_to = 'unknown' then true
    when p_from = p_to then true
    else p_to::text = any (
      case p_from
        -- A verified webhook can teach us about an order whose creation
        -- response we never received. Refusing to learn it would mean holding
        -- a guest's money in a booking our own column calls unpaid.
        when 'not_created'        then array['order_created','approved','capture_pending','paid','denied','cancelled']
        when 'order_created'      then array['approved','capture_pending','paid','denied','cancelled','unknown']
        when 'approved'           then array['capture_pending','paid','denied','cancelled','unknown']
        when 'capture_pending'    then array['paid','denied','cancelled','unknown']
        when 'paid'               then array['refunded','partially_refunded','disputed']
        when 'denied'             then array['order_created','unknown']
        when 'cancelled'          then array['order_created','unknown']
        when 'refunded'           then array['disputed']
        when 'partially_refunded' then array['refunded','disputed']
        when 'disputed'           then array['refunded','partially_refunded','paid']
        else array[]::text[]
      end
    )
  end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — booking intents: the columns recovery needs
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every column here answers one question: "if the browser, n8n, the worker and
-- the isolate all disappeared right now, could a cold process work out what to
-- do from this row alone?" Nothing is duplicated for convenience.

alter table bolagio_booking_intents
  -- Payment, modelled separately from the reservation. See the enum comment.
  add column if not exists payment_status bolagio_payment_status not null default 'not_created',
  -- The provider's order and capture. Both are needed: an order is what you
  -- query to find out what happened, a capture is what you refund.
  add column if not exists payment_order_id text,
  add column if not exists payment_capture_id text,
  -- What was ACTUALLY taken, which is not necessarily what was quoted. A
  -- mismatch between these and quoted_total_cents is a manual_review trigger,
  -- never something to average out.
  add column if not exists paid_amount_cents integer
    check (paid_amount_cents is null or paid_amount_cents >= 0),
  add column if not exists paid_currency char(3),
  add column if not exists refunded_amount_cents integer not null default 0
    check (refunded_amount_cents >= 0),

  -- The local lock lease. `locking` reserves the range, so a lock that is
  -- never resolved would block the dates forever; this is what lets a later
  -- transaction reclaim it. Short — it only has to cover one Beds24 POST.
  add column if not exists lock_expires_at timestamptz,

  -- Snapshots taken when the hold was acquired. The mapping table can change;
  -- a booking must still be releasable against the ids it was actually made
  -- with. This is what makes recovery independent of current configuration.
  add column if not exists beds24_property_id text,
  add column if not exists beds24_room_id text,
  add column if not exists beds24_status text,
  add column if not exists beds24_verified_at timestamptz,

  -- A hash of the authoritative quote, so a quote can be compared without
  -- re-deriving it, and a version so a future pricing change is detectable.
  add column if not exists quote_hash text,
  add column if not exists quote_version smallint not null default 1,

  -- Operational vocabulary. `last_failure_code` is one of the codes in
  -- lib/booking/errors.ts — a closed set, queryable, never free text.
  add column if not exists last_failure_code text,
  add column if not exists last_failure_reason text,
  add column if not exists last_failure_at timestamptz,
  add column if not exists reconciliation_state text not null default 'ok'
    check (reconciliation_state in ('ok','pending','failed','manual')),

  add column if not exists confirmed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists paid_at timestamptz;

-- A booking may only ever be attached to ONE provider order, and an order to
-- one booking. Without this, a bug that reuses an order id silently merges two
-- guests' payments.
create unique index if not exists bolagio_booking_intents_payment_order_uq
  on bolagio_booking_intents (payment_order_id) where payment_order_id is not null;
create unique index if not exists bolagio_booking_intents_payment_capture_uq
  on bolagio_booking_intents (payment_capture_id) where payment_capture_id is not null;

-- Beds24 booking ids are already indexed; make the uniqueness explicit. Two
-- BoLaGio intents pointing at one Beds24 reservation is a data corruption we
-- want to hear about at write time.
drop index if exists bolagio_booking_intents_beds24_idx;
create unique index if not exists bolagio_booking_intents_beds24_uq
  on bolagio_booking_intents (beds24_booking_id) where beds24_booking_id is not null;

-- The reconciliation sweeps' working set.
create index if not exists bolagio_booking_intents_recon_idx
  on bolagio_booking_intents (status, updated_at)
  where reconciliation_state <> 'ok'
     or status in ('locking','hold_created','payment_session_created','awaiting_payment',
                   'payment_pending','paid','finalizing','paid_unfinalized',
                   'finalization_failed','releasing','release_failed','manual_review');

create index if not exists bolagio_booking_intents_lock_idx
  on bolagio_booking_intents (lock_expires_at) where status = 'locking';

-- ── The overbooking constraint, widened ────────────────────────────────────
--
-- The foundation's predicate covered four states. It now covers every
-- reserving state — which, critically, includes `locking`. The old constraint
-- only began to protect AFTER the Beds24 hold had been created, so two
-- simultaneous direct bookings could both reach Beds24 and the loser's hold
-- would be orphaned. The lock is now taken FIRST, locally, atomically, and the
-- loser never makes an external call at all.
do $$ begin
  alter table bolagio_booking_intents drop constraint if exists bolagio_booking_intents_no_overlap;
end $$;

do $$ begin
  alter table bolagio_booking_intents
    add constraint bolagio_booking_intents_no_overlap
    exclude using gist (unit_id with =, stay_range with &&)
    where (bolagio_status_reserves(status));
exception when duplicate_object then null; end $$;

comment on constraint bolagio_booking_intents_no_overlap on bolagio_booking_intents is
  'Two intents reserving inventory may never overlap on one unit. Half-open [check_in, check_out), so a checkout and the next check-in on the same day do not conflict.';

-- ── The transition guard ───────────────────────────────────────────────────
--
-- Until now the state machine lived only in TypeScript, which meant anything
-- holding the service role key — an n8n HTTP node, a psql session, a future
-- admin app — could write `status = 'confirmed'` directly. This trigger makes
-- that impossible: a status change is only accepted from inside
-- `bolagio_booking_transition()` and the command functions built on it, which
-- set a transaction-local flag before writing and clear it immediately after.
create or replace function bolagio_booking_status_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('bolagio.transition_ok', true), 'no') <> 'yes' then
      raise exception
        'bolagio: direct status change % -> % is not permitted; use bolagio_booking_transition()',
        old.status, new.status
        using errcode = 'check_violation';
    end if;
    if not bolagio_transition_allowed(old.status, new.status) then
      raise exception 'bolagio: illegal transition % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status
     and not bolagio_payment_transition_allowed(old.payment_status, new.payment_status) then
    raise exception 'bolagio: illegal payment transition % -> %',
      old.payment_status, new.payment_status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists bolagio_booking_intents_status_guard on bolagio_booking_intents;
create trigger bolagio_booking_intents_status_guard
  before update on bolagio_booking_intents
  for each row execute function bolagio_booking_status_guard();

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — the transactional outbox
-- ══════════════════════════════════════════════════════════════════════════
--
-- Written in the SAME TRANSACTION as the state change that caused it. That is
-- the whole point and the only reason this table exists rather than an inline
-- HTTP call to n8n: an event and the fact it describes commit together or not
-- at all. n8n being offline for six hours loses nothing.
--
-- ── What may go in a payload ──────────────────────────────────────────────
-- References and operational facts: a BoLaGio reference, a unit slug, dates, a
-- night count, an amount, a currency, a status, a failure code. NOT a guest
-- name, email, phone or address. n8n fetches those over the authenticated
-- internal API when it genuinely needs them, so guest PII is never sitting in
-- a queue table, a webhook log or an n8n execution history.

create table if not exists bolagio_outbox_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,
  -- Schema version of `payload`, so n8n can refuse a shape it does not know
  -- rather than silently mis-reading it.
  event_version  smallint not null default 1,
  aggregate_type text not null default 'booking_intent',
  aggregate_id   uuid,
  -- The guest-facing reference, denormalised so an operator reading this table
  -- does not have to join to identify a booking.
  reference      text,
  payload        jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  -- Retry backoff lives here, so a claim is a pure `available_at <= now()`.
  available_at   timestamptz not null default now(),
  claimed_at     timestamptz,
  claimed_by     text,
  claim_expires_at timestamptz,
  attempts       smallint not null default 0,
  processed_at   timestamptz,
  last_error     text,
  status         bolagio_job_status not null default 'pending'
);

create index if not exists bolagio_outbox_claimable_idx
  on bolagio_outbox_events (available_at, created_at)
  where status in ('pending','claimed');

create index if not exists bolagio_outbox_reference_idx
  on bolagio_outbox_events (reference) where reference is not null;

comment on table bolagio_outbox_events is
  'Durable operational events for n8n. Written in the same transaction as the state change. Contains references, never guest PII.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — the payment event inbox
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keyed on the PROVIDER's event id, which is the only identity a provider
-- guarantees to be stable across redeliveries. The Beds24 table
-- (`bolagio_integration_events`) keys on a payload hash, which is right for a
-- provider that sends no event id and wrong here: PayPal can legitimately send
-- two distinct events with identical bodies.
--
-- Ingestion and processing are separate columns and separate code paths.
-- PayPal must get its 2xx within seconds; finalizing a Beds24 booking must not
-- be on that critical path.

create table if not exists bolagio_payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           bolagio_external_provider not null default 'paypal',
  -- PayPal's `id` (WH-…). UNIQUE per provider — this is the deduplication.
  provider_event_id  text not null,
  event_type         text not null,
  -- The provider's own timestamp, and the transmission time from the signature
  -- header. Both are kept: out-of-order delivery is diagnosed by comparing them.
  event_time         timestamptz,
  transmission_time  timestamptz,
  transmission_id    text,

  -- 'verified' is the ONLY value the processor acts on.
  verification       text not null default 'unverified'
    check (verification in ('verified','failed','unverified','skipped')),

  -- Sanitized. The ingress strips everything that is not needed downstream —
  -- see supabase/functions/paypal-webhook/index.ts. No payer address, no
  -- payment instrument detail, no access token.
  payload            jsonb not null,

  -- Extracted for indexed lookup, so the processor does not scan jsonb.
  order_id           text,
  capture_id         text,
  reference          text,
  amount_cents       integer,
  currency           char(3),

  status             bolagio_job_status not null default 'pending',
  attempts           smallint not null default 0,
  available_at       timestamptz not null default now(),
  claimed_at         timestamptz,
  claimed_by         text,
  last_error         text,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,

  unique (provider, provider_event_id)
);

create index if not exists bolagio_payment_events_pending_idx
  on bolagio_payment_events (available_at, received_at)
  where status in ('pending','claimed');
create index if not exists bolagio_payment_events_order_idx
  on bolagio_payment_events (order_id) where order_id is not null;
create index if not exists bolagio_payment_events_reference_idx
  on bolagio_payment_events (reference) where reference is not null;

comment on table bolagio_payment_events is
  'Durable, deduplicated payment webhook inbox. Unique on (provider, provider_event_id): repeated delivery is harmless by construction.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — external operations
-- ══════════════════════════════════════════════════════════════════════════
--
-- The table that makes "we do not know what happened" a first-class, queryable
-- fact instead of a caught exception.
--
-- PostgreSQL cannot transact with Beds24 or PayPal. When we POST to create a
-- booking and the connection dies before the response arrives, there are three
-- possibilities and we cannot distinguish them locally:
--
--   the request never arrived            → safe to retry
--   it arrived and was rejected          → safe to retry
--   it arrived and CREATED A BOOKING     → retrying double-books
--
-- The previous implementation assumed the first two. This table refuses to
-- assume: the row is written BEFORE the call, marked `outcome_unknown` on a
-- timeout, and the reconciliation engine must READ the provider and resolve it
-- before any retry is permitted.

create table if not exists bolagio_external_operations (
  id              uuid primary key default gen_random_uuid(),
  -- Deterministic. Derived from the operation and its subject, never random,
  -- so a retry of the same logical operation finds the same row.
  -- e.g. 'beds24:create_hold:<intent uuid>', 'paypal:capture:<order id>'
  operation_key   text not null unique,
  provider        bolagio_external_provider not null,
  operation_type  text not null,
  intent_id       uuid references bolagio_booking_intents(id) on delete set null,

  -- What we asked for, reduced to the fields needed to recognise the result at
  -- the provider. Not the full request; no guest PII beyond what identifies
  -- the reservation.
  request_summary jsonb,
  -- The provider's id for whatever this created, once known.
  resource_id     text,

  outcome         bolagio_operation_outcome not null default 'in_flight',
  attempts        smallint not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  uncertain_at    timestamptz,
  reconciled_at   timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

create index if not exists bolagio_external_ops_unknown_idx
  on bolagio_external_operations (uncertain_at)
  where outcome = 'outcome_unknown';
create index if not exists bolagio_external_ops_intent_idx
  on bolagio_external_operations (intent_id, started_at desc);

comment on table bolagio_external_operations is
  'Every non-idempotent external mutation. outcome_unknown is a state, not an error: it must be reconciled against the provider before any retry.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — reconciliation jobs
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists bolagio_reconciliation_jobs (
  id             uuid primary key default gen_random_uuid(),
  intent_id      uuid references bolagio_booking_intents(id) on delete cascade,
  reference      text,
  -- One of the reasons in lib/booking/errors.ts. A closed set.
  reason         text not null,
  severity       smallint not null default 3 check (severity between 1 and 5),
  detail         jsonb,

  status         bolagio_job_status not null default 'pending',
  attempts       smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at     timestamptz,
  claimed_by     text,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolution     text
);

-- One OPEN job per (intent, reason). A sweep that runs every minute must not
-- create a thousand identical jobs for one stuck booking.
create unique index if not exists bolagio_reconciliation_open_uq
  on bolagio_reconciliation_jobs (intent_id, reason)
  where status in ('pending','claimed','failed');

create index if not exists bolagio_reconciliation_due_idx
  on bolagio_reconciliation_jobs (next_attempt_at, severity)
  where status in ('pending','failed');

comment on table bolagio_reconciliation_jobs is
  'Recovery work queue. severity 1 is highest: paid-but-unfinalized and release failures.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — the command functions
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── The security model ────────────────────────────────────────────────────
-- These are SECURITY INVOKER (the default), deliberately. The only role that
-- calls them is `service_role`, which already bypasses RLS, so SECURITY
-- DEFINER would add privilege without adding capability — and a DEFINER
-- function with a mutable search_path is a well-known escalation vector. Every
-- function nonetheless pins `search_path` so a schema injected earlier in the
-- path cannot shadow a table name.
--
-- EXECUTE is revoked from anon and authenticated at the bottom of this file.
-- A leaked publishable key can call none of them.

-- ── The primitive every transition goes through ───────────────────────────
--
-- Compare-and-set on `p_expected`: if the row has moved since the caller read
-- it, this returns false and writes nothing. Two concurrent callbacks cannot
-- both move one booking.
create or replace function bolagio_booking_transition(
  p_intent_id  uuid,
  p_expected   bolagio_booking_status,
  p_to         bolagio_booking_status,
  p_reason     text default null,
  p_patch      jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_outbox_type text default null,
  p_outbox_payload jsonb default null
) returns bolagio_booking_intents
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row bolagio_booking_intents;
  v_from bolagio_booking_status;
begin
  -- Lock the row for the duration. Everything below — the legality check, the
  -- write, the audit row and the outbox row — is one atomic decision.
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then
    raise exception 'bolagio: booking intent % not found', p_intent_id
      using errcode = 'no_data_found';
  end if;
  v_from := v_row.status;

  -- Stale expected-state. The caller read an older row; refuse silently and
  -- let it re-read. This is the mechanism that makes duplicate webhook
  -- deliveries harmless rather than corrupting.
  if p_expected is not null and v_row.status <> p_expected then
    return null;
  end if;

  -- Idempotent repeat. Re-quoting is the one legitimate same-state write,
  -- because it genuinely rewrites the authoritative total.
  if v_from = p_to and p_to <> 'quoted' then
    return v_row;
  end if;

  if not bolagio_transition_allowed(v_from, p_to) then
    return null;
  end if;

  perform set_config('bolagio.transition_ok', 'yes', true);

  update bolagio_booking_intents set
    status               = p_to,
    quoted_total_cents   = coalesce((p_patch->>'quoted_total_cents')::integer, quoted_total_cents),
    quote_components     = coalesce(p_patch->'quote_components', quote_components),
    quote_hash           = coalesce(p_patch->>'quote_hash', quote_hash),
    quote_expires_at     = coalesce((p_patch->>'quote_expires_at')::timestamptz, quote_expires_at),
    currency             = coalesce(p_patch->>'currency', currency),
    hold_expires_at      = case when p_patch ? 'hold_expires_at'
                             then (p_patch->>'hold_expires_at')::timestamptz
                             else hold_expires_at end,
    lock_expires_at      = case when p_patch ? 'lock_expires_at'
                             then (p_patch->>'lock_expires_at')::timestamptz
                             else lock_expires_at end,
    beds24_booking_id    = coalesce(p_patch->>'beds24_booking_id', beds24_booking_id),
    beds24_property_id   = coalesce(p_patch->>'beds24_property_id', beds24_property_id),
    beds24_room_id       = coalesce(p_patch->>'beds24_room_id', beds24_room_id),
    beds24_status        = coalesce(p_patch->>'beds24_status', beds24_status),
    beds24_verified_at   = coalesce((p_patch->>'beds24_verified_at')::timestamptz, beds24_verified_at),
    payment_provider     = coalesce((p_patch->>'payment_provider')::bolagio_payment_provider, payment_provider),
    payment_status       = coalesce((p_patch->>'payment_status')::bolagio_payment_status, payment_status),
    payment_order_id     = coalesce(p_patch->>'payment_order_id', payment_order_id),
    payment_capture_id   = coalesce(p_patch->>'payment_capture_id', payment_capture_id),
    paid_amount_cents    = coalesce((p_patch->>'paid_amount_cents')::integer, paid_amount_cents),
    paid_currency        = coalesce(p_patch->>'paid_currency', paid_currency),
    provider_snapshot    = coalesce(p_patch->'provider_snapshot', provider_snapshot),
    last_failure_code    = case when p_patch ? 'last_failure_code'
                             then p_patch->>'last_failure_code' else last_failure_code end,
    last_failure_reason  = case when p_patch ? 'last_failure_reason'
                             then p_patch->>'last_failure_reason' else last_failure_reason end,
    last_failure_at      = case when p_patch ? 'last_failure_code' then now() else last_failure_at end,
    reconciliation_state = coalesce(p_patch->>'reconciliation_state', reconciliation_state),
    -- Milestone timestamps are set once, by the transition that earns them.
    paid_at              = case when p_to = 'paid' and paid_at is null then now() else paid_at end,
    confirmed_at         = case when p_to = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
    released_at          = case when p_to = 'released' and released_at is null then now() else released_at end
  where id = p_intent_id
  returning * into v_row;

  perform set_config('bolagio.transition_ok', 'no', true);

  -- The audit row. Append-only, and written inside the same transaction as the
  -- state it describes, so the log can never disagree with the row.
  insert into bolagio_booking_intent_events (intent_id, from_status, to_status, reason, correlation_id, detail)
  values (p_intent_id, v_from, p_to, p_reason, p_correlation_id,
          case when p_patch = '{}'::jsonb then null
               else p_patch - 'quote_components' - 'provider_snapshot' end);

  -- The outbox row. Same transaction. This is the guarantee that a confirmed
  -- booking and the event announcing it cannot come apart.
  if p_outbox_type is not null then
    insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
    values (p_outbox_type, p_intent_id, v_row.reference,
            coalesce(p_outbox_payload, '{}'::jsonb));
  end if;

  return v_row;
exception when others then
  -- Never leave the guard flag on for the rest of the transaction.
  perform set_config('bolagio.transition_ok', 'no', true);
  raise;
end $$;

comment on function bolagio_booking_transition is
  'The only legal way to change a booking status. Compare-and-set, audited, and writes its outbox row in the same transaction.';

-- ── Acquire the local lock ────────────────────────────────────────────────
--
-- Called BEFORE any Beds24 call. This is the concurrency guarantee: the
-- exclusion constraint covers `locking`, so of two overlapping requests exactly
-- one reaches the provider.
--
-- Stale locks are reclaimed here rather than by a background sweep, because a
-- guest retrying two minutes after a crashed attempt must not be told the dates
-- are taken by their own abandoned lock.
create or replace function bolagio_acquire_lock(
  p_intent_id uuid,
  p_lock_seconds integer default 120,
  p_correlation_id text default null
) returns bolagio_booking_intents
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row bolagio_booking_intents;
  v_stale record;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then
    raise exception 'bolagio: booking intent % not found', p_intent_id using errcode = 'no_data_found';
  end if;

  -- Reclaim expired locks on this unit and range. A `locking` row whose lease
  -- ran out belongs to a process that died before it could tell us anything,
  -- and it never reached the point of having a Beds24 booking id — if it had,
  -- it would be `hold_created`. It is safe to move to `hold_failed`, which does
  -- not reserve, and the external-operations table still carries any uncertain
  -- POST it may have made.
  for v_stale in
    select id, status from bolagio_booking_intents
    where unit_id = v_row.unit_id
      and status = 'locking'
      and id <> p_intent_id
      and lock_expires_at is not null
      and lock_expires_at < now()
      and stay_range && v_row.stay_range
    for update
  loop
    perform bolagio_booking_transition(
      v_stale.id, 'locking'::bolagio_booking_status, 'hold_failed'::bolagio_booking_status,
      'lock_lease_expired', jsonb_build_object('last_failure_code','BOOKING_LOCK_LEASE_EXPIRED'),
      p_correlation_id);
  end loop;

  -- The insert/update below can raise 23P01 (exclusion_violation). That is not
  -- an error to swallow: it is the database refusing to double-book, and the
  -- caller turns it into `availability_conflict` for the guest.
  return bolagio_booking_transition(
    p_intent_id, v_row.status, 'locking'::bolagio_booking_status, 'lock_acquired',
    jsonb_build_object('lock_expires_at', (now() + make_interval(secs => p_lock_seconds))::text),
    p_correlation_id);
end $$;

-- ── Record a verified payment capture ─────────────────────────────────────
--
-- The single most safety-critical function in the schema. Everything it
-- validates, it validates in one transaction against the row it has locked:
--
--   * the intent exists and this capture has not already been applied
--   * the provider order matches the one WE created
--   * the amount matches the amount WE quoted
--   * the currency matches
--
-- A mismatch does not confirm and does not refund. It goes to `manual_review`
-- with a severity-1 reconciliation job, because an amount that does not match
-- is either a bug or an attack and both need a human.
create or replace function bolagio_record_payment_capture(
  p_reference    text,
  p_provider     bolagio_payment_provider,
  p_order_id     text,
  p_capture_id   text,
  p_amount_cents integer,
  p_currency     char(3),
  p_correlation_id text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row bolagio_booking_intents;
  v_next bolagio_booking_intents;
  v_mismatch text;
begin
  select * into v_row from bolagio_booking_intents where reference = p_reference for update;
  if not found then
    return jsonb_build_object('outcome','unknown_reference');
  end if;

  -- Already applied. The second delivery of a capture is a quiet success —
  -- that is what makes PayPal's nine retries harmless.
  if v_row.payment_capture_id is not null and v_row.payment_capture_id = p_capture_id
     and v_row.payment_status in ('paid','refunded','partially_refunded','disputed') then
    return jsonb_build_object('outcome','duplicate','status', v_row.status,
                              'payment_status', v_row.payment_status);
  end if;

  -- A DIFFERENT capture against a booking that already has one. Not a
  -- duplicate — two real payments. Always a human.
  if v_row.payment_capture_id is not null and v_row.payment_capture_id <> p_capture_id then
    v_mismatch := 'PAYMENT_DUPLICATE_CAPTURE';
  elsif v_row.payment_order_id is not null and v_row.payment_order_id <> p_order_id then
    v_mismatch := 'PAYMENT_ORDER_MISMATCH';
  elsif v_row.payment_provider is not null and v_row.payment_provider <> p_provider then
    v_mismatch := 'PAYMENT_PROVIDER_MISMATCH';
  elsif v_row.quoted_total_cents is null or v_row.quoted_total_cents <> p_amount_cents then
    v_mismatch := 'PAYMENT_AMOUNT_MISMATCH';
  elsif upper(coalesce(p_currency,'')) <> upper(v_row.currency) then
    v_mismatch := 'PAYMENT_CURRENCY_MISMATCH';
  end if;

  if v_mismatch is not null then
    v_next := bolagio_booking_transition(
      v_row.id, v_row.status, 'manual_review'::bolagio_booking_status, v_mismatch,
      jsonb_build_object(
        'last_failure_code', v_mismatch,
        'last_failure_reason', 'payment capture did not match the authoritative quote',
        'reconciliation_state', 'manual',
        'paid_amount_cents', p_amount_cents,
        'paid_currency', p_currency,
        'payment_status', 'unknown'),
      p_correlation_id,
      'booking.manual_review_required',
      jsonb_build_object('code', v_mismatch, 'reference', p_reference));
    perform bolagio_queue_reconciliation(v_row.id, v_mismatch, 1,
      jsonb_build_object('order_id', p_order_id, 'capture_id', p_capture_id,
                         'amount_cents', p_amount_cents, 'currency', p_currency));
    return jsonb_build_object('outcome','mismatch','code', v_mismatch);
  end if;

  v_next := bolagio_booking_transition(
    v_row.id, v_row.status, 'paid'::bolagio_booking_status, 'payment_captured',
    jsonb_build_object(
      'payment_status', 'paid',
      'payment_provider', p_provider::text,
      'payment_order_id', p_order_id,
      'payment_capture_id', p_capture_id,
      'paid_amount_cents', p_amount_cents,
      'paid_currency', p_currency,
      'reconciliation_state', 'pending'),
    p_correlation_id,
    'payment.completed',
    jsonb_build_object('reference', p_reference, 'amountCents', p_amount_cents,
                       'currency', p_currency));

  if v_next is null then
    -- The booking was somewhere `paid` is not reachable from — `confirmed`
    -- already, or `cancelled`. Money has moved and the reservation state does
    -- not follow. A human decides, and the payment fact is still recorded.
    perform bolagio_queue_reconciliation(v_row.id, 'PAYMENT_AFTER_TERMINAL_STATE', 1,
      jsonb_build_object('status', v_row.status, 'capture_id', p_capture_id));
    return jsonb_build_object('outcome','not_applicable','status', v_row.status);
  end if;

  return jsonb_build_object('outcome','applied','status', v_next.status,
                            'payment_status', v_next.payment_status);
end $$;

-- ── Queue a reconciliation job ────────────────────────────────────────────
--
-- Idempotent by the partial unique index: re-queuing an already-open job bumps
-- its urgency rather than creating a second one.
create or replace function bolagio_queue_reconciliation(
  p_intent_id uuid,
  p_reason    text,
  -- `integer`, not `smallint`: PostgreSQL will not implicitly narrow an
  -- integer literal at function-resolution time, so a smallint parameter makes
  -- every call site need an explicit cast. It is clamped below regardless.
  p_severity  integer default 3,
  p_detail    jsonb default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid; v_ref text;
begin
  select reference into v_ref from bolagio_booking_intents where id = p_intent_id;
  insert into bolagio_reconciliation_jobs (intent_id, reference, reason, severity, detail)
  values (p_intent_id, v_ref, p_reason, greatest(1, least(5, p_severity))::smallint, p_detail)
  on conflict (intent_id, reason) where status in ('pending','claimed','failed')
  do update set
    severity = least(bolagio_reconciliation_jobs.severity, excluded.severity),
    detail   = coalesce(excluded.detail, bolagio_reconciliation_jobs.detail),
    updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ── Outbox claiming ───────────────────────────────────────────────────────
--
-- `for update skip locked` is what makes more than one automation worker safe.
-- Two workers claiming simultaneously get disjoint sets; neither blocks.
--
-- A claim is a LEASE, not a removal. A worker that crashes mid-event leaves a
-- row whose `claim_expires_at` passes, and the next claim picks it up. Nothing
-- is lost by a crash; at worst an event is delivered twice, which is why the
-- n8n contract requires consumers to be idempotent.
create or replace function bolagio_claim_outbox_events(
  p_worker text,
  p_limit  integer default 20,
  p_lease_seconds integer default 300
) returns setof bolagio_outbox_events
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select id from bolagio_outbox_events
    where status in ('pending','claimed')
      and processed_at is null
      and available_at <= now()
      and (claim_expires_at is null or claim_expires_at < now())
    order by created_at
    limit greatest(1, least(200, p_limit))
    for update skip locked
  )
  update bolagio_outbox_events o set
    status = 'claimed',
    claimed_at = now(),
    claimed_by = left(coalesce(p_worker, 'unknown'), 100),
    claim_expires_at = now() + make_interval(secs => greatest(30, least(3600, p_lease_seconds))),
    attempts = o.attempts + 1
  from claimable c
  where o.id = c.id
  returning o.*;
end $$;

create or replace function bolagio_ack_outbox_event(p_id uuid, p_worker text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update bolagio_outbox_events set
    status = 'succeeded', processed_at = now(), claim_expires_at = null, last_error = null
  where id = p_id and status = 'claimed' and claimed_by = left(coalesce(p_worker,'unknown'), 100);
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

-- Exponential backoff, and a dead letter at eight attempts. A dead-lettered
-- event is NOT deleted: it stays queryable in the operations view, because an
-- event nobody consumed is an operational fact, not rubbish.
create or replace function bolagio_fail_outbox_event(p_id uuid, p_worker text, p_error text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_outbox_events;
begin
  select * into v_row from bolagio_outbox_events where id = p_id for update;
  if not found then return false; end if;

  update bolagio_outbox_events set
    status = case when v_row.attempts >= 8 then 'exhausted'::bolagio_job_status
                  else 'pending'::bolagio_job_status end,
    claim_expires_at = null,
    claimed_by = null,
    last_error = left(coalesce(p_error, 'unspecified'), 500),
    available_at = now() + make_interval(secs => least(3600, power(2, least(v_row.attempts, 10))::integer * 15))
  where id = p_id;
  return true;
end $$;

-- ── Reconciliation job claiming ───────────────────────────────────────────

create or replace function bolagio_claim_reconciliation_jobs(
  p_worker text,
  p_limit integer default 10
) returns setof bolagio_reconciliation_jobs
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select id from bolagio_reconciliation_jobs
    where status in ('pending','failed')
      and next_attempt_at <= now()
    -- Severity first: a paid-but-unfinalized booking is worked before a stale
    -- hold, whatever order they arrived in.
    order by severity, next_attempt_at
    limit greatest(1, least(100, p_limit))
    for update skip locked
  )
  update bolagio_reconciliation_jobs j set
    status = 'claimed', claimed_at = now(),
    claimed_by = left(coalesce(p_worker,'unknown'), 100),
    attempts = j.attempts + 1, updated_at = now()
  from claimable c where j.id = c.id
  returning j.*;
end $$;

create or replace function bolagio_resolve_reconciliation_job(
  p_id uuid, p_resolution text
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update bolagio_reconciliation_jobs set
    status = 'resolved', resolved_at = now(), updated_at = now(),
    resolution = left(coalesce(p_resolution,'resolved'), 200)
  where id = p_id;
  return found;
end $$;

-- Twelve attempts, then `exhausted` — which is the trigger for a human alert,
-- not for giving up quietly.
create or replace function bolagio_fail_reconciliation_job(
  p_id uuid, p_error text
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_reconciliation_jobs;
begin
  select * into v_row from bolagio_reconciliation_jobs where id = p_id for update;
  if not found then return false; end if;

  update bolagio_reconciliation_jobs set
    status = case when v_row.attempts >= 12 then 'exhausted'::bolagio_job_status
                  else 'failed'::bolagio_job_status end,
    last_error = left(coalesce(p_error,'unspecified'), 500),
    next_attempt_at = now() + make_interval(secs => least(7200, power(2, least(v_row.attempts,12))::integer * 30)),
    updated_at = now(), claimed_by = null
  where id = p_id;

  if v_row.attempts >= 12 then
    insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
    values ('booking.manual_review_required', v_row.intent_id, v_row.reference,
            jsonb_build_object('code','RECONCILIATION_EXHAUSTED','reason', v_row.reason));
  end if;
  return true;
end $$;

-- ── Payment event inbox ───────────────────────────────────────────────────

create or replace function bolagio_record_payment_event(
  p_provider          bolagio_external_provider,
  p_provider_event_id text,
  p_event_type        text,
  p_verification      text,
  p_payload           jsonb,
  p_event_time        timestamptz default null,
  p_transmission_time timestamptz default null,
  p_transmission_id   text default null,
  p_order_id          text default null,
  p_capture_id        text default null,
  p_reference         text default null,
  p_amount_cents      integer default null,
  p_currency          char(3) default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into bolagio_payment_events (
    provider, provider_event_id, event_type, verification, payload,
    event_time, transmission_time, transmission_id,
    order_id, capture_id, reference, amount_cents, currency,
    -- An event that did not verify is stored (so a forged-signature attempt is
    -- visible) but is never queued for processing.
    status)
  values (
    p_provider, p_provider_event_id, p_event_type, p_verification, p_payload,
    p_event_time, p_transmission_time, p_transmission_id,
    p_order_id, p_capture_id, p_reference, p_amount_cents, p_currency,
    case when p_verification = 'verified' then 'pending'::bolagio_job_status
         else 'failed'::bolagio_job_status end)
  on conflict (provider, provider_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('duplicate', true);
  end if;
  return jsonb_build_object('duplicate', false, 'id', v_id);
end $$;

create or replace function bolagio_claim_payment_events(
  p_worker text, p_limit integer default 20
) returns setof bolagio_payment_events
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select id from bolagio_payment_events
    where status in ('pending','failed')
      and verification = 'verified'
      and processed_at is null
      and available_at <= now()
    order by received_at
    limit greatest(1, least(100, p_limit))
    for update skip locked
  )
  update bolagio_payment_events e set
    status = 'claimed', claimed_at = now(),
    claimed_by = left(coalesce(p_worker,'unknown'), 100),
    attempts = e.attempts + 1
  from claimable c where e.id = c.id
  returning e.*;
end $$;

create or replace function bolagio_settle_payment_event(
  p_id uuid, p_ok boolean, p_error text default null
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_payment_events;
begin
  select * into v_row from bolagio_payment_events where id = p_id for update;
  if not found then return false; end if;

  if p_ok then
    update bolagio_payment_events
      set status = 'succeeded', processed_at = now(), last_error = null where id = p_id;
  else
    update bolagio_payment_events set
      status = case when v_row.attempts >= 8 then 'exhausted'::bolagio_job_status
                    else 'failed'::bolagio_job_status end,
      last_error = left(coalesce(p_error,'unspecified'), 500),
      available_at = now() + make_interval(secs => least(3600, power(2, least(v_row.attempts,10))::integer * 15))
    where id = p_id;
  end if;
  return true;
end $$;

-- ── External operation tracking ───────────────────────────────────────────

create or replace function bolagio_begin_external_operation(
  p_key text, p_provider bolagio_external_provider, p_type text,
  p_intent_id uuid default null, p_request jsonb default null
) returns bolagio_external_operations
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_external_operations;
begin
  insert into bolagio_external_operations (operation_key, provider, operation_type, intent_id, request_summary)
  values (p_key, p_provider, p_type, p_intent_id, p_request)
  on conflict (operation_key) do update set
    attempts = bolagio_external_operations.attempts + 1,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function bolagio_complete_external_operation(
  p_key text, p_outcome bolagio_operation_outcome,
  p_resource_id text default null, p_error text default null
) returns bolagio_external_operations
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_external_operations;
begin
  update bolagio_external_operations set
    outcome      = p_outcome,
    resource_id  = coalesce(p_resource_id, resource_id),
    last_error   = case when p_error is null then last_error else left(p_error, 500) end,
    completed_at = case when p_outcome in ('succeeded','failed') then now() else completed_at end,
    uncertain_at = case when p_outcome = 'outcome_unknown' then coalesce(uncertain_at, now()) else uncertain_at end,
    reconciled_at= case when p_outcome = 'reconciled' then now() else reconciled_at end,
    updated_at   = now()
  where operation_key = p_key
  returning * into v_row;
  return v_row;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — operations views
-- ══════════════════════════════════════════════════════════════════════════
--
-- No admin UI exists in this repository and this task deliberately does not
-- build an authentication system for one. These views are the surface an
-- operator (or a later authenticated dashboard, or a read-only n8n reporting
-- workflow) reads. They carry NO guest personal data — a reference, a unit, a
-- state and a reason is everything an operator needs to act.

create or replace view bolagio_ops_attention as
select
  i.reference,
  u.slug            as unit_slug,
  i.status,
  i.payment_status,
  i.check_in,
  i.check_out,
  i.currency,
  i.quoted_total_cents,
  i.paid_amount_cents,
  i.beds24_booking_id,
  i.payment_order_id,
  i.last_failure_code,
  i.reconciliation_state,
  i.hold_expires_at,
  i.updated_at,
  case
    -- Ordered by what costs most if ignored. A paid booking the channel
    -- manager has not been told about is the top of this list, always.
    when i.status in ('paid_unfinalized','finalization_failed') then 1
    when i.status = 'manual_review' then 1
    when i.status = 'release_failed' then 2
    when i.payment_status = 'unknown' then 2
    when i.status = 'paid' and i.confirmed_at is null then 2
    when i.status in ('releasing','locking') then 3
    else 4
  end as severity
from bolagio_booking_intents i
join bolagio_units u on u.id = i.unit_id
where i.status in ('locking','paid','paid_unfinalized','finalization_failed',
                   'releasing','release_failed','manual_review')
   or i.payment_status = 'unknown'
   or i.reconciliation_state <> 'ok';

comment on view bolagio_ops_attention is
  'Bookings needing operational attention, most expensive first. No guest PII.';

create or replace view bolagio_ops_queues as
select 'outbox' as queue, status::text as state, count(*) as items,
       min(created_at) as oldest
from bolagio_outbox_events group by 1,2
union all
select 'payment_events', status::text, count(*), min(received_at)
from bolagio_payment_events group by 1,2
union all
select 'reconciliation', status::text, count(*), min(created_at)
from bolagio_reconciliation_jobs group by 1,2
union all
select 'external_operations', outcome::text, count(*), min(started_at)
from bolagio_external_operations group by 1,2;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — touch triggers, RLS, privileges
-- ══════════════════════════════════════════════════════════════════════════

do $$ begin
  create trigger bolagio_external_operations_touch before update on bolagio_external_operations
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger bolagio_reconciliation_jobs_touch before update on bolagio_reconciliation_jobs
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

-- Same posture as the foundation: RLS on, no permissive policy, so anon and
-- authenticated read nothing at all. Only the service role — held by the route
-- handlers, the Edge Function and the reconciliation worker — reaches these.
alter table bolagio_outbox_events        enable row level security;
alter table bolagio_payment_events       enable row level security;
alter table bolagio_external_operations  enable row level security;
alter table bolagio_reconciliation_jobs  enable row level security;

revoke all on bolagio_outbox_events, bolagio_payment_events,
              bolagio_external_operations, bolagio_reconciliation_jobs
  from anon, authenticated;

revoke all on bolagio_ops_attention, bolagio_ops_queues from anon, authenticated;

-- Command functions are service-role only. A leaked publishable key cannot
-- call one, and neither can a signed-in Supabase user if one ever exists.
do $$
declare fn text;
begin
  foreach fn in array array[
    'bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)',
    'bolagio_acquire_lock(uuid,integer,text)',
    'bolagio_record_payment_capture(text,bolagio_payment_provider,text,text,integer,bpchar,text)',
    'bolagio_queue_reconciliation(uuid,text,integer,jsonb)',
    'bolagio_claim_outbox_events(text,integer,integer)',
    'bolagio_ack_outbox_event(uuid,text)',
    'bolagio_fail_outbox_event(uuid,text,text)',
    'bolagio_claim_reconciliation_jobs(text,integer)',
    'bolagio_resolve_reconciliation_job(uuid,text)',
    'bolagio_fail_reconciliation_job(uuid,text)',
    'bolagio_record_payment_event(bolagio_external_provider,text,text,text,jsonb,timestamptz,timestamptz,text,text,text,text,integer,bpchar)',
    'bolagio_claim_payment_events(text,integer)',
    'bolagio_settle_payment_event(uuid,boolean,text)',
    'bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb)',
    'bolagio_complete_external_operation(text,bolagio_operation_outcome,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
