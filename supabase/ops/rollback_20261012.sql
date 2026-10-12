-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20261012120000_booking_bedroom_package.sql. Run in ONE
-- transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20261012.sql
--
-- Drops `bolagio_booking_intents.bedroom_package` and its two constraints.
--
-- ── Before running it ─────────────────────────────────────────────────────
-- Deploy an application build WITHOUT the bedroom package first: this one
-- writes the column on every new intent, and an insert naming a dropped column
-- fails. Reads are unaffected (the column is not in INTENT_COLUMNS).
--
-- The column carries a guest's stated setup and no money; dropping it loses
-- that statement for any intent that has one, and nothing else.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

alter table bolagio_booking_intents drop constraint if exists bolagio_intent_bedroom_package_party;
alter table bolagio_booking_intents drop constraint if exists bolagio_intent_bedroom_package_value;
alter table bolagio_booking_intents drop column if exists bedroom_package;
