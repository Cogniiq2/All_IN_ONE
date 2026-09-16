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

insert into bolagio_units (slug, display_name, max_guests, min_nights, currency, is_bookable)
values
  ('schulstrasse-i',    'Schulstraße I',    null, null, 'EUR', false),
  ('schulstrasse-ii',   'Schulstraße II',   null, null, 'EUR', false),
  -- The three Opernstraße flats are in renovation. They carry
  -- status 'in-preparation' in the content file, which already keeps them out
  -- of the booking flow; they are listed here so their mapping can be prepared
  -- ahead of opening.
  ('opernstrasse-i',    'Opernstraße I',    null, null, 'EUR', false),
  ('opernstrasse-ii',   'Opernstraße II',   null, null, 'EUR', false),
  ('opernstrasse-iii',  'Opernstraße III',  null, null, 'EUR', false)
on conflict (slug) do update
  set display_name = excluded.display_name;

-- ── The Beds24 mapping ─────────────────────────────────────────────────────
--
-- Find the ids in Beds24 under Settings → Properties (property id) and
-- Settings → Rooms (room id). They are NEVER hardcoded anywhere in the
-- application — the frontend only ever knows a BoLaGio slug.
--
-- Uncomment and fill in one block per unit, then set that unit's `is_bookable`
-- to true once `POST /api/booking/sync` has run for it without errors.

-- insert into bolagio_unit_integrations
--   (unit_id, provider, external_property_id, external_room_id, enabled)
-- select id, 'beds24', '<BEDS24_PROPERTY_ID>', '<BEDS24_ROOM_ID>', true
--   from bolagio_units where slug = 'schulstrasse-i'
-- on conflict (unit_id, provider) do update
--   set external_property_id = excluded.external_property_id,
--       external_room_id     = excluded.external_room_id,
--       enabled              = excluded.enabled;

-- insert into bolagio_unit_integrations
--   (unit_id, provider, external_property_id, external_room_id, enabled)
-- select id, 'beds24', '<BEDS24_PROPERTY_ID>', '<BEDS24_ROOM_ID>', true
--   from bolagio_units where slug = 'schulstrasse-ii'
-- on conflict (unit_id, provider) do update
--   set external_property_id = excluded.external_property_id,
--       external_room_id     = excluded.external_room_id,
--       enabled              = excluded.enabled;

-- ── Opening a residence for sale ───────────────────────────────────────────
-- update bolagio_units set is_bookable = true where slug = 'schulstrasse-i';
