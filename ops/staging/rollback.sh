#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BoLaGio STAGING — rollback: the worker, then (optionally) the database.
#
#   CONFIRM_STAGING=yes ops/staging/rollback.sh                    # worker guidance only
#   CONFIRM_STAGING=yes ROLLBACK_WORKER=yes ops/staging/rollback.sh   # runs wrangler rollback --env staging
#   CONFIRM_STAGING=yes ROLLBACK_DB=yes DATABASE_URL=… ops/staging/rollback.sh
#        # runs rollback_20260921.sql then rollback_20260920.sql, each in ONE transaction
#
# Order matters (docs/cloudflare-deployment.md §4, docs/supabase-migration-runbook.md §5):
#   1. roll the WORKER back first (or at the same time) — the previous worker
#      calls function signatures the rolled-back database restores; a new
#      worker against a rolled-back database fails closed (every external
#      mutation refused), which is safe but is an outage
#   2. database: 20260921 (platform completion) BEFORE 20260920 (production
#      hardening); each script is a single transaction and REFUSES when state
#      would be lost — refunds/cancellations/message deliveries/turnovers in
#      flight for 20260921; the 20260920 script drops scheduler runs, turnovers
#      and guest events (their rows are lost; unit clock columns are kept)
#   3. anything older: restore the backup; the earlier migrations were never
#      designed to reverse individually
#
# Refuses when CONFIRM_STAGING != yes or the DATABASE_URL host contains "prod".
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/../.."

[ "${CONFIRM_STAGING:-}" = "yes" ] || { echo "refused: set CONFIRM_STAGING=yes" >&2; exit 1; }

echo "── 1. worker"
if [ "${ROLLBACK_WORKER:-}" = "yes" ]; then
  echo "   running: npx wrangler rollback --env staging"
  npx wrangler rollback --env staging
else
  cat <<'TXT'
   To roll the staging worker back to the previous deployment:
     npx wrangler deployments list --env staging      # find the previous version
     npx wrangler rollback --env staging              # interactive; or --version-id <id>
   Then re-run ops/staging/health-check.sh. Do NOT disable the pg_cron schedule:
   held and paid bookings still need to reach a resting state.
   (Set ROLLBACK_WORKER=yes to have this script run the rollback.)
TXT
fi

echo "── 2. database"
if [ "${ROLLBACK_DB:-}" != "yes" ]; then
  cat <<'TXT'
   Not rolling the database back (ROLLBACK_DB is not yes). If the deploy that is
   being reverted also applied 20260921 and/or 20260920 and the PREVIOUS worker
   must run, roll them back in this order, each in one transaction:
     psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260921.sql
     psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/ops/rollback_20260920.sql
   Each refuses (exit ≠ 0, nothing changed) while it would lose in-flight state.
TXT
  exit 0
fi

: "${DATABASE_URL:?DATABASE_URL is required for ROLLBACK_DB=yes}"
HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/?@]*).*$#\2#')"
case "$HOST" in *prod*|*PROD*|*Prod*) echo "refused: DATABASE_URL host '$HOST' contains 'prod'" >&2; exit 1 ;; esac
echo "   target host: ${HOST:-(unix socket)}"

run_rollback() { # file
  echo "   $1 (single transaction)"
  if psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$1" 2>&1 | grep -vE "NOTICE|^$"; then :; fi
  if [ "${PIPESTATUS[0]}" != "0" ]; then
    echo "   REFUSED or failed — nothing from this file was applied (single transaction). Read the message above:" >&2
    echo "   'rollback refused: … in flight' means operational state exists; let it finish or resolve it by hand, then retry." >&2
    return 1
  fi
}

if psql "$DATABASE_URL" -Atc "select to_regclass('public.bolagio_message_deliveries') is not null" | grep -q t; then
  run_rollback supabase/ops/rollback_20260921.sql
else
  echo "   20260921 not applied — skipping its rollback"
fi
if [ "${ROLLBACK_20260920:-yes}" = "yes" ]; then
  if psql "$DATABASE_URL" -Atc "select to_regclass('public.bolagio_turnovers') is not null" | grep -q t; then
    run_rollback supabase/ops/rollback_20260920.sql
  else
    echo "   20260920 not applied — skipping its rollback"
  fi
else
  echo "   ROLLBACK_20260920=no — leaving 20260920 in place (only 20260921 was rolled back)"
fi
psql "$DATABASE_URL" -Atc "select 'now: platform_completion=' || (to_regclass('public.bolagio_message_deliveries') is not null) || ' production_hardening=' || (to_regclass('public.bolagio_turnovers') is not null)"
echo "done. Re-run ops/staging/health-check.sh against the worker that is now live."
