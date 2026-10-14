-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20261014120000_channel_turnovers.sql. Run in ONE transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20261014.sql
--
-- Drops `bolagio_sync_channel_turnovers`, every turnover derived from an
-- imported reservation (with its status history, by cascade), the origin
-- check, and `bolagio_turnovers.reservation_id`; `intent_id` becomes
-- mandatory again.
--
-- ── Before running it ─────────────────────────────────────────────────────
-- Nothing to deploy first: the application tolerates the function and the
-- column being absent (the operations pass skips channel derivation, the
-- Cleaning board falls back to the planning list). What is lost is the
-- done / assigned state recorded on channel turnovers, and nothing else:
-- intent-derived turnovers are untouched.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

drop function if exists bolagio_sync_channel_turnovers(integer, timestamptz);

delete from bolagio_turnovers where reservation_id is not null;

alter table bolagio_turnovers drop constraint if exists bolagio_turnovers_origin_check;
drop index if exists bolagio_turnovers_reservation_uq;
alter table bolagio_turnovers drop column if exists reservation_id;
alter table bolagio_turnovers alter column intent_id set not null;
