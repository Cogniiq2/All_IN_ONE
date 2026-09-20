#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Prove the operations SQL on a throwaway cluster:
#   preflight (empty) → apply all → verify → rollback 20260920 → re-apply → verify
#
# Same cluster handling as scripts/db-test.sh. Nothing here touches a real
# project unless DATABASE_URL points at one — and even then it works in a
# database called bolagio_ops_check that it creates and drops.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

OWN_CLUSTER=0
if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [ -x "$PGBIN/initdb" ] || { echo "No PostgreSQL binaries found. Set PGBIN or DATABASE_URL." >&2; exit 1; }
  DIR="$(mktemp -d)"; SOCK="$DIR/sock"; mkdir -p "$SOCK" "$DIR/data"; chmod 755 "$DIR"
  PORT="${PGTESTPORT:-$(( 55000 + RANDOM % 9000 ))}"
  RUNAS=""; if [ "$(id -u)" = "0" ]; then RUNAS="postgres"; chown -R postgres "$DIR"; fi
  run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }
  run "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null
  run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $SOCK' -l $DIR/log start" >/dev/null
  trap 'run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  DATABASE_URL="postgres://postgres@/postgres?host=$SOCK&port=$PORT"
  OWN_CLUSTER=1
fi

BASE="${DATABASE_URL%%\?*}"; QS="${DATABASE_URL#*\?}"; [ "$QS" = "$DATABASE_URL" ] && QS=""
psql "$DATABASE_URL" -q -c "drop database if exists bolagio_ops_check;" -c "create database bolagio_ops_check;"
TEST="${BASE%/*}/bolagio_ops_check${QS:+?$QS}"
for r in anon authenticated service_role; do
  psql "$TEST" -q -c "do \$\$ begin create role $r; exception when duplicate_object then null; end \$\$;"
done

MIGRATIONS=(
  supabase/migrations/20260916120000_booking_foundation.sql
  supabase/migrations/20260917100000_booking_core_states.sql
  supabase/migrations/20260917110000_booking_core_hardening.sql
  supabase/migrations/20260919120000_admin_operators.sql
  supabase/migrations/20260920120000_booking_production_hardening.sql
  supabase/migrations/20260921120000_platform_completion.sql
  supabase/migrations/20260922120000_finance_foundation.sql
)

echo "── preflight on an empty database (must not error) ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/preflight.sql >/dev/null
echo "── applying all migrations ──"
for f in "${MIGRATIONS[@]}"; do psql "$TEST" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; echo "   $f"; done
echo "── preflight on a migrated database ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/preflight.sql | grep -E "booking_production_hardening|applied" | head -5
echo "── seed ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/seed/bolagio_booking_units.sql
echo "── verify ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/verify.sql 2>&1 | grep -E "ok —|FAILED|passed" | tail -3
echo "── rollback 20260922 (finance) in one transaction, then re-apply it twice (idempotent) ──"
psql "$TEST" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260922.sql
psql "$TEST" -Atc "select case when to_regclass('public.bolagio_finance_transactions') is null and to_regclass('public.bolagio_booking_intents') is not null then 'ok — 20260922 rolled back, booking core intact' else 'ERROR: finance rollback incomplete' end;"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260922120000_finance_foundation.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260922120000_finance_foundation.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/verify.sql 2>&1 | grep -E "FAILED|passed" | tail -1
psql "$TEST" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260922.sql
echo "── rollback 20260921 (single transaction), then re-apply 20260920 to restore its functions ──"
psql "$TEST" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260921.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260920120000_booking_production_hardening.sql
psql "$TEST" -Atc "select case when to_regclass('public.bolagio_message_deliveries') is null and to_regprocedure('bolagio_sync_turnovers(integer)') is not null then 'ok — 20260921 rolled back' else 'ERROR: 20260921 still present' end;"
echo "── re-apply 20260921 (idempotent) ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260921120000_platform_completion.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260921120000_platform_completion.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/verify.sql 2>&1 | grep -E "FAILED|passed" | tail -1
echo "── rollback 20260921 again, then 20260920 (single transaction) ──"
psql "$TEST" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260921.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260920120000_booking_production_hardening.sql
psql "$TEST" -1 -v ON_ERROR_STOP=1 -q -f supabase/ops/rollback_20260920.sql
psql "$TEST" -Atc "select case when to_regclass('public.bolagio_turnovers') is null then 'ok — rolled back' else 'ERROR: still present' end;"
echo "── re-apply 20260920, 20260921 and 20260922 (idempotent) ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260920120000_booking_production_hardening.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260920120000_booking_production_hardening.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260921120000_platform_completion.sql
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260922120000_finance_foundation.sql
echo "── verify again ──"
psql "$TEST" -v ON_ERROR_STOP=1 -q -f supabase/ops/verify.sql 2>&1 | grep -E "FAILED|passed" | tail -1
psql "$DATABASE_URL" -q -c "drop database if exists bolagio_ops_check;"
[ "$OWN_CLUSTER" = "1" ] && echo "(throwaway cluster removed)"
