-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20260923120000_reservation_import.sql. Run in ONE transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260923.sql
--
-- Drops the canonical reservation table and its two types, and narrows the
-- scheduler job check back to the three jobs that existed before.
--
-- ── What it REFUSES to do silently ────────────────────────────────────────
-- `bolagio_reservations` holds the record of real guest stays: names, dates,
-- amounts and the provider's own snapshot. That is a commercial record
-- (§ 147 AO, § 257 HGB) and personal data under the GDPR, and no script
-- drops it by surprise. If the table holds any row, this script stops unless
-- the operator has said, in the session, that they have exported it:
--
--   set bolagio.reservation_rollback_confirmed = 'I have exported the reservations';
--
-- The data can always be rebuilt from Beds24 by re-running the import — the
-- table is a read model, not an authority — but "can be rebuilt" is not the
-- same as "is rebuilt", and a rollback during an outage would be exactly
-- when it cannot be.
--
-- ── What it never touches ─────────────────────────────────────────────────
-- Nothing else. `bolagio_booking_intents`, `bolagio_unit_inventory_days`,
-- `bolagio_unit_integrations`, the finance schema and every Cogniiq object
-- are untouched: the reservation table has no foreign key INTO it from
-- anywhere, only out of it, so dropping it cannot cascade.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

do $$ begin
  if to_regclass('public.bolagio_reservations') is null then return; end if;
  if coalesce(current_setting('bolagio.reservation_rollback_confirmed', true), '') <> 'I have exported the reservations' then
    if exists (select 1 from bolagio_reservations) then
      raise exception 'rollback refused: bolagio_reservations holds % row(s). Export them, or set bolagio.reservation_rollback_confirmed.',
        (select count(*) from bolagio_reservations);
    end if;
  end if;
end $$;

drop trigger if exists bolagio_reservations_touch on bolagio_reservations;
drop table if exists bolagio_reservations;
drop type if exists bolagio_reservation_class;
drop type if exists bolagio_reservation_source;

-- The scheduler check, back to the three jobs. Any heartbeat rows the import
-- wrote are removed first, or the narrowed constraint could not be added.
do $$ begin
  if to_regclass('public.bolagio_scheduler_runs') is null then return; end if;
  delete from bolagio_scheduler_runs where job = 'reservation_sync';
  alter table bolagio_scheduler_runs drop constraint if exists bolagio_scheduler_runs_job_check;
  alter table bolagio_scheduler_runs
    add constraint bolagio_scheduler_runs_job_check
    check (job in ('reconcile', 'inventory_sync', 'operations'));
end $$;
