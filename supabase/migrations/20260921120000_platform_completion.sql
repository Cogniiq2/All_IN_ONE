-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — platform completion.
--
-- Depends on, in order:
--   20260916120000_booking_foundation.sql
--   20260917100000_booking_core_states.sql       (must have COMMITTED)
--   20260917110000_booking_core_hardening.sql
--   20260919120000_admin_operators.sql
--   20260920120000_booking_production_hardening.sql
--
-- Additive and idempotent. Two function signatures gain an optional trailing
-- parameter (they are dropped and recreated, and every existing call site
-- still resolves); nothing else is removed.
--
-- ── What this migration is for ────────────────────────────────────────────
--   1. A same-state transition may carry a patch and an outbox row. The
--      previous version returned early on `from = to`, so the application's
--      "record payment_status = unknown / refunded" writes silently did
--      nothing and `payment.refunded` was never emitted. Found by running the
--      real sagas against a real database; fixed here, asserted by tests.
--   2. The cancellation and refund state, ORTHOGONAL to the booking status:
--      who asked, who authorised, what refund was decided, what the provider
--      did — with database invariants so a paid booking can never be
--      released without an authorised cancellation and a refund can never
--      read "completed" without provider evidence.
--   3. The message-delivery ledger: exactly-once EFFECT for guest messages
--      on top of at-least-once event processing.
--   4. Cleaning operations: turnover status transitions with an audit trail,
--      assignment, re-opening on a moved departure, and outbox events for
--      reschedules and cancellations so downstream work is updated, never
--      duplicated.
--   5. Guest-operations timing on the unit (per property, no deploy), the
--      check-out event, the invoice-required event, and an injectable clock
--      so DST and same-day cases are provable in SQL.
--   6. Integration health observations: last success / failure per provider,
--      last verified webhook, last n8n claim / ack / fail.
--   7. Invoice numbering: a gapless per-series sequence. Nothing is invoiced.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — same-state transitions carry their patch
-- ══════════════════════════════════════════════════════════════════════════

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
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then
    raise exception 'bolagio: booking intent % not found', p_intent_id
      using errcode = 'no_data_found';
  end if;
  v_from := v_row.status;

  if p_expected is not null and v_row.status <> p_expected then
    return null;
  end if;

  -- A same-state call with nothing to record is the idempotent repeat: a
  -- duplicate webhook, a second click. A same-state call WITH a patch or an
  -- outbox row is a legitimate write of the orthogonal columns (payment
  -- state, failure code, reconciliation state) and is applied — the status
  -- guard sees no status change and the payment-transition check still runs.
  if v_from = p_to and p_to <> 'quoted' and coalesce(p_patch, '{}'::jsonb) = '{}'::jsonb and p_outbox_type is null then
    return v_row;
  end if;

  if v_from <> p_to and not bolagio_transition_allowed(v_from, p_to) then
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
    last_failure_at      = case when p_patch ? 'last_failure_code' and p_patch->>'last_failure_code' is not null
                             then now() else last_failure_at end,
    reconciliation_state = coalesce(p_patch->>'reconciliation_state', reconciliation_state),
    paid_at              = case when p_to = 'paid' and paid_at is null then now() else paid_at end,
    confirmed_at         = case when p_to = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
    released_at          = case when p_to = 'released' and released_at is null then now() else released_at end
  where id = p_intent_id
  returning * into v_row;

  perform set_config('bolagio.transition_ok', 'no', true);

  insert into bolagio_booking_intent_events (intent_id, from_status, to_status, reason, correlation_id, detail)
  values (p_intent_id, v_from, p_to, p_reason, p_correlation_id,
          case when coalesce(p_patch, '{}'::jsonb) = '{}'::jsonb then null
               else p_patch - 'quote_components' - 'provider_snapshot' end);

  if p_outbox_type is not null then
    insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
    values (p_outbox_type, p_intent_id, v_row.reference,
            coalesce(p_outbox_payload, '{}'::jsonb));
  end if;

  return v_row;
exception when others then
  perform set_config('bolagio.transition_ok', 'no', true);
  raise;
end $$;

-- ── One edge the recovery path was missing ────────────────────────────────
--
-- `resolveUnknownHold` adopts a Beds24 booking it finds by our reference
-- after an uncertain create, moving the intent `manual_review → hold_created`.
-- That edge was never in the table, so adoption was refused every time and
-- the booking stayed in a person's hands although the provider had answered.
-- Found by running the saga against the provider simulator. The edge is
-- taken only after a READ of the provider matched our reference.
create or replace function bolagio_transition_allowed(
  p_from bolagio_booking_status,
  p_to   bolagio_booking_status
) returns boolean language sql immutable parallel safe as $$
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
        array['hold_created','confirmed','finalizing','releasing','released','paid_unfinalized','cancelled']
      else array[]::text[]
    end
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — cancellation and refund: orthogonal state, guarded
-- ══════════════════════════════════════════════════════════════════════════
--
-- The booking status says where the RESERVATION is. These columns say what
-- was DECIDED about ending it and what the MONEY did about that decision.
-- Keeping them apart is what lets "cancellation requested, release unknown,
-- refund not yet executed" be a representable row rather than a guess.

alter table bolagio_booking_intents
  add column if not exists cancellation_requested_at  timestamptz,
  add column if not exists cancellation_requested_by  text,
  add column if not exists cancellation_reason        text,
  -- The operator who took responsibility for ending a booking that carries
  -- payment evidence. NULL means nobody did, and the status guard refuses to
  -- release such a booking.
  add column if not exists cancellation_authorized_by text,
  add column if not exists cancellation_completed_at  timestamptz,
  add column if not exists refund_state text not null default 'none',
  add column if not exists refund_required_cents integer,
  add column if not exists refund_id text,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_completed_at timestamptz,
  add column if not exists refund_last_error text;

do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_state_check
    check (refund_state in ('none','not_required','required','pending','completed','unknown','failed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_required_cents_check
    check (refund_required_cents is null or refund_required_cents >= 0);
exception when duplicate_object then null; end $$;

-- ── The invariants ────────────────────────────────────────────────────────

-- A completed refund is a claim about money. It needs the provider's refund
-- id and a non-zero refunded amount, or it is not a fact.
do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_completed_evidence
    check (refund_state <> 'completed' or (refund_id is not null and refunded_amount_cents > 0));
exception when duplicate_object then null; end $$;

-- Nothing can be refunded on a booking whose payment state says no money is
-- ours. (`unknown` and `capture_pending` are allowed through: a refund
-- decision may be taken while the payment is still being reconciled.)
do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_requires_money
    check (refund_state in ('none','not_required')
        or payment_status in ('paid','partially_refunded','refunded','disputed','unknown','capture_pending'));
exception when duplicate_object then null; end $$;

-- A refund is always the consequence of an AUTHORISED cancellation. There is
-- no path to "refund required" that does not name a person.
do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_requires_authorization
    check (refund_state in ('none','not_required') or cancellation_authorized_by is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table bolagio_booking_intents add constraint bolagio_refund_required_amount
    check (refund_state not in ('required','pending') or (refund_required_cents is not null and refund_required_cents > 0));
exception when duplicate_object then null; end $$;

create index if not exists bolagio_booking_intents_refund_idx
  on bolagio_booking_intents (refund_state) where refund_state in ('required','pending','unknown','failed');

-- ── The status guard learns about authorisation ───────────────────────────
--
-- Two new refusals, both decided from the row being written:
--
--   * a booking with payment evidence may enter `releasing` ONLY when a
--     person has authorised its cancellation. No timer, sweep, webhook or
--     UI click can take a paid stay away.
--   * the cancellation and refund columns change only inside their command
--     functions (`bolagio.cancel_ok` / `bolagio.refund_ok`), for the same
--     reason `status` changes only inside `bolagio_booking_transition()`.
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
    if new.status = 'releasing'
       and (old.status in ('paid','finalizing','confirmed','paid_unfinalized','finalization_failed')
            or new.payment_status not in ('not_created','order_created','cancelled','denied'))
       and new.cancellation_authorized_by is null then
      raise exception
        'bolagio: releasing a booking with payment evidence (% / %) requires an authorised cancellation',
        old.status, new.payment_status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status
     and not bolagio_payment_transition_allowed(old.payment_status, new.payment_status) then
    raise exception 'bolagio: illegal payment transition % -> %',
      old.payment_status, new.payment_status
      using errcode = 'check_violation';
  end if;

  if (new.cancellation_requested_at is distinct from old.cancellation_requested_at
      or new.cancellation_requested_by is distinct from old.cancellation_requested_by
      or new.cancellation_authorized_by is distinct from old.cancellation_authorized_by
      or new.cancellation_completed_at is distinct from old.cancellation_completed_at)
     and coalesce(current_setting('bolagio.cancel_ok', true), 'no') <> 'yes' then
    raise exception 'bolagio: cancellation columns change only through bolagio_request_cancellation()'
      using errcode = 'check_violation';
  end if;

  if (new.refund_state is distinct from old.refund_state
      or new.refund_id is distinct from old.refund_id
      or new.refund_completed_at is distinct from old.refund_completed_at
      or new.refunded_amount_cents is distinct from old.refunded_amount_cents)
     and coalesce(current_setting('bolagio.refund_ok', true), 'no') <> 'yes' then
    raise exception 'bolagio: refund columns change only through the refund command functions'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- ── Request a cancellation ────────────────────────────────────────────────
--
-- Records the DECISION and classifies what has to happen next. It never
-- calls a provider (PostgreSQL cannot) and never frees the local range
-- itself for a booking that may hold inventory: that is the release saga's
-- job, and this function tells the caller when it is required.
--
-- Outcomes:
--   cancelled          the booking held nothing; it is now `cancelled`
--   already_cancelled  idempotent repeat
--   release_required   inventory may be held; run the release saga, then
--                      `bolagio_complete_cancellation()`
--   in_progress        another process is mid-lock or mid-release
--   refused            with a code: AUTHORIZATION_REQUIRED (payment evidence
--                      and nobody authorised), REFUND_DECISION_REQUIRED (paid
--                      and no refund amount decided), INVALID_REFUND_AMOUNT,
--                      MANUAL_REVIEW (a person owns it; use the runbook)
create or replace function bolagio_request_cancellation(
  p_intent_id uuid,
  p_actor text,
  p_reason text default null,
  p_authorized boolean default false,
  p_refund_cents integer default null,
  p_correlation_id text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row bolagio_booking_intents;
  v_money boolean;
  v_paid_side boolean;
  v_next bolagio_booking_intents;
  v_refund_state text;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('outcome','refused','code','NOT_FOUND');
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object('outcome','already_cancelled','status', v_row.status, 'refund_state', v_row.refund_state);
  end if;
  if v_row.status in ('locking','releasing') then
    return jsonb_build_object('outcome','in_progress','status', v_row.status, 'refund_state', v_row.refund_state);
  end if;
  if v_row.status = 'manual_review' then
    return jsonb_build_object('outcome','refused','code','MANUAL_REVIEW','status', v_row.status);
  end if;

  v_paid_side := v_row.status in ('paid','finalizing','confirmed','paid_unfinalized','finalization_failed')
                 or v_row.payment_status in ('paid','partially_refunded','disputed','refunded');
  v_money := v_paid_side or v_row.payment_status not in ('not_created','order_created','cancelled','denied');

  if v_money and not p_authorized and v_row.cancellation_authorized_by is null then
    return jsonb_build_object('outcome','refused','code','AUTHORIZATION_REQUIRED','status', v_row.status,
                              'payment_status', v_row.payment_status);
  end if;

  v_refund_state := v_row.refund_state;
  if v_paid_side and v_row.refund_state = 'none' then
    if p_refund_cents is null then
      return jsonb_build_object('outcome','refused','code','REFUND_DECISION_REQUIRED','status', v_row.status,
                                'paid_amount_cents', v_row.paid_amount_cents);
    end if;
    if p_refund_cents < 0 or (v_row.paid_amount_cents is not null and p_refund_cents > v_row.paid_amount_cents - v_row.refunded_amount_cents) then
      return jsonb_build_object('outcome','refused','code','INVALID_REFUND_AMOUNT','status', v_row.status,
                                'paid_amount_cents', v_row.paid_amount_cents);
    end if;
    v_refund_state := case when p_refund_cents = 0 then 'not_required' else 'required' end;
  end if;

  perform set_config('bolagio.cancel_ok', 'yes', true);
  perform set_config('bolagio.refund_ok', 'yes', true);
  update bolagio_booking_intents set
    cancellation_requested_at  = coalesce(cancellation_requested_at, now()),
    cancellation_requested_by  = coalesce(cancellation_requested_by, left(p_actor, 200)),
    cancellation_reason        = coalesce(cancellation_reason, left(p_reason, 400)),
    cancellation_authorized_by = case when p_authorized then coalesce(cancellation_authorized_by, left(p_actor, 200))
                                      else cancellation_authorized_by end,
    refund_state               = v_refund_state,
    refund_required_cents      = case when v_refund_state = 'required' and refund_required_cents is null
                                      then p_refund_cents else refund_required_cents end
  where id = p_intent_id
  returning * into v_row;
  perform set_config('bolagio.cancel_ok', 'no', true);
  perform set_config('bolagio.refund_ok', 'no', true);

  -- Guest messages that have not gone yet must not go now.
  perform bolagio_suppress_message_deliveries(p_intent_id, 'cancellation_requested');

  -- Nothing was ever acquired: the booking can end right here.
  if v_row.status in ('draft','quoted','quote_expired','unavailable','hold_failed','released') then
    v_next := bolagio_booking_transition(
      p_intent_id, v_row.status, 'cancelled'::bolagio_booking_status,
      'cancellation:' || coalesce(left(p_reason, 100), 'requested'),
      '{}'::jsonb, p_correlation_id,
      'booking.cancelled',
      jsonb_build_object('reference', v_row.reference, 'reason', coalesce(p_reason, 'cancellation_requested'),
                         'requestedBy', 'operator', 'refundState', v_row.refund_state));
    perform set_config('bolagio.cancel_ok', 'yes', true);
    update bolagio_booking_intents set cancellation_completed_at = now() where id = p_intent_id;
    perform set_config('bolagio.cancel_ok', 'no', true);
    return jsonb_build_object('outcome','cancelled','status','cancelled','refund_state', v_row.refund_state);
  end if;

  -- Inventory may be held at the channel manager. The saga releases it, verified.
  insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
  select 'booking.cancellation_requested', p_intent_id, v_row.reference,
         jsonb_build_object('reference', v_row.reference, 'status', v_row.status::text,
                            'refundState', v_row.refund_state, 'authorized', v_row.cancellation_authorized_by is not null)
  where not exists (
    select 1 from bolagio_outbox_events
    where aggregate_id = p_intent_id and event_type = 'booking.cancellation_requested');

  return jsonb_build_object('outcome','release_required','status', v_row.status::text,
                            'refund_state', v_row.refund_state, 'authorized', v_row.cancellation_authorized_by is not null);
end $$;

comment on function bolagio_request_cancellation is
  'Record a cancellation decision and classify the next step. Never calls a provider; never frees a held range itself.';

-- ── Finish a cancellation once the release is verified ────────────────────
create or replace function bolagio_complete_cancellation(
  p_intent_id uuid,
  p_correlation_id text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_booking_intents; v_next bolagio_booking_intents;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('outcome','refused','code','NOT_FOUND'); end if;
  if v_row.status = 'cancelled' then
    return jsonb_build_object('outcome','already_cancelled');
  end if;
  if v_row.cancellation_requested_at is null then
    return jsonb_build_object('outcome','refused','code','NOT_REQUESTED','status', v_row.status::text);
  end if;
  if v_row.status <> 'released' then
    return jsonb_build_object('outcome','not_yet','status', v_row.status::text);
  end if;
  v_next := bolagio_booking_transition(
    p_intent_id, 'released'::bolagio_booking_status, 'cancelled'::bolagio_booking_status,
    'cancellation_completed', '{}'::jsonb, p_correlation_id);
  if v_next is null then
    return jsonb_build_object('outcome','not_yet','status', v_row.status::text);
  end if;
  perform set_config('bolagio.cancel_ok', 'yes', true);
  update bolagio_booking_intents set cancellation_completed_at = now() where id = p_intent_id;
  perform set_config('bolagio.cancel_ok', 'no', true);
  return jsonb_build_object('outcome','cancelled','refund_state', v_row.refund_state);
end $$;

-- ── Refund commands ───────────────────────────────────────────────────────
--
-- `begin` moves required → pending and is the ONLY way there. A second call
-- while pending is refused (REFUND_IN_PROGRESS), which — together with the
-- external-operations ledger keyed on the capture id — is what makes a
-- duplicate refund request harmless.
create or replace function bolagio_begin_refund(
  p_intent_id uuid,
  p_actor text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_booking_intents;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_row.refund_state = 'completed' then return jsonb_build_object('ok', false, 'code', 'REFUND_ALREADY_COMPLETED'); end if;
  if v_row.refund_state in ('pending','unknown') then return jsonb_build_object('ok', false, 'code', 'REFUND_IN_PROGRESS', 'refund_state', v_row.refund_state); end if;
  if v_row.refund_state <> 'required' then return jsonb_build_object('ok', false, 'code', 'REFUND_NOT_REQUIRED', 'refund_state', v_row.refund_state); end if;
  if v_row.payment_capture_id is null then return jsonb_build_object('ok', false, 'code', 'NO_CAPTURE'); end if;
  if v_row.cancellation_authorized_by is null then return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_REQUIRED'); end if;

  perform set_config('bolagio.refund_ok', 'yes', true);
  update bolagio_booking_intents set
    refund_state = 'pending', refund_requested_at = coalesce(refund_requested_at, now()), refund_last_error = null
  where id = p_intent_id;
  perform set_config('bolagio.refund_ok', 'no', true);

  insert into bolagio_booking_intent_events (intent_id, from_status, to_status, reason, detail)
  values (p_intent_id, v_row.status, v_row.status, 'refund_started',
          jsonb_build_object('actor', left(p_actor, 200), 'refund_required_cents', v_row.refund_required_cents));

  return jsonb_build_object('ok', true, 'capture_id', v_row.payment_capture_id,
                            'amount_cents', v_row.refund_required_cents, 'currency', coalesce(v_row.paid_currency, v_row.currency));
end $$;

-- Record what the provider said (or that it said nothing).
--   completed  needs the provider's refund id and the amount. Idempotent on
--              the refund id. Updates the payment state to refunded /
--              partially_refunded and emits `payment.refunded`.
--   unknown    the call did not answer; reconciliation reads the order.
--   failed     the provider refused; a person decides what next.
create or replace function bolagio_record_refund_outcome(
  p_intent_id uuid,
  p_outcome text,
  p_refund_id text default null,
  p_amount_cents integer default null,
  p_error text default null,
  p_source text default 'saga',
  p_correlation_id text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row bolagio_booking_intents;
  v_total integer;
  v_payment text;
  v_next bolagio_booking_intents;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if p_outcome = 'completed' then
    if p_refund_id is null or p_refund_id = '' or p_amount_cents is null or p_amount_cents <= 0 then
      return jsonb_build_object('ok', false, 'code', 'EVIDENCE_REQUIRED');
    end if;
    if v_row.refund_state = 'completed' and v_row.refund_id = p_refund_id then
      return jsonb_build_object('ok', true, 'duplicate', true, 'refund_state', 'completed');
    end if;
    if v_row.refund_state = 'completed' and v_row.refund_id <> p_refund_id then
      -- A second, different refund on the same capture. Money moved twice.
      perform bolagio_queue_reconciliation(p_intent_id, 'PAYMENT_REFUND_DUPLICATE', 1,
        jsonb_build_object('refund_id', p_refund_id, 'previous_refund_id', v_row.refund_id, 'amount_cents', p_amount_cents));
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_REFUND_DUPLICATE');
    end if;
    if v_row.cancellation_authorized_by is null then
      -- Evidence of a refund nobody here authorised (a dashboard refund). It
      -- is recorded as a payment fact and escalated, never adopted as ours.
      return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED_REFUND_EVIDENCE');
    end if;

    v_total := v_row.refunded_amount_cents + p_amount_cents;
    v_payment := case when v_row.paid_amount_cents is not null and v_total >= v_row.paid_amount_cents then 'refunded' else 'partially_refunded' end;

    perform set_config('bolagio.refund_ok', 'yes', true);
    update bolagio_booking_intents set
      refund_state = 'completed', refund_id = p_refund_id, refund_completed_at = now(),
      refunded_amount_cents = v_total, refund_last_error = null
    where id = p_intent_id;
    perform set_config('bolagio.refund_ok', 'no', true);

    v_next := bolagio_booking_transition(
      p_intent_id, v_row.status, v_row.status, 'refund_completed:' || p_source,
      jsonb_build_object('payment_status', v_payment),
      p_correlation_id,
      'payment.refunded',
      jsonb_build_object('reference', v_row.reference, 'amountCents', p_amount_cents,
                         'currency', coalesce(v_row.paid_currency, v_row.currency),
                         'partial', v_payment = 'partially_refunded', 'refundId', p_refund_id));
    -- The refund was ours; the reconciliation job for its uncertainty, if any, is done.
    update bolagio_reconciliation_jobs set status = 'resolved', resolved_at = now(), resolution = 'refund evidence recorded'
    where intent_id = p_intent_id and reason = 'PAYMENT_REFUND_UNCERTAIN' and status in ('pending','claimed','failed');
    return jsonb_build_object('ok', true, 'refund_state', 'completed', 'payment_status', v_payment,
                              'refunded_amount_cents', v_total);
  end if;

  if p_outcome = 'unknown' then
    perform set_config('bolagio.refund_ok', 'yes', true);
    update bolagio_booking_intents set refund_state = 'unknown', refund_last_error = left(p_error, 400) where id = p_intent_id;
    perform set_config('bolagio.refund_ok', 'no', true);
    perform bolagio_queue_reconciliation(p_intent_id, 'PAYMENT_REFUND_UNCERTAIN', 1,
      jsonb_build_object('capture_id', v_row.payment_capture_id, 'amount_cents', v_row.refund_required_cents));
    insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
    values ('booking.manual_review_required', p_intent_id, v_row.reference,
            jsonb_build_object('code', 'PAYMENT_REFUND_UNCERTAIN', 'reference', v_row.reference));
    return jsonb_build_object('ok', true, 'refund_state', 'unknown');
  end if;

  if p_outcome = 'failed' then
    perform set_config('bolagio.refund_ok', 'yes', true);
    update bolagio_booking_intents set refund_state = 'failed', refund_last_error = left(p_error, 400) where id = p_intent_id;
    perform set_config('bolagio.refund_ok', 'no', true);
    perform bolagio_queue_reconciliation(p_intent_id, 'PAYMENT_REFUND_FAILED', 2,
      jsonb_build_object('capture_id', v_row.payment_capture_id, 'error', left(p_error, 200)));
    return jsonb_build_object('ok', true, 'refund_state', 'failed');
  end if;

  return jsonb_build_object('ok', false, 'code', 'INVALID_OUTCOME');
end $$;

-- A failed refund may be retried by a person, explicitly.
create or replace function bolagio_reset_refund(p_intent_id uuid, p_actor text) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_booking_intents;
begin
  select * into v_row from bolagio_booking_intents where id = p_intent_id for update;
  if not found or v_row.refund_state <> 'failed' then return false; end if;
  perform set_config('bolagio.refund_ok', 'yes', true);
  update bolagio_booking_intents set refund_state = 'required', refund_last_error = null where id = p_intent_id;
  perform set_config('bolagio.refund_ok', 'no', true);
  insert into bolagio_booking_intent_events (intent_id, from_status, to_status, reason, detail)
  values (p_intent_id, v_row.status, v_row.status, 'refund_reset', jsonb_build_object('actor', left(p_actor, 200)));
  return true;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — the message-delivery ledger
-- ══════════════════════════════════════════════════════════════════════════
--
-- Outbox processing is at-least-once. A guest confirmation must be sent
-- exactly once. This table is where the two meet: one row per (booking,
-- message kind, sequence), claimed with a lease before a send and settled
-- after it, so a redelivered event, a second n8n worker or a crashed run
-- can never produce a second email.
--
-- No message body is stored. The destination is kept masked and hashed —
-- enough to answer "which address did it go to" and "was it the same one"
-- without keeping a guest's email in an operations table for years.

create table if not exists bolagio_message_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  intent_id           uuid references bolagio_booking_intents(id) on delete cascade,
  reference           text not null,
  kind                text not null check (kind in ('booking_confirmation','prearrival','checkin','checkout','review_request')),
  -- A deliberate resend is a NEW row with the next sequence, never a rewrite
  -- of the one that recorded the first send.
  sequence            smallint not null default 1 check (sequence >= 1),
  dedupe_key          text not null unique,
  channel             text not null default 'email' check (channel in ('email','sms','none')),
  locale              text not null default 'de',
  template_id         text,
  template_version    text,
  destination_masked  text,
  destination_hash    text,
  status              text not null default 'pending'
    check (status in ('pending','sending','sent','failed','skipped','suppressed')),
  retryable           boolean not null default true,
  attempts            smallint not null default 0,
  max_attempts        smallint not null default 5,
  claim_expires_at    timestamptz,
  next_attempt_at     timestamptz,
  provider            text,
  provider_message_id text,
  last_error          text,
  outbox_event_id     uuid,
  sent_at             timestamptz,
  failed_at           timestamptz,
  requeued_at         timestamptz,
  requeued_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists bolagio_message_deliveries_intent_idx on bolagio_message_deliveries (intent_id, created_at desc);
create index if not exists bolagio_message_deliveries_reference_idx on bolagio_message_deliveries (reference);
create index if not exists bolagio_message_deliveries_open_idx on bolagio_message_deliveries (status, created_at)
  where status in ('pending','sending','failed');

do $$ begin
  create trigger bolagio_message_deliveries_touch before update on bolagio_message_deliveries
    for each row execute function bolagio_touch_updated_at();
exception when duplicate_object then null; end $$;

comment on table bolagio_message_deliveries is
  'Delivery ledger for guest messages: one row per booking, kind and sequence. No message body; destination masked and hashed. The exactly-once effect on top of at-least-once events.';

-- Claim a delivery slot. Returns:
--   claimed        send it, then complete
--   already_sent   a previous run sent it (or it was skipped/suppressed); do nothing
--   in_progress    another worker holds the lease; do nothing, do not ack
--   not_retryable  it failed for good; a person requeues it
--   unknown_reference
create or replace function bolagio_begin_message_delivery(
  p_reference text,
  p_kind text,
  p_channel text default 'email',
  p_locale text default 'de',
  p_template_id text default null,
  p_template_version text default null,
  p_destination_masked text default null,
  p_destination_hash text default null,
  p_outbox_event_id uuid default null,
  p_sequence integer default 1,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_intent uuid;
  v_key text;
  v_row bolagio_message_deliveries;
begin
  select id into v_intent from bolagio_booking_intents where reference = p_reference;
  if v_intent is null then
    return jsonb_build_object('outcome','unknown_reference');
  end if;

  v_key := p_reference || ':' || p_kind || ':' || greatest(1, p_sequence);

  insert into bolagio_message_deliveries (intent_id, reference, kind, sequence, dedupe_key, channel, locale,
                                          template_id, template_version, destination_masked, destination_hash, outbox_event_id)
  values (v_intent, p_reference, p_kind, greatest(1, p_sequence), v_key, p_channel, p_locale,
          p_template_id, p_template_version, p_destination_masked, p_destination_hash, p_outbox_event_id)
  on conflict (dedupe_key) do nothing;

  select * into v_row from bolagio_message_deliveries where dedupe_key = v_key for update;

  if v_row.status in ('sent','skipped','suppressed') then
    return jsonb_build_object('outcome','already_sent','id', v_row.id, 'status', v_row.status,
                              'provider', v_row.provider, 'provider_message_id', v_row.provider_message_id, 'sent_at', v_row.sent_at);
  end if;
  if v_row.status = 'sending' and v_row.claim_expires_at is not null and v_row.claim_expires_at > now() then
    return jsonb_build_object('outcome','in_progress','id', v_row.id);
  end if;
  if v_row.status = 'failed' and not v_row.retryable then
    return jsonb_build_object('outcome','not_retryable','id', v_row.id, 'last_error', v_row.last_error);
  end if;
  if v_row.status = 'failed' and v_row.next_attempt_at is not null and v_row.next_attempt_at > now() then
    return jsonb_build_object('outcome','backoff','id', v_row.id, 'next_attempt_at', v_row.next_attempt_at);
  end if;

  update bolagio_message_deliveries set
    status = 'sending',
    attempts = attempts + 1,
    claim_expires_at = now() + make_interval(secs => greatest(30, least(3600, p_lease_seconds))),
    channel = p_channel, locale = p_locale,
    template_id = coalesce(p_template_id, template_id),
    template_version = coalesce(p_template_version, template_version),
    destination_masked = coalesce(p_destination_masked, destination_masked),
    destination_hash = coalesce(p_destination_hash, destination_hash),
    outbox_event_id = coalesce(outbox_event_id, p_outbox_event_id)
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object('outcome','claimed','id', v_row.id, 'attempt', v_row.attempts, 'sequence', v_row.sequence);
end $$;

create or replace function bolagio_complete_message_delivery(
  p_id uuid,
  p_outcome text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null,
  p_retryable boolean default true
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_message_deliveries;
begin
  select * into v_row from bolagio_message_deliveries where id = p_id for update;
  if not found then return false; end if;
  -- Only the run holding the claim settles it. A late completion from a
  -- previous, lapsed attempt is ignored rather than overwriting the record.
  if v_row.status <> 'sending' then return false; end if;

  if p_outcome = 'sent' then
    update bolagio_message_deliveries set
      status = 'sent', provider = left(p_provider, 60), provider_message_id = left(p_provider_message_id, 200),
      sent_at = now(), claim_expires_at = null, last_error = null, next_attempt_at = null
    where id = p_id;
  elsif p_outcome in ('skipped','suppressed') then
    update bolagio_message_deliveries set
      status = p_outcome, provider = left(p_provider, 60), claim_expires_at = null, last_error = left(p_error, 400)
    where id = p_id;
  elsif p_outcome = 'failed' then
    update bolagio_message_deliveries set
      status = 'failed', failed_at = now(), claim_expires_at = null,
      provider = coalesce(left(p_provider, 60), provider),
      last_error = left(coalesce(p_error, 'unspecified'), 400),
      retryable = p_retryable and v_row.attempts < v_row.max_attempts,
      next_attempt_at = now() + make_interval(secs => least(3600, power(2, least(v_row.attempts, 8))::integer * 30))
    where id = p_id;
  else
    return false;
  end if;
  return true;
end $$;

-- An operator's explicit retry of a delivery that failed for good.
create or replace function bolagio_requeue_message_delivery(p_id uuid, p_actor text) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_message_deliveries;
begin
  select * into v_row from bolagio_message_deliveries where id = p_id for update;
  if not found or v_row.status <> 'failed' then return false; end if;
  update bolagio_message_deliveries set
    status = 'pending', retryable = true, next_attempt_at = null, claim_expires_at = null,
    max_attempts = greatest(max_attempts, attempts + 3),
    requeued_at = now(), requeued_by = left(p_actor, 200)
  where id = p_id;
  return true;
end $$;

-- Deliveries that have not gone yet must not go once the stay is off.
create or replace function bolagio_suppress_message_deliveries(p_intent_id uuid, p_reason text) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update bolagio_message_deliveries set
    status = 'suppressed', claim_expires_at = null, last_error = left(p_reason, 200)
  where intent_id = p_intent_id and status in ('pending','failed');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- An operator's explicit retry of a dead-lettered automation event. The
-- outbox is not booking state, so this is a safe write; it is audited by the
-- caller.
create or replace function bolagio_requeue_outbox_event(p_id uuid, p_actor text) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_outbox_events;
begin
  select * into v_row from bolagio_outbox_events where id = p_id for update;
  if not found or v_row.status <> 'exhausted' then return false; end if;
  update bolagio_outbox_events set
    status = 'pending', attempts = 0, available_at = now(), claimed_at = null, claimed_by = null, claim_expires_at = null,
    last_error = left('requeued by ' || coalesce(p_actor, 'operator') || '; previous: ' || coalesce(v_row.last_error, ''), 500)
  where id = p_id;
  return true;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — cleaning operations
-- ══════════════════════════════════════════════════════════════════════════

alter table bolagio_turnovers
  add column if not exists assigned_to text,
  add column if not exists note text,
  add column if not exists started_at timestamptz;

do $$ begin
  alter table bolagio_turnovers drop constraint if exists bolagio_turnovers_status_check;
  alter table bolagio_turnovers add constraint bolagio_turnovers_status_check
    check (status in ('required','in_progress','done','void'));
end $$;

drop index if exists bolagio_turnovers_unit_departure_idx;
create index if not exists bolagio_turnovers_unit_departure_idx
  on bolagio_turnovers (unit_id, departure) where status in ('required','in_progress');
create index if not exists bolagio_turnovers_departure_idx on bolagio_turnovers (departure, status);

create table if not exists bolagio_turnover_events (
  id          uuid primary key default gen_random_uuid(),
  turnover_id uuid not null references bolagio_turnovers(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor       text not null default 'system',
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists bolagio_turnover_events_turnover_idx on bolagio_turnover_events (turnover_id, created_at desc);

comment on table bolagio_turnover_events is 'Append-only status history of cleaning turnovers. No guest data.';

-- The operator's status change. `void` is the sync's alone: a turnover is
-- void because its stay left `confirmed`, never because someone pressed a key.
create or replace function bolagio_set_turnover_status(
  p_turnover_id uuid,
  p_to text,
  p_actor text,
  p_note text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_turnovers; v_ok boolean;
begin
  select * into v_row from bolagio_turnovers where id = p_turnover_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_to = 'void' then return jsonb_build_object('ok', false, 'code', 'SYNC_ONLY', 'status', v_row.status); end if;
  if v_row.status = 'void' then return jsonb_build_object('ok', false, 'code', 'VOIDED', 'status', v_row.status); end if;
  if v_row.status = p_to then return jsonb_build_object('ok', true, 'noop', true, 'status', v_row.status); end if;

  v_ok := (v_row.status, p_to) in (('required','in_progress'), ('required','done'), ('in_progress','done'),
                                   ('in_progress','required'), ('done','required'));
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'ILLEGAL', 'status', v_row.status); end if;

  update bolagio_turnovers set
    status = p_to,
    started_at = case when p_to = 'in_progress' then coalesce(started_at, now()) else started_at end,
    done_at = case when p_to = 'done' then now() else null end,
    done_by = case when p_to = 'done' then left(p_actor, 200) else null end,
    note = coalesce(left(p_note, 400), note)
  where id = p_turnover_id;

  insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
  values (p_turnover_id, v_row.status, p_to, left(p_actor, 200), left(p_note, 400));

  return jsonb_build_object('ok', true, 'from', v_row.status, 'to', p_to);
end $$;

create or replace function bolagio_assign_turnover(p_turnover_id uuid, p_assignee text, p_actor text) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare v_row bolagio_turnovers;
begin
  select * into v_row from bolagio_turnovers where id = p_turnover_id for update;
  if not found or v_row.status = 'void' then return false; end if;
  update bolagio_turnovers set assigned_to = nullif(left(p_assignee, 120), '') where id = p_turnover_id;
  insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
  values (p_turnover_id, v_row.status, v_row.status, left(p_actor, 200),
          case when nullif(p_assignee, '') is null then 'unassigned' else 'assigned: ' || left(p_assignee, 120) end);
  return true;
end $$;

-- ── Turnover derivation, with an injectable clock ─────────────────────────
--
-- Same rules as before, plus:
--   * a `done` turnover whose departure moved is reopened (`required`) and
--     the change is recorded — the cleaning that happened was for a date
--     that is no longer the departure;
--   * a moved departure emits `cleaning.rescheduled`, a voided turnover
--     emits `cleaning.cancelled`, so a downstream task can be UPDATED or
--     CANCELLED rather than duplicated;
--   * `p_now` lets the DST and same-day cases be proven in SQL.
drop function if exists bolagio_sync_turnovers(integer);
create or replace function bolagio_sync_turnovers(
  p_horizon_days integer default 60,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
  v_updated integer := 0;
  v_voided  integer := 0;
  v_reopened integer := 0;
  r record;
  v_next date;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_existing bolagio_turnovers;
  v_payload jsonb;
begin
  for r in
    select i.id as intent_id, i.unit_id, i.reference, i.check_in, i.check_out,
           u.slug, u.timezone, u.check_in_time, u.check_out_time
    from bolagio_booking_intents i
    join bolagio_units u on u.id = i.unit_id
    where i.status = 'confirmed'
      and i.check_out >= ((p_now at time zone u.timezone)::date - 1)
      and i.check_out <= ((p_now at time zone u.timezone)::date + greatest(1, least(365, p_horizon_days)))
  loop
    select min(n.check_in) into v_next
    from bolagio_booking_intents n
    where n.unit_id = r.unit_id and n.status = 'confirmed' and n.check_in >= r.check_out and n.id <> r.intent_id;

    -- Local wall-clock on the departure day, converted in the unit's zone:
    -- correct across both DST transitions.
    v_window_start := (r.check_out::timestamp + r.check_out_time) at time zone r.timezone;
    v_window_end   := (r.check_out::timestamp + r.check_in_time)  at time zone r.timezone;

    select * into v_existing from bolagio_turnovers where intent_id = r.intent_id;

    v_payload := jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                    'departure', r.check_out, 'nextArrival', v_next,
                                    'sameDay', coalesce(v_next = r.check_out, false),
                                    'windowStart', v_window_start, 'windowEnd', v_window_end);

    if v_existing.id is null then
      insert into bolagio_turnovers (unit_id, intent_id, departure, window_start, window_end, next_arrival, same_day)
      values (r.unit_id, r.intent_id, r.check_out, v_window_start, v_window_end, v_next, coalesce(v_next = r.check_out, false));
      v_created := v_created + 1;
      insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
      values ('cleaning.required', 'turnover', r.intent_id, r.reference, v_payload);
      continue;
    end if;

    if v_existing.departure is distinct from r.check_out
       or v_existing.next_arrival is distinct from v_next
       or v_existing.same_day is distinct from coalesce(v_next = r.check_out, false)
       or v_existing.status = 'void' then
      update bolagio_turnovers set
        departure = r.check_out, window_start = v_window_start, window_end = v_window_end,
        next_arrival = v_next, same_day = coalesce(v_next = r.check_out, false),
        status = case
          when status = 'void' then 'required'
          -- The cleaning already done was for another day.
          when status = 'done' and v_existing.departure is distinct from r.check_out then 'required'
          else status end,
        done_at = case when status = 'done' and v_existing.departure is distinct from r.check_out then null else done_at end,
        done_by = case when status = 'done' and v_existing.departure is distinct from r.check_out then null else done_by end
      where id = v_existing.id;

      if v_existing.status = 'void' then
        insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
        values (v_existing.id, 'void', 'required', 'system', 'stay confirmed again');
        insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
        values ('cleaning.required', 'turnover', r.intent_id, r.reference, v_payload);
        v_created := v_created + 1;
      else
        if v_existing.status = 'done' and v_existing.departure is distinct from r.check_out then
          insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
          values (v_existing.id, 'done', 'required', 'system',
                  'departure moved from ' || v_existing.departure || ' to ' || r.check_out);
          v_reopened := v_reopened + 1;
        end if;
        insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
        values ('cleaning.rescheduled', 'turnover', r.intent_id, r.reference,
                v_payload || jsonb_build_object('previousDeparture', v_existing.departure));
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- Stays that left `confirmed` no longer imply cleaning. Voided, never
  -- deleted, and announced so a downstream task can be cancelled.
  for r in
    select t.id, t.intent_id, i.reference, u.slug, t.departure, t.status
    from bolagio_turnovers t
    join bolagio_booking_intents i on i.id = t.intent_id
    join bolagio_units u on u.id = t.unit_id
    where t.status in ('required','in_progress') and i.status <> 'confirmed'
  loop
    update bolagio_turnovers set status = 'void' where id = r.id;
    insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
    values (r.id, r.status, 'void', 'system', 'stay no longer confirmed');
    insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
    values ('cleaning.cancelled', 'turnover', r.intent_id, r.reference,
            jsonb_build_object('reference', r.reference, 'unitSlug', r.slug, 'departure', r.departure));
    v_voided := v_voided + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'voided', v_voided, 'reopened', v_reopened);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — guest-operations timing on the unit; check-out and invoice events
-- ══════════════════════════════════════════════════════════════════════════

alter table bolagio_units
  add column if not exists prearrival_days     smallint not null default 3  check (prearrival_days between 0 and 30),
  add column if not exists checkout_notice_days smallint not null default 1 check (checkout_notice_days between 0 and 7),
  add column if not exists review_delay_days   smallint not null default 1  check (review_delay_days between 0 and 30),
  add column if not exists review_window_days  smallint not null default 14 check (review_window_days between 1 and 90);

comment on column bolagio_units.prearrival_days is 'guest.prearrival_ready fires when check-in is this many days away or fewer (property calendar).';
comment on column bolagio_units.checkout_notice_days is 'guest.checkout_ready fires this many days before check-out (0 = on the departure day).';

do $$ begin
  alter table bolagio_guest_events drop constraint if exists bolagio_guest_events_kind_check;
  alter table bolagio_guest_events add constraint bolagio_guest_events_kind_check
    check (kind in ('guest.prearrival_ready','guest.checkin_ready','guest.checkout_ready','review.requested','invoice.required'));
end $$;

drop function if exists bolagio_emit_guest_events(integer, integer, integer);
create or replace function bolagio_emit_guest_events(
  p_prearrival_days integer default 3,
  p_review_delay_days integer default 1,
  p_review_window_days integer default 14,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prearrival integer := 0;
  v_checkin integer := 0;
  v_checkout integer := 0;
  v_review integer := 0;
  v_invoice integer := 0;
  r record;
  v_today date;
  v_kind text;
  v_pre integer; v_notice integer; v_delay integer; v_window integer;
begin
  for r in
    select i.id, i.reference, i.check_in, i.check_out, u.slug, u.timezone,
           u.prearrival_days, u.checkout_notice_days, u.review_delay_days, u.review_window_days
    from bolagio_booking_intents i
    join bolagio_units u on u.id = i.unit_id
    where i.status = 'confirmed'
      and i.check_out >= ((p_now at time zone u.timezone)::date - greatest(1, coalesce(u.review_delay_days, p_review_delay_days) + coalesce(u.review_window_days, p_review_window_days)))
      and i.check_in  <= ((p_now at time zone u.timezone)::date + greatest(0, coalesce(u.prearrival_days, p_prearrival_days)))
  loop
    v_today  := (p_now at time zone r.timezone)::date;
    v_pre    := coalesce(r.prearrival_days, p_prearrival_days);
    v_notice := coalesce(r.checkout_notice_days, 1);
    v_delay  := coalesce(r.review_delay_days, p_review_delay_days);
    v_window := coalesce(r.review_window_days, p_review_window_days);

    if r.check_in - v_today between 0 and greatest(0, v_pre) then
      v_kind := 'guest.prearrival_ready';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind) on conflict do nothing;
      if found then
        v_prearrival := v_prearrival + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                   'checkIn', r.check_in, 'checkOut', r.check_out, 'daysUntilArrival', r.check_in - v_today));
      end if;
    end if;

    if r.check_in = v_today then
      v_kind := 'guest.checkin_ready';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind) on conflict do nothing;
      if found then
        v_checkin := v_checkin + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug, 'checkIn', r.check_in, 'checkOut', r.check_out));
      end if;
    end if;

    -- Check-out: a notice before departure, only once the guest has arrived
    -- (a one-night stay gets check-in and check-out notices on the same day).
    if r.check_out - v_today between 0 and greatest(0, v_notice) and v_today >= r.check_in then
      v_kind := 'guest.checkout_ready';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind) on conflict do nothing;
      if found then
        v_checkout := v_checkout + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug, 'checkIn', r.check_in, 'checkOut', r.check_out,
                                   'daysUntilDeparture', r.check_out - v_today));
      end if;
    end if;

    if v_today - r.check_out between greatest(0, v_delay) and greatest(0, v_delay) + greatest(1, v_window) then
      v_kind := 'review.requested';
      insert into bolagio_guest_events (intent_id, kind) values (r.id, v_kind) on conflict do nothing;
      if found then
        v_review := v_review + 1;
        insert into bolagio_outbox_events (event_type, aggregate_id, reference, payload)
        values (v_kind, r.id, r.reference,
                jsonb_build_object('reference', r.reference, 'unitSlug', r.slug, 'checkIn', r.check_in, 'checkOut', r.check_out));
      end if;
    end if;
  end loop;

  -- Invoice required: every confirmed, paid direct booking, once. Not date
  -- bound — an invoice is owed at confirmation, not at arrival. The payload
  -- is a reference and the settled amount; the generator reads the rest.
  for r in
    select i.id, i.reference, i.paid_amount_cents, i.paid_currency, i.currency, i.paid_at, i.confirmed_at, i.unit_id, u.slug
    from bolagio_booking_intents i
    join bolagio_units u on u.id = i.unit_id
    where i.status = 'confirmed' and i.source = 'direct'
      and i.payment_status in ('paid','partially_refunded','disputed')
      and not exists (select 1 from bolagio_guest_events g where g.intent_id = i.id and g.kind = 'invoice.required')
    limit 200
  loop
    insert into bolagio_guest_events (intent_id, kind) values (r.id, 'invoice.required') on conflict do nothing;
    if found then
      v_invoice := v_invoice + 1;
      insert into bolagio_outbox_events (event_type, aggregate_type, aggregate_id, reference, payload)
      values ('invoice.required', 'invoice', r.id, r.reference,
              jsonb_build_object('reference', r.reference, 'unitSlug', r.slug,
                                 'amountCents', r.paid_amount_cents, 'currency', coalesce(r.paid_currency, r.currency),
                                 'paidAt', r.paid_at, 'confirmedAt', r.confirmed_at));
    end if;
  end loop;

  return jsonb_build_object('prearrival', v_prearrival, 'checkin', v_checkin, 'checkout', v_checkout,
                            'review', v_review, 'invoice', v_invoice);
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — integration health observations
-- ══════════════════════════════════════════════════════════════════════════
--
-- "When did we last hear from Beds24, and was it good news?" was not
-- answerable without a probe. Every provider call and every automation
-- request now leaves a timestamp here, so the System page can say "last
-- success 4 minutes ago" or "never observed" — and never a green dot it did
-- not earn.

create table if not exists bolagio_integration_health (
  provider    text not null,
  signal      text not null,
  observed_at timestamptz not null default now(),
  detail      text,
  primary key (provider, signal)
);

create or replace function bolagio_observe_integration(p_provider text, p_signal text, p_detail text default null)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into bolagio_integration_health (provider, signal, observed_at, detail)
  values (left(p_provider, 40), left(p_signal, 60), now(), left(p_detail, 200))
  on conflict (provider, signal) do update set observed_at = now(), detail = excluded.detail;
$$;

comment on table bolagio_integration_health is
  'Last observation per (provider, signal): beds24/paypal success+failure, paypal verified webhook, n8n claim/ack/fail. Timestamps only.';

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — invoice numbering
-- ══════════════════════════════════════════════════════════════════════════
--
-- A gapless sequence per series, locked per call. It exists so the invoice
-- generator — when tax configuration makes generation legal — has a number
-- source that is not a database sequence (which can skip). NOTHING calls it
-- yet; no invoice is produced by this repository.

create table if not exists bolagio_invoice_sequences (
  series      text primary key,
  last_number integer not null default 0 check (last_number >= 0),
  updated_at  timestamptz not null default now()
);

create or replace function bolagio_next_invoice_number(p_series text) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare v_next integer;
begin
  insert into bolagio_invoice_sequences (series) values (p_series) on conflict (series) do nothing;
  update bolagio_invoice_sequences set last_number = last_number + 1, updated_at = now()
  where series = p_series returning last_number into v_next;
  return v_next;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — views
-- ══════════════════════════════════════════════════════════════════════════

create or replace view bolagio_ops_queues as
select 'outbox' as queue, status::text as state, count(*) as items, min(created_at) as oldest
from bolagio_outbox_events group by 1,2
union all
select 'payment_events', status::text, count(*), min(received_at) from bolagio_payment_events group by 1,2
union all
select 'reconciliation', status::text, count(*), min(created_at) from bolagio_reconciliation_jobs group by 1,2
union all
select 'external_operations', outcome::text, count(*), min(started_at) from bolagio_external_operations group by 1,2
union all
select 'turnovers', status, count(*), min(created_at) from bolagio_turnovers group by 1,2
union all
select 'message_deliveries', status, count(*), min(created_at) from bolagio_message_deliveries group by 1,2;

-- The attention view learns the refund states that need a person. Dropped and
-- recreated: a view cannot gain a column in the middle of its list in place.
drop view if exists bolagio_ops_attention;
create view bolagio_ops_attention as
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
  i.refund_state,
  case
    when i.status in ('paid_unfinalized','finalization_failed') then 1
    when i.status = 'manual_review' then 1
    when i.refund_state in ('unknown','failed') then 1
    when i.status = 'release_failed' then 2
    when i.payment_status = 'unknown' then 2
    when i.status = 'paid' and i.confirmed_at is null then 2
    when i.status = 'expired' then 2
    when i.refund_state = 'required' then 3
    when i.status in ('releasing','locking') then 3
    when i.status in ('payment_failed','payment_cancelled')
         and i.hold_expires_at is not null and i.hold_expires_at < now() - interval '30 minutes' then 3
    else 4
  end as severity
from bolagio_booking_intents i
join bolagio_units u on u.id = i.unit_id
where i.status in ('locking','paid','paid_unfinalized','finalization_failed',
                   'releasing','release_failed','manual_review','expired')
   or (i.status in ('payment_failed','payment_cancelled')
       and i.hold_expires_at is not null and i.hold_expires_at < now() - interval '30 minutes')
   or i.payment_status = 'unknown'
   or i.reconciliation_state <> 'ok'
   or i.refund_state in ('required','pending','unknown','failed');

-- ══════════════════════════════════════════════════════════════════════════
-- SECTION 9 — RLS and privileges
-- ══════════════════════════════════════════════════════════════════════════

alter table bolagio_message_deliveries  enable row level security;
alter table bolagio_turnover_events     enable row level security;
alter table bolagio_integration_health  enable row level security;
alter table bolagio_invoice_sequences   enable row level security;

revoke all on bolagio_message_deliveries, bolagio_turnover_events, bolagio_integration_health, bolagio_invoice_sequences
  from anon, authenticated;
revoke all on bolagio_ops_queues, bolagio_ops_attention from anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'bolagio_request_cancellation(uuid,text,text,boolean,integer,text)',
    'bolagio_complete_cancellation(uuid,text)',
    'bolagio_begin_refund(uuid,text)',
    'bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text)',
    'bolagio_reset_refund(uuid,text)',
    'bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer)',
    'bolagio_complete_message_delivery(uuid,text,text,text,text,boolean)',
    'bolagio_requeue_message_delivery(uuid,text)',
    'bolagio_suppress_message_deliveries(uuid,text)',
    'bolagio_requeue_outbox_event(uuid,text)',
    'bolagio_set_turnover_status(uuid,text,text,text)',
    'bolagio_assign_turnover(uuid,text,text)',
    'bolagio_sync_turnovers(integer,timestamptz)',
    'bolagio_emit_guest_events(integer,integer,integer,timestamptz)',
    'bolagio_observe_integration(text,text,text)',
    'bolagio_next_invoice_number(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
