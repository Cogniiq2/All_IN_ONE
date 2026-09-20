#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BoLaGio STAGING — health check of a deployed worker.
#
#   STAGING_BASE_URL=https://bolagio-staging.<account>.workers.dev \
#   N8N_INTERNAL_SECRET=… ops/staging/health-check.sh
#
#   1. GET /api/internal/health, signed with the n8n HMAC (v1:<ts>:<empty body>)
#      → HTTP 200; prints the alert counts, scheduler heartbeats, queue depths
#   2. GET /admin → HTTP 307 to the login page, X-Robots-Tag: noindex, no-store
#   3. GET /api/booking/payment/config → HTTP 403 while DIRECT_BOOKING_ENABLED
#      is not true (set DIRECT_BOOKING_ENABLED=true in THIS shell to expect 200
#      during the sandbox end-to-end run)
#
# Needs curl, openssl, node. Prints names and codes, never secret values.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

: "${STAGING_BASE_URL:?STAGING_BASE_URL is required (https://…, no trailing slash)}"
: "${N8N_INTERNAL_SECRET:?N8N_INTERNAL_SECRET is required (the staging worker's value)}"
BASE="${STAGING_BASE_URL%/}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0

echo "── 1. /api/internal/health (HMAC-signed GET)"
TS="$(date +%s)"
SIG="$(printf 'v1:%s:' "$TS" | openssl dgst -sha256 -hmac "$N8N_INTERNAL_SECRET" -hex | sed 's/^.* //')"
CODE="$(curl -sS -o "$TMP/health.json" -w '%{http_code}' \
  -H "x-bolagio-timestamp: $TS" -H "x-bolagio-signature: v1=$SIG" "$BASE/api/internal/health")"
if [ "$CODE" = "200" ]; then
  echo "   HTTP 200"
  node -e '
    const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    console.log(`   environment=${b.environment} mode=${b.mode} directBooking=${b.directBooking}`);
    console.log(`   alert counts: ${JSON.stringify(b.counts)}`);
    console.log(`   not instrumented: ${JSON.stringify(b.notInstrumented)}`);
    for (const s of b.schedulers ?? []) console.log(`   scheduler ${s.job}: ok=${s.ok} age=${s.ageSeconds}s`);
    if (!b.schedulers || b.schedulers.length === 0) console.log("   schedulers: none recorded yet (create the schedule: ops/staging/cron.sql)");
    console.log(`   queues: ${JSON.stringify(b.queues)}`);
    const refusals = (b.configFindings ?? []).filter((f) => f.severity === "refuse");
    for (const f of b.configFindings ?? []) console.log(`   config ${f.severity}: ${f.code}`);
    if (refusals.length) { console.log("   REFUSE findings present"); process.exit(3); }
  ' "$TMP/health.json" || fail=1
else
  echo "   FAIL: HTTP $CODE (401 = wrong N8N_INTERNAL_SECRET or clock skew > replay window; 503 = database unreachable)"; fail=1
fi

echo "── 2. /admin must redirect (307) with the hardened headers"
curl -sS -o /dev/null -D "$TMP/admin.h" -w '%{http_code}\n' "$BASE/admin" > "$TMP/admin.code"
CODE="$(cat "$TMP/admin.code")"
if [ "$CODE" = "307" ]; then echo "   HTTP 307"; else echo "   FAIL: HTTP $CODE (expected 307)"; fail=1; fi
grep -qi '^x-robots-tag: *noindex' "$TMP/admin.h" && echo "   X-Robots-Tag: noindex present" || { echo "   FAIL: X-Robots-Tag noindex missing"; fail=1; }
grep -qi '^cache-control: *no-store' "$TMP/admin.h" && echo "   Cache-Control: no-store present" || { echo "   FAIL: Cache-Control no-store missing"; fail=1; }
grep -i '^location:' "$TMP/admin.h" | grep -q '/admin/login' && echo "   Location → /admin/login" || { echo "   FAIL: Location is not /admin/login"; fail=1; }

echo "── 3. /api/booking/payment/config"
EXPECT=403; [ "${DIRECT_BOOKING_ENABLED:-}" = "true" ] && EXPECT=200
CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/booking/payment/config")"
if [ "$CODE" = "$EXPECT" ]; then echo "   HTTP $CODE (expected $EXPECT — DIRECT_BOOKING_ENABLED=${DIRECT_BOOKING_ENABLED:-unset})"; else echo "   FAIL: HTTP $CODE (expected $EXPECT)"; fail=1; fi

[ "$fail" = "0" ] && echo "health check: OK" || { echo "health check: FAILED"; exit 1; }
