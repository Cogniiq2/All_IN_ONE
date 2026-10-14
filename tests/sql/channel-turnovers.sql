-- ════════════════════════════════════════════════════════════════════════════
-- REAL Postgres tests for 20261014120000_channel_turnovers.sql.
--
-- Runs after tests/sql/concurrency.sql on the same throwaway database (the
-- helpers `t_intent` / `t_assert` are defined there). Every assertion raises
-- on failure.
--
-- What is proven here:
--   • an active imported reservation inside the horizon yields ONE turnover,
--     re-running the sync yields none more
--   • the next arrival and the same-day flag come from the reservations table
--   • a cancelled reservation voids its turnover; active again reopens it
--   • a direct booking linked by direct_intent_id is NOT derived twice
--   • an unlinked reservation that an intent turnover already covers is skipped
--   • an operator can move a channel turnover required → done
--   • the sync emits no outbox event
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$
declare r jsonb; v record; a uuid; res_a uuid;
begin
  delete from bolagio_turnover_events; delete from bolagio_turnovers; delete from bolagio_reservations;
  delete from bolagio_booking_intents; delete from bolagio_outbox_events;

  -- Two channel stays in Apartment I, back to back (same-day changeover), one in Apartment II later.
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, channel_reference)
  select id, 'beds24', 'ct-1', 'confirmed', 'active', date '2027-05-10', date '2027-05-12', 'booking_com', '111' from bolagio_units where slug = 'schulstrasse-i';
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, channel_reference)
  select id, 'beds24', 'ct-2', 'confirmed', 'active', date '2027-05-12', date '2027-05-15', 'booking_com', '222' from bolagio_units where slug = 'schulstrasse-i';
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, channel_reference)
  select id, 'beds24', 'ct-3', 'cancelled', 'cancelled', date '2027-05-20', date '2027-05-22', 'booking_com', '333' from bolagio_units where slug = 'schulstrasse-ii';

  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 2 and (r->>'voided')::int = 0, 'two turnovers from two active stays; the cancelled one yields none');
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 0 and (r->>'updated')::int = 0, 'a second run is a no-op');
  perform t_assert((select count(*) from bolagio_turnovers) = 2, 'no duplicate turnover');

  select tv.* into v from bolagio_turnovers tv join bolagio_reservations s on s.id = tv.reservation_id where s.external_booking_id = 'ct-1';
  perform t_assert(v.departure = date '2027-05-12' and v.next_arrival = date '2027-05-12' and v.same_day, 'ct-1: departure 12 May, next arrival the same day, flagged');
  perform t_assert(v.intent_id is null and v.status = 'required', 'ct-1: derived from the reservation, pending');
  perform t_assert(v.window_start = timestamptz '2027-05-12 11:00+02' and v.window_end = timestamptz '2027-05-12 14:00+02', 'ct-1: window 11:00–14:00 Berlin time');
  select tv.* into v from bolagio_turnovers tv join bolagio_reservations s on s.id = tv.reservation_id where s.external_booking_id = 'ct-2';
  perform t_assert(v.next_arrival is null and not v.same_day, 'ct-2: nothing follows yet');

  -- Operator marks it done.
  r := bolagio_set_turnover_status(v.id, 'done', 'mother@example.com');
  perform t_assert((r->>'ok')::boolean, 'a channel turnover can be marked done');

  -- The channel cancels ct-1: its turnover is voided, never deleted; ct-2's next arrival is unchanged.
  update bolagio_reservations set status_class = 'cancelled', provider_status = 'cancelled' where external_booking_id = 'ct-1';
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'voided')::int = 1, 'a cancelled reservation voids its turnover');
  perform t_assert((select status from bolagio_turnovers tv join bolagio_reservations s on s.id = tv.reservation_id where s.external_booking_id = 'ct-1') = 'void', 'ct-1 turnover is void');
  update bolagio_reservations set status_class = 'active', provider_status = 'confirmed' where external_booking_id = 'ct-1';
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 1 and (select count(*) from bolagio_turnovers) = 2, 'active again reopens the same row');

  -- The channel moves ct-2's check-out after it was cleaned: the done turnover reopens, on the new day.
  update bolagio_reservations set check_out = date '2027-05-16' where external_booking_id = 'ct-2';
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'reopened')::int = 1 and (r->>'updated')::int = 1, 'a moved check-out reopens the done turnover');
  select tv.* into v from bolagio_turnovers tv join bolagio_reservations s on s.id = tv.reservation_id where s.external_booking_id = 'ct-2';
  perform t_assert(v.departure = date '2027-05-16' and v.status = 'required' and v.done_at is null, 'ct-2: moved to 16 May, pending again, done mark cleared');
  perform t_assert(v.window_start = timestamptz '2027-05-16 11:00+02', 'ct-2: the window moved with the check-out');
  perform t_assert((select count(*) from bolagio_turnovers) = 2, 'moving a stay updates the row, never adds one');

  -- Horizon: a departure beyond it is left for a later pass, and taken once it is inside.
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source)
  select id, 'beds24', 'ct-h', 'confirmed', 'active', date '2027-07-28', date '2027-08-01', 'booking_com' from bolagio_units where slug = 'schulstrasse-ii';
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 0, 'a departure 92 days out is outside a 60-day horizon');
  r := bolagio_sync_channel_turnovers(120, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 1, 'inside a 120-day horizon it is derived');
  r := bolagio_sync_channel_turnovers(120, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 0 and (r->>'updated')::int = 0, 'and only once');
  -- A departure before yesterday is history, not work.
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source)
  select id, 'beds24', 'ct-old', 'confirmed', 'active', date '2027-04-20', date '2027-04-25', 'booking_com' from bolagio_units where slug = 'schulstrasse-ii';
  r := bolagio_sync_channel_turnovers(60, '2027-05-01T10:00:00Z');
  perform t_assert((r->>'created')::int = 0, 'a past departure gets no turnover');

  -- A direct booking appears in both tables: one turnover, from the intent.
  a := t_intent('BLG-CT0001', 'schulstrasse-ii', '2027-06-01', '2027-06-03');
  perform bolagio_acquire_lock(a);
  perform bolagio_booking_transition(a, 'locking', 'hold_created', 'f', jsonb_build_object('beds24_booking_id','b-ct'));
  perform bolagio_booking_transition(a, 'hold_created', 'paid', 'f', jsonb_build_object('payment_status','paid'));
  perform bolagio_booking_transition(a, 'paid', 'confirmed', 'f');
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source, direct_intent_id)
  select id, 'beds24', 'b-ct', 'confirmed', 'active', date '2027-06-01', date '2027-06-03', 'direct', a from bolagio_units where slug = 'schulstrasse-ii'
  returning id into res_a;
  r := bolagio_sync_turnovers(60, '2027-05-25T10:00:00Z');
  r := bolagio_sync_channel_turnovers(60, '2027-05-25T10:00:00Z');
  perform t_assert((select count(*) from bolagio_turnovers where departure = date '2027-06-03') = 1, 'a direct booking is derived once, from the intent');
  perform t_assert((select intent_id from bolagio_turnovers where departure = date '2027-06-03') = a, '…and the one row is the intent''s');
  -- Even with the link missing, the intent-derived turnover covers the same room and day.
  update bolagio_reservations set direct_intent_id = null where id = res_a;
  r := bolagio_sync_channel_turnovers(60, '2027-05-25T10:00:00Z');
  perform t_assert((select count(*) from bolagio_turnovers where departure = date '2027-06-03') = 1, 'an unlinked reservation covered by an intent turnover is skipped');

  -- The next arrival for the direct departure is read from reservations too.
  insert into bolagio_reservations (unit_id, provider, external_booking_id, provider_status, status_class, check_in, check_out, source)
  select id, 'beds24', 'ct-4', 'confirmed', 'active', date '2027-06-03', date '2027-06-05', 'airbnb' from bolagio_units where slug = 'schulstrasse-ii';
  r := bolagio_sync_channel_turnovers(60, '2027-05-25T10:00:00Z');
  perform t_assert((r->>'created')::int = 1, 'the Airbnb stay gets its own turnover');

  perform t_assert(not exists (select 1 from bolagio_outbox_events where event_type like 'cleaning.%' and aggregate_id <> a), 'no cleaning event names a channel reservation');

  -- Exactly one origin per row.
  begin
    insert into bolagio_turnovers (unit_id, departure, window_start, window_end)
    select id, date '2027-07-01', now(), now() from bolagio_units where slug = 'schulstrasse-i';
    raise exception 'FAILED: a turnover without an origin was accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok — a turnover must come from an intent or a reservation, never neither';

  delete from bolagio_turnover_events; delete from bolagio_turnovers; delete from bolagio_reservations where external_booking_id in ('ct-1','ct-2','ct-3','ct-4','ct-h','ct-old','b-ct');
  delete from bolagio_booking_intents where id = a; delete from bolagio_outbox_events;
end $$;

\echo '════════ channel turnover tests passed ════════'
