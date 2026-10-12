-- ════════════════════════════════════════════════════════════════════════════
-- BEDROOM PACKAGE — the database's own hold on the rule (20261012120000).
--
--   • only `one_bedroom` and `two_bedroom` are storable;
--   • `one_bedroom` never holds more than two guests, children included;
--   • `two_bedroom` takes one to four;
--   • a row written before the migration (null) stays valid.
--
-- Run by scripts/db-test.sh against a throwaway database.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\timing off
set client_min_messages = notice;

delete from bolagio_booking_intents;
delete from bolagio_unit_integrations;
delete from bolagio_units;

insert into bolagio_units (slug, display_name, max_guests, currency, is_bookable)
values ('schulstrasse-i', 'Schulstraße I', 4, 'EUR', false);

create or replace function t_bp_insert(p_ref text, p_package text, p_adults int, p_children int)
returns boolean language plpgsql as $$
begin
  insert into bolagio_booking_intents
    (reference, unit_id, check_in, check_out, adults, children, bedroom_package, idempotency_key, currency)
  select p_ref, id, date '2027-03-10', date '2027-03-12',
         p_adults, p_children, p_package, 'bp-' || p_ref, 'EUR'
    from bolagio_units where slug = 'schulstrasse-i';
  return true;
exception when check_violation then
  return false;
end $$;

do $$
begin
  if not t_bp_insert('BLG-BP0001', 'one_bedroom', 1, 0) then raise exception 'FAILED: 1 Bedroom, 1 guest refused'; end if;
  if not t_bp_insert('BLG-BP0002', 'one_bedroom', 2, 0) then raise exception 'FAILED: 1 Bedroom, 2 guests refused'; end if;
  if t_bp_insert('BLG-BP0003', 'one_bedroom', 3, 0) then raise exception 'FAILED: 1 Bedroom, 3 guests accepted'; end if;
  if t_bp_insert('BLG-BP0004', 'one_bedroom', 1, 2) then raise exception 'FAILED: 1 Bedroom, 1 adult + 2 children accepted'; end if;
  raise notice 'ok — 1 Bedroom holds one or two guests, never three';

  if not t_bp_insert('BLG-BP0005', 'two_bedroom', 1, 0) then raise exception 'FAILED: 2 Bedrooms, 1 guest refused'; end if;
  if not t_bp_insert('BLG-BP0006', 'two_bedroom', 4, 0) then raise exception 'FAILED: 2 Bedrooms, 4 guests refused'; end if;
  raise notice 'ok — 2 Bedrooms holds one to four guests';

  if t_bp_insert('BLG-BP0007', 'three_bedroom', 2, 0) then raise exception 'FAILED: an unknown package was stored'; end if;
  if t_bp_insert('BLG-BP0008', '', 2, 0) then raise exception 'FAILED: an empty package was stored'; end if;
  raise notice 'ok — only the two packages are storable';

  if not t_bp_insert('BLG-BP0009', null, 4, 0) then raise exception 'FAILED: a pre-migration (null) row refused'; end if;
  raise notice 'ok — a row without a package (written before the migration) stays valid';

  update bolagio_booking_intents set beds24_offer_id = 2 where reference = 'BLG-BP0005';
  begin
    update bolagio_booking_intents set beds24_offer_id = 0 where reference = 'BLG-BP0005';
    raise exception 'FAILED: offer id 0 stored on an intent';
  exception when check_violation then null;
  end;
  raise notice 'ok — an intent records a positive Beds24 offer id';

  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, external_offer_id, bedroom_package)
  select id, 'beds24', 'bp-ota-1', 'confirmed', 'active', date '2027-04-01', date '2027-04-03', 'booking_com', 0, null from bolagio_units where slug = 'schulstrasse-i';
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, external_offer_id, bedroom_package)
  select id, 'beds24', 'bp-direct-1', 'confirmed', 'active', date '2027-04-05', date '2027-04-07', 'direct', 2, 'two_bedroom' from bolagio_units where slug = 'schulstrasse-i';
  begin
    insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, bedroom_package)
    select id, 'beds24', 'bp-bad-1', 'confirmed', 'active', date '2027-04-09', date '2027-04-10', 'direct', 'suite' from bolagio_units where slug = 'schulstrasse-i';
    raise exception 'FAILED: an unknown bedroom package was imported';
  exception when check_violation then null;
  end;
  raise notice 'ok — reservations keep the offer id; a channel reservation''s setup stays unknown; only the two packages are storable';
end $$;

delete from bolagio_reservations where external_booking_id like 'bp-%';

delete from bolagio_booking_intents;
drop function t_bp_insert(text, text, int, int);

\echo ''
\echo '════════ all bedroom package tests passed ════════'
