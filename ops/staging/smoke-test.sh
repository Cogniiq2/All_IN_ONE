#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BoLaGio STAGING — smoke test after a deploy (docs/cloudflare-deployment.md §3.6).
#
#   STAGING_BASE_URL=https://bolagio-staging.<account>.workers.dev \
#   BOOKING_SYNC_SECRET=… N8N_INTERNAL_SECRET=… ops/staging/smoke-test.sh
#
#   GET  /                                       → 200
#   GET  /apartments                             → 200
#   GET  /api/booking/availability?unit=schulstrasse-i → 200, JSON
#   POST /api/booking/reconcile {"limit":25} with x-bolagio-signature → 200
#        (this runs ordinary maintenance and writes a `reconcile` heartbeat)
#   GET  /api/internal/health (HMAC)             → schedulers[] contains reconcile
#
# Needs curl, openssl, node. Prints names and codes, never secret values.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

: "${STAGING_BASE_URL:?STAGING_BASE_URL is required}"
: "${BOOKING_SYNC_SECRET:?BOOKING_SYNC_SECRET is required}"
: "${N8N_INTERNAL_SECRET:?N8N_INTERNAL_SECRET is required}"
BASE="${STAGING_BASE_URL%/}"
UNIT="${SMOKE_UNIT:-schulstrasse-i}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0

expect_code() { # label url expected [curl args…]
  local label="$1" url="$2" want="$3"; shift 3
  local code; code="$(curl -sS -o "$TMP/body" -w '%{http_code}' "$@" "$url")"
  if [ "$code" = "$want" ]; then echo "   $label → HTTP $code"; else echo "   FAIL: $label → HTTP $code (expected $want)"; fail=1; fi
}

echo "── pages"
expect_code "GET /" "$BASE/" 200
expect_code "GET /apartments" "$BASE/apartments" 200

echo "── availability (unit=$UNIT)"
expect_code "GET /api/booking/availability" "$BASE/api/booking/availability?unit=$UNIT" 200
if node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$TMP/body" 2>/dev/null; then
  echo "   body is JSON"
else
  echo "   FAIL: availability body is not JSON"; fail=1
fi

echo "── reconcile (shared-secret POST; ordinary maintenance, writes the heartbeat)"
expect_code "POST /api/booking/reconcile" "$BASE/api/booking/reconcile" 200 \
  -X POST -H 'content-type: application/json' -H "x-bolagio-signature: $BOOKING_SYNC_SECRET" -d '{"limit":25}'
node -e '
  try { const b = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log("   report keys: " + Object.keys(b).join(", ")); } catch { console.log("   (report body not JSON)"); }
' "$TMP/body"

echo "── heartbeat visible through /api/internal/health"
TS="$(date +%s)"
SIG="$(printf 'v1:%s:' "$TS" | openssl dgst -sha256 -hmac "$N8N_INTERNAL_SECRET" -hex | sed 's/^.* //')"
expect_code "GET /api/internal/health" "$BASE/api/internal/health" 200 \
  -H "x-bolagio-timestamp: $TS" -H "x-bolagio-signature: v1=$SIG"
node -e '
  const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const s = (b.schedulers ?? []).find((x) => x.job === "reconcile");
  if (!s) { console.log("   FAIL: no reconcile heartbeat in schedulers[]"); process.exit(3); }
  console.log(`   scheduler reconcile: ok=${s.ok} age=${s.ageSeconds}s`);
  if (s.ageSeconds > 300) { console.log("   FAIL: reconcile heartbeat older than 5 minutes — the POST above did not record one"); process.exit(3); }
' "$TMP/body" || fail=1

[ "$fail" = "0" ] && echo "smoke test: OK" || { echo "smoke test: FAILED"; exit 1; }
