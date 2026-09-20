-- ════════════════════════════════════════════════════════════════════════════
-- BoLaGio — booking registry seed.
--
-- NOT a migration. Run it once by hand (Supabase SQL editor, or psql) after
-- 20260916120000_booking_foundation.sql, then edit the two rows at the bottom
-- with the real Beds24 ids.
--
-- It is separate from the migration on purpose: a migration describes the
-- SHAPE of the database and should be identical everywhere, while which unit
-- is bookable and which Beds24 room it maps to is operational data that
-- differs between a staging project and production and changes without a
-- deploy.
--
-- Safe to re-run. Every statement is an idempotent upsert; none of them
-- deletes anything.
-- ════════════════════════════════════════════════════════════════════════════

-- ── The units ──────────────────────────────────────────────────────────────
--
-- `slug` joins to lib/content/apartments.ts, which stays the editorial source
-- of truth for names, copy and photography.
--
-- `max_guests` and `min_nights` are NULL because the owners have not confirmed
-- occupancy or a minimum stay for any unit. NULL means "not verified", and the
-- application falls back to a conservative four rather than inventing a figure.
-- Set them here as soon as the real numbers are known — no deploy needed.
--
-- `is_bookable` is FALSE for every unit. Nothing can be booked online until it
-- is explicitly switched on, per unit, after its Beds24 mapping is in place and
-- an inventory sync has run successfully. Turning it on is the deliberate act
-- that opens a residence for sale.

-- `timezone`, `check_in_time` and `check_out_time` are the house rules
-- (Europe/Berlin, 14:00 / 11:00) and exist once
-- 20260920120000_booking_production_hardening.sql is applied. They drive the
-- turnover window and the guest-operations timing, per unit.

insert into bolagio_units (slug, display_name, max_guests, min_nights, currency, is_bookable, timezone, check_in_time, check_out_time)
values
  ('schulstrasse-i',    'Schulstraße I',    null, null, 'EUR', false, 'Europe/Berlin', '14:00', '11:00'),
  ('schulstrasse-ii',   'Schulstraße II',   null, null, 'EUR', false, 'Europe/Berlin', '14:00', '11:00'),
  -- The three Opernstraße flats are in renovation. They carry
  -- status 'in-preparation' in the content file, which already keeps them out
  -- of the booking flow; they are listed here so their mapping can be prepared
  -- ahead of opening.
  ('opernstrasse-i',    'Opernstraße I',    null, null, 'EUR', false, 'Europe/Berlin', '14:00', '11:00'),
  ('opernstrasse-ii',   'Opernstraße II',   null, null, 'EUR', false, 'Europe/Berlin', '14:00', '11:00'),
  ('opernstrasse-iii',  'Opernstraße III',  null, null, 'EUR', false, 'Europe/Berlin', '14:00', '11:00')
on conflict (slug) do update
  set display_name   = excluded.display_name,
      timezone       = excluded.timezone,
      check_in_time  = excluded.check_in_time,
      check_out_time = excluded.check_out_time;

-- ── The Beds24 mapping ─────────────────────────────────────────────────────
--
-- CONFIRMED against the live Beds24 account on 2026-09-17 by enumerating it
-- (`GET /properties?includeAllRooms=true`) rather than by assumption. An
-- earlier revision of this file guessed, and guessed wrong: property 354659
-- was assumed to be one unit and is in fact the other.
--
-- These ids appear in the database and nowhere else. No component, route or
-- content file knows a Beds24 id — the frontend only ever knows a slug, and
-- the mapping is resolved server-side at request time. That is what makes a
-- channel-manager change a data migration rather than a refactor.

insert into bolagio_unit_integrations
  (unit_id, provider, external_property_id, external_room_id, enabled)
select id, 'beds24', '354659', '731147', true
  from bolagio_units where slug = 'schulstrasse-i'
on conflict (unit_id, provider) do update
  set external_property_id = excluded.external_property_id,
      external_room_id     = excluded.external_room_id,
      enabled              = excluded.enabled;

insert into bolagio_unit_integrations
  (unit_id, provider, external_property_id, external_room_id, enabled)
select id, 'beds24', '354658', '731146', true
  from bolagio_units where slug = 'schulstrasse-ii'
on conflict (unit_id, provider) do update
  set external_property_id = excluded.external_property_id,
      external_room_id     = excluded.external_room_id,
      enabled              = excluded.enabled;

-- The three Opernstraße flats deliberately get NO mapping row. No Beds24 ids
-- have been confirmed for them, and an invented id is worse than an absent
-- one: a unit with no provider mapping is reported as `unsourced` and keeps
-- the enquiry flow, whereas a unit pointed at the wrong room sells the wrong
-- apartment and looks perfectly healthy while doing it.

-- ── Booking.com property ids, for reference only ───────────────────────────
--
--   schulstrasse-i   → 14282341
--   schulstrasse-ii  → 14401037
--
-- Recorded here as documentation and NOT modelled as an integration row, on
-- purpose. `bolagio_unit_integrations` describes systems this application
-- talks to, and this one never talks to Booking.com: Beds24 owns that
-- connection, and a row here would imply a direct coupling the architecture
-- explicitly forbids. A Booking.com reservation reaches us already
-- translated, through the Beds24 webhook, carrying `source = booking_com`.
--
-- If these ids are ever genuinely needed — reconciling a Booking.com report
-- against BoLaGio revenue, say — they belong in their own mapping table with
-- their own purpose, not smuggled into the channel-manager one.

-- ── Opening a residence for sale ───────────────────────────────────────────
--
-- Still deliberately commented out. The mapping above is confirmed, but
-- nothing that WRITES to Beds24 has been exercised yet — no hold has ever
-- been created or released against this account. Until the controlled
-- hold/release test has passed (docs/beds24-write-test-plan.md), a guest
-- reaching the booking flow would be the first ever write, which is not a
-- thing to discover in production.
--
-- update bolagio_units set is_bookable = true where slug = 'schulstrasse-i';
-- update bolagio_units set is_bookable = true where slug = 'schulstrasse-ii';
