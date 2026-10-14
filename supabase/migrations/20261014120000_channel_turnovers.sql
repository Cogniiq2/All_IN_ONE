-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — TURNOVERS FROM CHANNEL RESERVATIONS (2026-10-14)
--
-- Until now a cleaning turnover was derived only from a CONFIRMED DIRECT
-- booking (`bolagio_booking_intents`, see 20260921 §4). Direct booking is
-- shut, so every real stay arrives through Beds24 into `bolagio_reservations`
-- and the Cleaning board had nothing to derive from: "No turnover has been
-- derived yet" was the truthful state, not a bug.
--
-- This migration lets a turnover come from an imported reservation as well:
--
--   bolagio_turnovers.reservation_id   the stay it came from, when imported
--   bolagio_turnovers.intent_id        now nullable; exactly one of the two
--
-- and adds `bolagio_sync_channel_turnovers()`, the reservation twin of
-- `bolagio_sync_turnovers()`: one turnover per ACTIVE reservation departing
-- inside the horizon, updated when the stay moves, voided when the
-- reservation stops being active, never duplicated, never deleted.
--
-- ── No duplicates ─────────────────────────────────────────────────────────
-- A direct booking appears in both tables, linked by `direct_intent_id`; its
-- turnover keeps coming from the intent, and the reservation side skips it.
-- A reservation whose link is missing is still skipped when an intent-derived
-- turnover already covers the same unit and departure.
--
-- ── No automation events, on purpose ─────────────────────────────────────
-- `bolagio_sync_turnovers` emits `cleaning.required` / `.rescheduled` /
-- `.cancelled` into the outbox, which the automation platform acts on. This
-- function emits NOTHING: the Cleaning board itself is the work list for
-- channel stays, and wiring the automations to them is a separate, deliberate
-- decision (docs/beds24-reservations.md §Cleaning). The next-arrival lookup
-- uses `bolagio_reservations` only — every stay, direct ones included, is
-- there — so the one source of truth stays one.
--
-- ── Safe to apply at any time ─────────────────────────────────────────────
-- Additive; the application tolerates the function being absent (the pass
-- skips channel derivation and the board shows channel departures as a
-- planning list, as before). Rollback: supabase/ops/rollback_20261014.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table bolagio_turnovers
  add column if not exists reservation_id uuid references bolagio_reservations(id) on delete cascade;

alter table bolagio_turnovers alter column intent_id drop not null;

alter table bolagio_turnovers drop constraint if exists bolagio_turnovers_origin_check;
alter table bolagio_turnovers add constraint bolagio_turnovers_origin_check
  check ((intent_id is null) <> (reservation_id is null));

create unique index if not exists bolagio_turnovers_reservation_uq
  on bolagio_turnovers (reservation_id) where reservation_id is not null;

comment on column bolagio_turnovers.reservation_id is
  'The imported reservation this turnover was derived from; null for a turnover derived from a direct booking intent. Exactly one of intent_id / reservation_id is set.';

create or replace function bolagio_sync_channel_turnovers(
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
begin
  for r in
    select s.id as reservation_id, s.unit_id, s.check_in, s.check_out,
           u.slug, u.timezone, u.check_in_time, u.check_out_time
    from bolagio_reservations s
    join bolagio_units u on u.id = s.unit_id
    where s.status_class = 'active'
      and s.direct_intent_id is null
      and s.check_out >= ((p_now at time zone u.timezone)::date - 1)
      and s.check_out <= ((p_now at time zone u.timezone)::date + greatest(1, least(365, p_horizon_days)))
      -- An intent-derived turnover for the same room and day already covers it.
      and not exists (
        select 1 from bolagio_turnovers t
        where t.intent_id is not null and t.unit_id = s.unit_id and t.departure = s.check_out and t.status <> 'void')
  loop
    select min(n.check_in) into v_next
    from bolagio_reservations n
    where n.unit_id = r.unit_id and n.status_class = 'active' and n.check_in >= r.check_out and n.id <> r.reservation_id;

    v_window_start := (r.check_out::timestamp + r.check_out_time) at time zone r.timezone;
    v_window_end   := (r.check_out::timestamp + r.check_in_time)  at time zone r.timezone;

    select * into v_existing from bolagio_turnovers where reservation_id = r.reservation_id;

    if v_existing.id is null then
      insert into bolagio_turnovers (unit_id, reservation_id, departure, window_start, window_end, next_arrival, same_day)
      values (r.unit_id, r.reservation_id, r.check_out, v_window_start, v_window_end, v_next, coalesce(v_next = r.check_out, false));
      v_created := v_created + 1;
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
          when status = 'done' and v_existing.departure is distinct from r.check_out then 'required'
          else status end,
        done_at = case when status = 'done' and v_existing.departure is distinct from r.check_out then null else done_at end,
        done_by = case when status = 'done' and v_existing.departure is distinct from r.check_out then null else done_by end
      where id = v_existing.id;

      if v_existing.status = 'void' then
        insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
        values (v_existing.id, 'void', 'required', 'system', 'reservation active again');
        v_created := v_created + 1;
      else
        if v_existing.status = 'done' and v_existing.departure is distinct from r.check_out then
          insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
          values (v_existing.id, 'done', 'required', 'system',
                  'departure moved from ' || v_existing.departure || ' to ' || r.check_out);
          v_reopened := v_reopened + 1;
        end if;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- A reservation that is no longer active (cancelled at the channel, or
  -- reclassified) no longer implies cleaning. Voided, never deleted.
  for r in
    select t.id, t.status
    from bolagio_turnovers t
    join bolagio_reservations s on s.id = t.reservation_id
    where t.status in ('required','in_progress') and s.status_class <> 'active'
  loop
    update bolagio_turnovers set status = 'void' where id = r.id;
    insert into bolagio_turnover_events (turnover_id, from_status, to_status, actor, note)
    values (r.id, r.status, 'void', 'system', 'reservation no longer active');
    v_voided := v_voided + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'voided', v_voided, 'reopened', v_reopened);
end $$;

comment on function bolagio_sync_channel_turnovers(integer, timestamptz) is
  'Derive one cleaning turnover per active imported reservation departing inside the horizon. Idempotent. Emits no outbox events.';

do $$
declare fn text;
begin
  foreach fn in array array['bolagio_sync_channel_turnovers(integer,timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
    if exists (select 1 from pg_roles where rolname = 'bolagio_app') then
      execute format('grant execute on function %s to bolagio_app', fn);
    end if;
  end loop;
end $$;
