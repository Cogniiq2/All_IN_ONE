#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BoLaGio STAGING — apply the database migrations to the staging project.
#
#   CONFIRM_STAGING=yes DATABASE_URL='postgres://…' ops/staging/migrate.sh
#
# Order (docs/supabase-migration-runbook.md §6):
#   inventory (before)
#   → gate: shared-project preflight when #1–#11 are already applied (ALL IN
#     ONE today), plain preflight.sql on a project that has none of them
#   → #1–#11 not yet applied, each in its OWN transaction → seed
#   → shared-project preflight (the gate for #12) → #12 in its own transaction
#   → shared-project verify → inventory (after) → diff
#
# Refuses when:
#   * CONFIRM_STAGING is not exactly "yes"
#   * the DATABASE_URL host contains "prod" (this script never touches production)
#   * the preflight fails (collision, missing role, half-applied state)
#
# Configuration from the environment only. Prints names, never values.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${DATABASE_URL:?DATABASE_URL is required (the staging staging project connection string)}"
[ "${CONFIRM_STAGING:-}" = "yes" ] || { echo "refused: set CONFIRM_STAGING=yes to run against staging" >&2; exit 1; }

# host = between '@' (or '//' when there is no userinfo) and the next ':' or '/' — printed, never the whole URL
HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/?@]*).*$#\2#')"
case "$HOST" in
  *prod*|*PROD*|*Prod*) echo "refused: DATABASE_URL host '$HOST' contains 'prod' — this script is for staging only" >&2; exit 1 ;;
esac
echo "target host: ${HOST:-(unix socket)}"

OUT="${STAGING_MIGRATE_OUT:-ops/staging/.out}"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

MIGRATIONS=(
  supabase/migrations/20260916120000_booking_foundation.sql
  supabase/migrations/20260917100000_booking_core_states.sql
  supabase/migrations/20260917110000_booking_core_hardening.sql
  supabase/migrations/20260919120000_admin_operators.sql
  supabase/migrations/20260920120000_booking_production_hardening.sql
  supabase/migrations/20260921120000_platform_completion.sql
  supabase/migrations/20260922120000_finance_foundation.sql
  supabase/migrations/20260923120000_reservation_import.sql
  supabase/migrations/20260924120000_guest_privileges.sql
  supabase/migrations/20260925120000_legal_compliance.sql
  supabase/migrations/20260926120000_booking_com_finance_statement.sql
  supabase/migrations/20260927120000_finance_ingestion_pipeline.sql
)

echo "── 1. inventory (before) → $OUT/inventory-before-$STAMP.txt"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -v format=unaligned -f supabase/ops/shared_project_inventory.sql > "$OUT/inventory-before-$STAMP.txt"

# Applied-markers, the same ones supabase/ops/shared_project_preflight.sql §3
# uses. A file whose marker is present is skipped: the older files are
# idempotent statement by statement but not as a whole once LATER files have
# replaced their views. FORCE_REAPPLY=yes runs every file regardless.
applied() { # index
  local q
  case "$1" in
    0)  q="select to_regclass('public.bolagio_booking_intents') is not null" ;;
    1)  q="select exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='bolagio_booking_status' and e.enumlabel='locking')" ;;
    2)  q="select to_regclass('public.bolagio_outbox_events') is not null and to_regprocedure('bolagio_booking_transition(uuid,bolagio_booking_status,bolagio_booking_status,text,jsonb,text,text,jsonb)') is not null" ;;
    3)  q="select to_regclass('public.bolagio_operators') is not null" ;;
    4)  q="select to_regclass('public.bolagio_scheduler_runs') is not null and to_regprocedure('bolagio_begin_external_operation(text,bolagio_external_provider,text,uuid,jsonb,boolean)') is not null" ;;
    5)  q="select to_regclass('public.bolagio_message_deliveries') is not null and to_regprocedure('bolagio_request_cancellation(uuid,text,text,boolean,integer,text)') is not null" ;;
    6)  q="select to_regclass('public.bolagio_finance_transactions') is not null and to_regprocedure('bolagio_finance_post_transaction(jsonb,jsonb,text)') is not null" ;;
    7)  q="select to_regclass('public.bolagio_reservations') is not null" ;;
    8)  q="select to_regclass('public.bolagio_guest_identities') is not null and to_regclass('public.bolagio_privilege_redemptions') is not null" ;;
    9)  q="select exists (select 1 from information_schema.columns where table_schema='public' and table_name='bolagio_booking_intents' and column_name='terms_evidence') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='bolagio_guest_identities' and column_name='marketing_consent_confirmed_at')" ;;
    10) q="select to_regclass('public.bolagio_finance_ota_settlements') is not null and to_regprocedure('bolagio_finance_record_ota_settlement(jsonb,text)') is not null" ;;
    11) q="select to_regclass('public.bolagio_finance_ingestion_queue') is not null and exists (select 1 from pg_trigger where tgname='bolagio_booking_intents_finance_enqueue')" ;;
  esac
  [ "$(psql "$DATABASE_URL" -Atc "$q")" = "t" ]
}

apply_file() { # index
  local f="${MIGRATIONS[$1]}"
  if [ "${FORCE_REAPPLY:-}" != "yes" ] && applied "$1"; then
    echo "   $f — already applied, skipped"
    return 0
  fi
  echo "   $f"
  if ! psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$f" > "$OUT/migrate-$(basename "$f" .sql)-$STAMP.log" 2>&1; then
    echo "STOP at $f — the transaction rolled back; the database is as the previous file left it." >&2
    grep -E "ERROR" "$OUT/migrate-$(basename "$f" .sql)-$STAMP.log" | head -5 >&2
    exit 1
  fi
}

shared_preflight() { # label
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_preflight.sql > "$OUT/preflight-$1-$STAMP.txt" 2>&1 \
    || { echo "shared-project preflight FAILED — see $OUT/preflight-$1-$STAMP.txt"; grep -E "ERROR" "$OUT/preflight-$1-$STAMP.txt" | head -5; exit 1; }
  grep -E "NOTICE:  ok — (#1|no collision)|passed" "$OUT/preflight-$1-$STAMP.txt" | sed 's/psql:[^ ]* //'
}

all_1_to_11=yes
for i in $(seq 0 10); do applied "$i" || all_1_to_11=no; done

echo "── 2. gate (read-only)"
if [ "$all_1_to_11" = "yes" ]; then
  shared_preflight before
else
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/ops/preflight.sql > "$OUT/preflight-plain-$STAMP.txt" 2>&1 \
    || { echo "preflight FAILED — see $OUT/preflight-plain-$STAMP.txt"; grep -E "ERROR" "$OUT/preflight-plain-$STAMP.txt" | head -5; exit 1; }
  echo "   plain preflight passed (#1–#11 not all applied yet; the shared-project preflight gates #12 below)"
fi

echo "── 3. #1–#11, each in its own transaction (psql -1 per file; #2 must commit before #3)"
for i in $(seq 0 10); do apply_file "$i"; done

echo "── 4. seed (idempotent; leaves is_bookable = false)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed/bolagio_booking_units.sql

echo "── 4b. shared-project preflight (the gate for #12), then #12 in its own transaction"
shared_preflight before-12
apply_file 11

echo "── 5. shared-project verify"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/ops/shared_project_verify.sql > "$OUT/verify-$STAMP.txt" 2>&1 \
  || { echo "verify FAILED — see $OUT/verify-$STAMP.txt"; grep -E "FAILED" "$OUT/verify-$STAMP.txt" | head -5; exit 1; }
grep -cE "ok —" "$OUT/verify-$STAMP.txt" | sed 's/^/   ok lines: /'
grep -E "passed" "$OUT/verify-$STAMP.txt"

echo "── 6. inventory (after) → $OUT/inventory-after-$STAMP.txt, and the diff"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -v format=unaligned -f supabase/ops/shared_project_inventory.sql > "$OUT/inventory-after-$STAMP.txt"
if diff -u "$OUT/inventory-before-$STAMP.txt" "$OUT/inventory-after-$STAMP.txt" > "$OUT/inventory-diff-$STAMP.txt"; then
  echo "   no difference (migrations were already applied)"
else
  # Every changed line must mention a bolagio_ object, btree_gist, or be a header/count line.
  if grep -E '^[-+][^-+]' "$OUT/inventory-diff-$STAMP.txt" | grep -vE 'bolagio_|btree_gist|^[-+][0-9]{4}-[0-9]{2}-[0-9]{2} |^[-+]public\|pg_database_owner\||^[-+]\(.* rows?\)|^[-+](rank|severity)\|' | grep -q .; then
    echo "   WARNING: the inventory diff touches lines that do not name a bolagio_ object — read $OUT/inventory-diff-$STAMP.txt before going further"
    grep -E '^[-+][^-+]' "$OUT/inventory-diff-$STAMP.txt" | grep -vE 'bolagio_|btree_gist|^[-+][0-9]{4}-[0-9]{2}-[0-9]{2} |^[-+]public\|pg_database_owner\||^[-+]\(.* rows?\)|^[-+](rank|severity)\|' | head -20
    exit 1
  fi
  echo "   every changed line names a bolagio_ object (or btree_gist) — blast radius contained"
fi
echo "done. Keep $OUT/*-$STAMP.txt with the change record."
