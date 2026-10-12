-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK of 20261012120000_booking_bedroom_package.sql. Run in ONE
-- transaction:
--
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20261012.sql
--
-- Drops `bolagio_booking_intents.bedroom_package` / `.beds24_offer_id` and
-- `bolagio_reservations.bedroom_package` / `.external_offer_id`, with their
-- constraints.
--
-- ── Before running it ─────────────────────────────────────────────────────
-- Deploy an application build WITHOUT the bedroom package first: this one
-- writes these columns on every new intent and, when present, on imported
-- reservations; an insert naming a dropped column fails. The reservation
-- import checks for the columns once per run and stops writing them when they
-- are gone, so a rollback without a redeploy degrades instead of failing.
--
-- The column carries a guest's stated setup and no money; dropping it loses
-- that statement for any intent that has one, and nothing else.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

alter table bolagio_booking_intents drop constraint if exists bolagio_intent_bedroom_package_party;
alter table bolagio_booking_intents drop constraint if exists bolagio_intent_bedroom_package_value;
alter table bolagio_booking_intents drop constraint if exists bolagio_intent_beds24_offer_id_positive;
alter table bolagio_booking_intents drop column if exists bedroom_package;
alter table bolagio_booking_intents drop column if exists beds24_offer_id;

alter table bolagio_reservations drop constraint if exists bolagio_reservation_bedroom_package_value;
alter table bolagio_reservations drop column if exists bedroom_package;
alter table bolagio_reservations drop column if exists external_offer_id;
