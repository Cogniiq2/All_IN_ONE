#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# THE LOCAL SUPABASE-SHAPED STACK — a real Postgres behind a real PostgREST.
#
# The application talks to Supabase through `supabase-js`, which is PostgREST
# over HTTP with a JWT that names the role. Nothing in the repository knows
# whether the PostgREST behind that URL is Supabase's or this one, and that is
# the point: the integration tests and the Playwright suite exercise the REAL
# repository, command and saga code against a REAL database with the REAL
# migrations applied — not a mocked client.
#
#   scripts/test-stack.sh up        start Postgres + PostgREST, apply migrations
#                                   and the seed, write the env file
#   scripts/test-stack.sh down      stop everything and remove the cluster
#   scripts/test-stack.sh reset     truncate booking data, keep the schema
#   scripts/test-stack.sh env       print the env file path
#
# State lives under $BOLAGIO_STACK_DIR (default: .stack/, git-ignored). The
# env file it writes (`.stack/env`) carries:
#
#   SUPABASE_URL                 http://127.0.0.1:<port>      (PostgREST)
#   SUPABASE_SERVICE_ROLE_KEY    a JWT for role service_role, signed with the
#                                stack's own secret — valid nowhere else
#   SUPABASE_ANON_KEY            a JWT for role anon
#   DATABASE_URL                 the psql connection string
#
# ── What makes it Supabase-shaped ─────────────────────────────────────────
#   roles     anon, authenticated (NOLOGIN), service_role (NOLOGIN, BYPASSRLS),
#             authenticator (LOGIN, NOINHERIT) with the three granted to it,
#             exactly as a Supabase project has them
#   grants    service_role holds ALL on public tables/functions/sequences,
#             as Supabase's default privileges give it
#   RLS       enabled with no policy on every bolagio_ table by the migrations;
#             anon/authenticated therefore read nothing — which the shared-
#             project verification asserts against this very stack
#
# ── What it is not ────────────────────────────────────────────────────────
# Not Supabase Auth (GoTrue), not Storage, not Realtime, not Edge Functions.
# The admin's password sign-in cannot run here; the Playwright suite forges
# an operator session with the same HMAC the application uses, against an
# operator row it inserts (see e2e/fixtures/operator.ts).
#
# Needs: PostgreSQL 14+ binaries (PGBIN or /usr/lib/postgresql/*/bin) and the
# PostgREST binary at .tools/postgrest (scripts/install-postgrest.sh).
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

STACK_DIR="${BOLAGIO_STACK_DIR:-.stack}"
PG_PORT="${BOLAGIO_STACK_PG_PORT:-56432}"
REST_PORT="${BOLAGIO_STACK_REST_PORT:-56433}"
PGRST_PORT="${BOLAGIO_STACK_PGRST_PORT:-56434}"
POSTGREST="${POSTGREST_BIN:-.tools/postgrest}"
JWT_SECRET="${BOLAGIO_STACK_JWT_SECRET:-bolagio-local-stack-jwt-secret-not-for-any-real-project}"
DB_NAME="bolagio_stack"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
SOCK="$STACK_DIR/sock"
DATA="$STACK_DIR/data"
ENV_FILE="$STACK_DIR/env"

RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="postgres"; fi
run() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }

MIGRATIONS=(
  supabase/migrations/20260916120000_booking_foundation.sql
  supabase/migrations/20260917100000_booking_core_states.sql
  supabase/migrations/20260917110000_booking_core_hardening.sql
  supabase/migrations/20260919120000_admin_operators.sql
  supabase/migrations/20260920120000_booking_production_hardening.sql
  supabase/migrations/20260921120000_platform_completion.sql
  supabase/migrations/20260922120000_finance_foundation.sql
  supabase/migrations/20260923120000_reservation_import.sql
  supabase/migrations/20260926120000_booking_com_finance_statement.sql
)

admin_url() { echo "postgres://postgres@/postgres?host=$(realpath "$SOCK")&port=$PG_PORT"; }
db_url() { echo "postgres://postgres@/$DB_NAME?host=$(realpath "$SOCK")&port=$PG_PORT"; }

# A minimal HS256 JWT, which is all PostgREST needs to switch role. Node is
# already a requirement of the repository; no extra tool.
mint_jwt() {
  node -e '
    const [secret, role] = process.argv.slice(1);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const header = b64({ alg: "HS256", typ: "JWT" });
    const payload = b64({ role, iss: "bolagio-local-stack", iat: 1700000000, exp: 4102444800 });
    const sig = require("crypto").createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    process.stdout.write(`${header}.${payload}.${sig}`);
  ' "$JWT_SECRET" "$1"
}

wait_for() { # url, tries
  local i=0
  until curl -sS -o /dev/null "$1" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt "${2:-60}" ] && { echo "timeout waiting for $1" >&2; return 1; }
    sleep 0.25
  done
}

cmd_up() {
  [ -x "$PGBIN/initdb" ] || { echo "No PostgreSQL binaries found. Set PGBIN." >&2; exit 1; }
  [ -x "$POSTGREST" ] || { echo "PostgREST not found at $POSTGREST — run scripts/install-postgrest.sh" >&2; exit 1; }

  if [ -f "$STACK_DIR/proxy.pid" ] && kill -0 "$(cat "$STACK_DIR/proxy.pid")" 2>/dev/null; then
    echo "stack already up ($ENV_FILE)"; return 0
  fi

  mkdir -p "$SOCK" "$DATA"
  chmod 755 "$STACK_DIR"
  if [ -n "$RUNAS" ]; then chown -R "$RUNAS" "$STACK_DIR"; fi

  if [ ! -f "$DATA/PG_VERSION" ]; then
    run "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
  fi
  run "$PGBIN/pg_ctl -D $DATA -o '-p $PG_PORT -k $(realpath "$SOCK") -c max_connections=60' -l $STACK_DIR/postgres.log start" >/dev/null

  local ADMIN; ADMIN="$(admin_url)"
  psql "$ADMIN" -q -c "drop database if exists $DB_NAME;" -c "create database $DB_NAME;"
  local DB; DB="$(db_url)"

  # ── Supabase's roles, as a project has them ──────────────────────────
  psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin create role anon nologin;                       exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin;              exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls;     exception when duplicate_object then null; end $$;
do $$ begin create role authenticator login noinherit password 'authenticator'; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants the service role everything through default privileges.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
-- A Supabase project also gives anon/authenticated default table privileges;
-- the migrations then REVOKE them on every bolagio_ table. Mirror that so the
-- shared-project verification proves the revokes, not their absence.
alter default privileges in schema public grant all on tables to anon, authenticated;
SQL

  echo "── applying migrations ──"
  for f in "${MIGRATIONS[@]}"; do
    [ -f "$f" ] || continue
    echo "   $f"
    psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -vE "NOTICE|^$" || true
  done
  echo "── seed ──"
  psql "$DB" -v ON_ERROR_STOP=1 -q -f supabase/seed/bolagio_booking_units.sql
  # Test data only: the local stack opens Schulstraße I for the simulated
  # provider. Never part of the seed, which leaves every unit closed.
  psql "$DB" -v ON_ERROR_STOP=1 -q -c "update bolagio_units set is_bookable = true where slug = 'schulstrasse-i';"

  # ── PostgREST ──────────────────────────────────────────────────────
  cat > "$STACK_DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@localhost:$PG_PORT/$DB_NAME"
db-schemas = "public"
db-anon-role = "anon"
db-pool = 10
server-host = "127.0.0.1"
server-port = $PGRST_PORT
jwt-secret = "$JWT_SECRET"
log-level = "error"
CONF
  # authenticator connects over TCP; trust auth is what initdb --auth=trust set.
  nohup "$POSTGREST" "$STACK_DIR/postgrest.conf" > "$STACK_DIR/postgrest.log" 2>&1 &
  echo $! > "$STACK_DIR/postgrest.pid"
  wait_for "http://127.0.0.1:$PGRST_PORT/" 80
  # supabase-js speaks to `${SUPABASE_URL}/rest/v1`; the proxy maps that prefix
  # onto the bare PostgREST.
  nohup node scripts/stack-proxy.mjs "$REST_PORT" "$PGRST_PORT" > "$STACK_DIR/proxy.log" 2>&1 &
  echo $! > "$STACK_DIR/proxy.pid"
  wait_for "http://127.0.0.1:$REST_PORT/rest/v1/" 80

  local SERVICE ANON
  SERVICE="$(mint_jwt service_role)"
  ANON="$(mint_jwt anon)"
  # Values are quoted: DATABASE_URL carries '&', which an unquoted `source`
  # would read as a background operator.
  cat > "$ENV_FILE" <<ENV
SUPABASE_URL="http://127.0.0.1:$REST_PORT"
SUPABASE_SERVICE_ROLE_KEY="$SERVICE"
SUPABASE_ANON_KEY="$ANON"
DATABASE_URL="$DB"
BOLAGIO_STACK_REST_PORT="$REST_PORT"
BOLAGIO_STACK_PG_PORT="$PG_PORT"
ENV
  echo "stack up: $ENV_FILE"
}

cmd_down() {
  for p in postgrest proxy; do
    if [ -f "$STACK_DIR/$p.pid" ]; then kill "$(cat "$STACK_DIR/$p.pid")" 2>/dev/null || true; rm -f "$STACK_DIR/$p.pid"; fi
  done
  if [ -d "$DATA" ] && [ -f "$DATA/PG_VERSION" ]; then run "$PGBIN/pg_ctl -D $DATA stop -m immediate" >/dev/null 2>&1 || true; fi
  rm -rf "$STACK_DIR"
  echo "stack down"
}

# Apply a migration to a running stack and make PostgREST re-read the schema.
cmd_migrate() {
  local DB; DB="$(db_url)"
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "${2:?usage: test-stack.sh migrate <file>}"
  psql "$DB" -q -c "notify pgrst, 'reload schema';"
  echo "applied $2 and reloaded the PostgREST schema cache"
}

cmd_reset() {
  local DB; DB="$(db_url)"
  psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
truncate bolagio_booking_intents cascade;
truncate bolagio_outbox_events, bolagio_payment_events, bolagio_external_operations,
         bolagio_reconciliation_jobs, bolagio_scheduler_runs, bolagio_integration_events,
         bolagio_admin_audit_log, bolagio_unit_inventory_days;
do $$ begin
  if to_regclass('public.bolagio_message_deliveries') is not null then execute 'truncate bolagio_message_deliveries'; end if;
  if to_regclass('public.bolagio_integration_health') is not null then execute 'truncate bolagio_integration_health'; end if;
  if to_regclass('public.bolagio_turnover_events') is not null then execute 'truncate bolagio_turnover_events'; end if;
  end if;
end $$;
SQL
  psql "$DB" -q -v ON_ERROR_STOP=1 -f tests/sql/finance-reset.sql
  echo "stack reset"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  migrate) cmd_migrate "$@" ;;
  env) echo "$ENV_FILE" ;;
  *) echo "usage: $0 up|down|reset|migrate <file>|env" >&2; exit 2 ;;
esac
