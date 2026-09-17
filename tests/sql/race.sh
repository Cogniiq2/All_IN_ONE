#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# TWO SIMULTANEOUS TRANSACTIONS, one unit, overlapping dates.
#
# `concurrency.sql` proves the constraint's PREDICATE is right by exercising it
# sequentially. This proves the constraint does its job under genuine
# concurrency: two separate backend processes, both inside an open
# transaction, both trying to reserve nights that overlap.
#
# The expected result is not "the application noticed". It is that PostgreSQL
# itself refuses one of them — with SQLSTATE 23P01 (exclusion_violation) or
# 40001 (serialization_failure) — so the guarantee survives any application bug.
#
# Called by scripts/db-test.sh with $TEST set to the prepared database URL.
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
TEST="${1:?usage: race.sh <database-url>}"

psql "$TEST" -q -v ON_ERROR_STOP=1 <<'SQL'
delete from bolagio_booking_intents;
insert into bolagio_booking_intents (reference, unit_id, check_in, check_out, adults, idempotency_key, currency)
select 'BLG-RACE01', id, '2027-08-10', '2027-08-15', 2, 'race-1', 'EUR' from bolagio_units where slug='schulstrasse-i';
insert into bolagio_booking_intents (reference, unit_id, check_in, check_out, adults, idempotency_key, currency)
select 'BLG-RACE02', id, '2027-08-12', '2027-08-18', 2, 'race-2', 'EUR' from bolagio_units where slug='schulstrasse-i';
do $$
declare v uuid;
begin
  for v in select id from bolagio_booking_intents where reference in ('BLG-RACE01','BLG-RACE02') loop
    perform bolagio_booking_transition(v, 'draft'::bolagio_booking_status, 'quoted'::bolagio_booking_status, 'race-fixture');
  end loop;
end $$;
SQL

# Both sessions open a transaction, pause on the same barrier, then lock.
# `pg_sleep` inside the transaction is what makes the two genuinely overlap:
# without it the first would commit before the second even connected.
race() {
  psql "$TEST" -q -v ON_ERROR_STOP=1 -v ref="$1" <<'SQL' >/dev/null 2>&1
begin;
select pg_sleep(0.3);
select bolagio_acquire_lock(id) from bolagio_booking_intents where reference = :'ref';
select pg_sleep(0.5);
commit;
SQL
  echo "$?"
}

A=$(race BLG-RACE01) & PA=$!
B=$(race BLG-RACE02) & PB=$!
wait $PA $PB

WINNERS=$(psql "$TEST" -Atc \
  "select count(*) from bolagio_booking_intents
    where reference in ('BLG-RACE01','BLG-RACE02') and bolagio_status_reserves(status);")

if [ "$WINNERS" = "1" ]; then
  echo "ok — exactly one of two concurrent overlapping transactions holds the range"
  exit 0
fi
echo "ERROR: $WINNERS of 2 concurrent overlapping transactions reserved the range (expected 1)"
psql "$TEST" -c "select reference, status from bolagio_booking_intents where reference like 'BLG-RACE%';"
exit 1
