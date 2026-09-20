-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260921120000_platform_completion.sql. Run in ONE transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260921.sql
--
-- Restores the 2026-09-20 definitions of the functions this migration
-- replaced, drops the tables and columns it added, and REFUSES to run if any
-- of them carries state that would be lost: a cancellation in progress, a
-- refund that is not settled, an open message delivery, a turnover being
-- worked. Those are operational facts; roll the application back first and
-- let them finish, or resolve them by hand.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

do $$ begin
  if exists (select 1 from bolagio_booking_intents where refund_state in ('required','pending','unknown','failed')) then
    raise exception 'rollback refused: refunds in flight';
  end if;
  if exists (select 1 from bolagio_booking_intents where cancellation_requested_at is not null and cancellation_completed_at is null) then
    raise exception 'rollback refused: cancellations in flight';
  end if;
  if exists (select 1 from bolagio_message_deliveries where status in ('pending','sending')) then
    raise exception 'rollback refused: message deliveries in flight';
  end if;
  if exists (select 1 from bolagio_turnovers where status = 'in_progress') then
    raise exception 'rollback refused: turnovers in progress';
  end if;
end $$;

drop function if exists bolagio_request_cancellation(uuid,text,text,boolean,integer,text);
drop function if exists bolagio_complete_cancellation(uuid,text);
drop function if exists bolagio_begin_refund(uuid,text);
drop function if exists bolagio_record_refund_outcome(uuid,text,text,integer,text,text,text);
drop function if exists bolagio_reset_refund(uuid,text);
drop function if exists bolagio_begin_message_delivery(text,text,text,text,text,text,text,text,uuid,integer,integer);
drop function if exists bolagio_complete_message_delivery(uuid,text,text,text,text,boolean);
drop function if exists bolagio_requeue_message_delivery(uuid,text);
drop function if exists bolagio_suppress_message_deliveries(uuid,text);
drop function if exists bolagio_requeue_outbox_event(uuid,text);
drop function if exists bolagio_set_turnover_status(uuid,text,text,text);
drop function if exists bolagio_assign_turnover(uuid,text,text);
drop function if exists bolagio_observe_integration(text,text,text);
drop function if exists bolagio_next_invoice_number(text);

drop view if exists bolagio_ops_attention;
drop view if exists bolagio_ops_queues;

drop table if exists bolagio_message_deliveries;
drop table if exists bolagio_turnover_events;
drop table if exists bolagio_integration_health;
drop table if exists bolagio_invoice_sequences;

alter table bolagio_turnovers drop column if exists assigned_to, drop column if exists note, drop column if exists started_at;
update bolagio_turnovers set status = 'required' where status = 'in_progress';
alter table bolagio_turnovers drop constraint if exists bolagio_turnovers_status_check;
alter table bolagio_turnovers add constraint bolagio_turnovers_status_check check (status in ('required','done','void'));
drop index if exists bolagio_turnovers_departure_idx;
drop index if exists bolagio_turnovers_unit_departure_idx;
create index if not exists bolagio_turnovers_unit_departure_idx on bolagio_turnovers (unit_id, departure) where status = 'required';

delete from bolagio_guest_events where kind in ('guest.checkout_ready','invoice.required');
alter table bolagio_guest_events drop constraint if exists bolagio_guest_events_kind_check;
alter table bolagio_guest_events add constraint bolagio_guest_events_kind_check
  check (kind in ('guest.prearrival_ready','guest.checkin_ready','review.requested'));

alter table bolagio_units
  drop column if exists prearrival_days, drop column if exists checkout_notice_days,
  drop column if exists review_delay_days, drop column if exists review_window_days;

alter table bolagio_booking_intents
  drop constraint if exists bolagio_refund_state_check,
  drop constraint if exists bolagio_refund_required_cents_check,
  drop constraint if exists bolagio_refund_completed_evidence,
  drop constraint if exists bolagio_refund_requires_money,
  drop constraint if exists bolagio_refund_requires_authorization,
  drop constraint if exists bolagio_refund_required_amount;
drop index if exists bolagio_booking_intents_refund_idx;
alter table bolagio_booking_intents
  drop column if exists cancellation_requested_at, drop column if exists cancellation_requested_by,
  drop column if exists cancellation_reason, drop column if exists cancellation_authorized_by,
  drop column if exists cancellation_completed_at, drop column if exists refund_state,
  drop column if exists refund_required_cents, drop column if exists refund_id,
  drop column if exists refund_requested_at, drop column if exists refund_completed_at,
  drop column if exists refund_last_error;

drop function if exists bolagio_sync_turnovers(integer, timestamptz);
drop function if exists bolagio_emit_guest_events(integer, integer, integer, timestamptz);

-- The 2026-09-20 definitions, verbatim, follow. They are re-applied by
-- re-running that migration, which is idempotent:
--   psql "$DATABASE_URL" -f supabase/migrations/20260920120000_booking_production_hardening.sql
-- (that recreates the status guard, the two functions, and both views).
create or replace function bolagio_booking_status_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('bolagio.transition_ok', true), 'no') <> 'yes' then
      raise exception 'bolagio: direct status change % -> % is not permitted; use bolagio_booking_transition()', old.status, new.status using errcode = 'check_violation';
    end if;
    if not bolagio_transition_allowed(old.status, new.status) then
      raise exception 'bolagio: illegal transition % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;
  if new.payment_status is distinct from old.payment_status
     and not bolagio_payment_transition_allowed(old.payment_status, new.payment_status) then
    raise exception 'bolagio: illegal payment transition % -> %', old.payment_status, new.payment_status using errcode = 'check_violation';
  end if;
  return new;
end $$;
