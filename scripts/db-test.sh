#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Run the REAL Postgres tests for the booking core.
#
# These are the tests that cannot be mocked: the exclusion constraint, the
# transition trigger, `for update skip locked` claiming, and the capture
# validation function. A unit test with a fake database proves none of them.
#
#   ./scripts/db-test.sh
#
# It needs a PostgreSQL 14+ server with the `btree_gist` extension available.
# Set DATABASE_URL to use your own; otherwise it starts a throwaway cluster in
# a temporary directory and removes it afterwards.
#
# In CI this is a separate job from `npm test`, because it needs a database.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

OWN_CLUSTER=0
if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [ -x "$PGBIN/initdb" ] || { echo "No PostgreSQL binaries found. Set PGBIN or DATABASE_URL." >&2; exit 1; }
  DIR="$(mktemp -d)"; SOCK="$DIR/sock"; mkdir -p "$SOCK" "$DIR/data"
  # The postgres user has to be able to traverse into a 0700 mktemp dir.
  chmod 755 "$DIR"
  # Any free high port; 5432 is often already taken by a real server.
  PORT="${PGTESTPORT:-$(( 55000 + RANDOM % 9000 ))}"
  # initdb refuses to run as root, so drop to a non-root owner when we are one.
  RUNAS=""
  if [ "$(id -u)" = "0" ]; then RUNAS="postgres"; chown -R postgres "$DIR"; fi
  run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }
  run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null
  run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $SOCK' -l $DIR/log start" >/dev/null
  trap 'run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  DATABASE_URL="postgres://postgres@/postgres?host=$SOCK&port=$PORT"
  OWN_CLUSTER=1
fi

BASE="${DATABASE_URL%%\?*}"; QS="${DATABASE_URL#*\?}"
[ "$QS" = "$DATABASE_URL" ] && QS=""
ADMIN="$DATABASE_URL"
psql "$ADMIN" -q -c "drop database if exists bolagio_test;" -c "create database bolagio_test;"
TEST="${BASE%/*}/bolagio_test${QS:+?$QS}"

# Supabase's roles are not present in a bare cluster; the migrations grant to
# them by name, so they have to exist.
psql "$TEST" -q -c "do \$\$ begin
  create role anon;            exception when duplicate_object then null; end \$\$;"
psql "$TEST" -q -c "do \$\$ begin
  create role authenticated;   exception when duplicate_object then null; end \$\$;"
psql "$TEST" -q -c "do \$\$ begin
  create role service_role;    exception when duplicate_object then null; end \$\$;"

echo "── applying migrations ──"
for f in supabase/migrations/20260916120000_booking_foundation.sql \
         supabase/migrations/20260917100000_booking_core_states.sql \
         supabase/migrations/20260917110000_booking_core_hardening.sql \
         supabase/migrations/20260919120000_admin_operators.sql \
         supabase/migrations/20260920120000_booking_production_hardening.sql \
         supabase/migrations/20260921120000_platform_completion.sql \
         supabase/migrations/20260922120000_finance_foundation.sql \
         supabase/migrations/20260923120000_reservation_import.sql \
         supabase/migrations/20260924120000_guest_privileges.sql \
         supabase/migrations/20260925120000_legal_compliance.sql \
         supabase/migrations/20260926120000_booking_com_finance_statement.sql \
         supabase/migrations/20260927120000_finance_ingestion_pipeline.sql; do
  echo "   $f"
  psql "$TEST" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -vE "NOTICE|^$" || true
done

echo "── running tests ──"
psql "$TEST" -v ON_ERROR_STOP=1 -f tests/sql/concurrency.sql 2>&1 \
  | sed -n 's/^.*NOTICE:  //p; /════/p; s/^.*ERROR:/ERROR:/p'

echo "── running the platform-completion tests ──"
psql "$TEST" -v ON_ERROR_STOP=1 -f tests/sql/completion.sql 2>&1 \
  | sed -n 's/^.*NOTICE:  //p; /════/p; s/^.*ERROR:/ERROR:/p'

echo "── running the finance foundation tests ──"
psql "$TEST" -v ON_ERROR_STOP=1 -f tests/sql/finance.sql 2>&1 \
  | sed -n 's/^.*NOTICE:  //p; /════/p; s/^.*ERROR:/ERROR:/p'

echo "── running the finance pipeline tests ──"
psql "$TEST" -v ON_ERROR_STOP=1 -f tests/sql/finance-pipeline.sql 2>&1 \
  | sed -n 's/^.*NOTICE:  //p; /════/p; s/^.*ERROR:/ERROR:/p'

echo "── running the concurrent race ──"
tests/sql/race.sh "$TEST"
echo "── running the concurrent delivery-ledger race ──"
tests/sql/race-delivery.sh "$TEST" 

[ "$OWN_CLUSTER" = "1" ] && echo "(throwaway cluster removed)"
