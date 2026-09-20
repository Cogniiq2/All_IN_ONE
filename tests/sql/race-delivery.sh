#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# TWO WORKERS, ONE MESSAGE. Both claim the booking-confirmation slot for the
# same booking in overlapping transactions. Exactly one may come out
# `claimed`; the other must see `in_progress` (or `already_sent`). This is the
# exactly-once EFFECT the delivery ledger promises on top of at-least-once
# event delivery, proven under genuine concurrency rather than by inspection.
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail
TEST="${1:?usage: race-delivery.sh <database-url>}"

psql "$TEST" -q -v ON_ERROR_STOP=1 <<'SQL'
delete from bolagio_message_deliveries;
delete from bolagio_booking_intents where reference = 'BLG-MRACE1';
insert into bolagio_booking_intents (reference, unit_id, check_in, check_out, adults, idempotency_key, currency)
select 'BLG-MRACE1', id, '2027-09-10', '2027-09-12', 2, 'mrace-1', 'EUR' from bolagio_units where slug='schulstrasse-i';
SQL

claim() {
  psql "$TEST" -q -At -v ON_ERROR_STOP=1 <<'SQL' 2>/dev/null
begin;
select pg_sleep(0.2);
select bolagio_begin_message_delivery('BLG-MRACE1','booking_confirmation','email','de','t','1','a***','h', null)->>'outcome';
select pg_sleep(0.4);
commit;
SQL
}

A=$(claim) & PA=$!
B=$(claim) & PB=$!
wait $PA $PB
# The two runs above raced; read the ledger for the truth.
ROWS=$(psql "$TEST" -Atc "select count(*) from bolagio_message_deliveries where reference='BLG-MRACE1';")
ATTEMPTS=$(psql "$TEST" -Atc "select attempts from bolagio_message_deliveries where reference='BLG-MRACE1';")
if [ "$ROWS" = "1" ] && [ "$ATTEMPTS" = "1" ]; then
  echo "ok — two concurrent claims produced one ledger row with one attempt (the second saw in_progress)"
  exit 0
fi
echo "ERROR: rows=$ROWS attempts=$ATTEMPTS (expected one row, one attempt)"
exit 1
