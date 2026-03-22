#!/usr/bin/env bash
#
# Smoke-test /api/mongo routes against a running Wonder server.
#
# Phase 0 — replace Zach dummy data in Mongo (auth zwest2563): deletes prior dummy rows,
#            re-seeds user + Lance sample + fixed session. Uses MONGODB_URI directly (no HTTP).
# Phase 1 — shallow: HTTP status codes only (random smoke-test subject).
# Phase 2 — deep: JSON body checks + edge cases (404/400/422) when phase 1 passes.
#
# Prerequisites:
#   - Server running (e.g. from backend/server: python -m uvicorn server.rest:app --reload --port 8000)
#   - MONGODB_URI set in repo-root .env (same as the server uses)
#   - python3 on PATH (seed script + JSON checks); optional lancedb for Lance → Mongo sample
#
# Usage:
#   ./scripts/smoke_mongo_api.sh
#   BASE_URL=http://127.0.0.1:9000 ./scripts/smoke_mongo_api.sh
#
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:8000}"
# Stable id prefix so Atlas documents are easy to spot / delete later
SUBJECT="smoke-test-$(date +%Y%m%d%H%M%S)-$$"
SESSION_ID="$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen 2>/dev/null || echo "00000000-0000-4000-8000-000000000001")"
# User id that must not exist (random UUID string, not inserted by this script)
MISSING_USER_ID="$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "00000000-0000-0000-0000-00000000dead")"
MISSING_SESSION_ID="$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "00000000-0000-0000-0000-00000000cafe")"

export BASE_URL SUBJECT SESSION_ID

FAILURES=0
TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

log() { printf '%s\n' "$*"; }
ok()  { log "  OK  $*"; }
bad() { log "  FAIL $*"; FAILURES=$((FAILURES + 1)); }

# curl: write body to TMP_BODY, print status code to stdout
http_code() {
  curl -sS --connect-timeout 5 -o "$TMP_BODY" -w "%{http_code}" "$@" || echo "000"
}

expect() {
  local name="$1" want="$2" code
  code="$(http_code "${@:3}")"
  if [[ "$code" == "$want" ]]; then
    ok "$name (HTTP $code)"
  else
    bad "$name — expected HTTP $want, got $code"
    if [[ -s "$TMP_BODY" ]]; then
      head -c 400 "$TMP_BODY" | tr '\n' ' '
      log ""
    fi
  fi
}

# Run python with TMP_BODY path as argv[1] for JSON file checks
py_assert() {
  local name="$1"
  shift
  if python3 -c "$@" "$TMP_BODY"; then
    ok "$name"
  else
    bad "$name"
    [[ -s "$TMP_BODY" ]] && head -c 300 "$TMP_BODY" | tr '\n' ' ' && log ""
  fi
}

# curl into TMP_BODY; fail if status is not 200 (avoids parsing error HTML/JSON in py_assert)
deep_fetch_200() {
  local label="$1"
  shift
  local c
  c="$(http_code "$@")"
  if [[ "$c" != "200" ]]; then
    bad "deep: $label — expected HTTP 200, got $c"
    [[ -s "$TMP_BODY" ]] && head -c 200 "$TMP_BODY" | tr '\n' ' ' && log ""
    return 1
  fi
  return 0
}

log "=== Wonder Mongo API smoke test ==="
log "BASE_URL=$BASE_URL"
log "SUBJECT=$SUBJECT"
log "SESSION_ID=$SESSION_ID"
log ""

# --- reachability ---
code="$(http_code "$BASE_URL/health")"
if [[ "$code" != "200" ]]; then
  log "Cannot GET $BASE_URL/health (HTTP $code). Start the server from backend/server, e.g.:"
  log "  python -m uvicorn server.rest:app --reload --port 8000"
  exit 1
fi
ok "GET /health (HTTP $code)"

expect "GET /health/mongo" 200 "$BASE_URL/health/mongo"

log ""
log "=== Phase 0: Zach dummy seed (replaces prior zwest2563 rows in Mongo) ==="
cd "$ROOT_DIR" || exit 1
if ! python3 scripts/seed_zach_dummy.py; then
  log "seed_zach_dummy.py failed — aborting."
  exit 1
fi
ok "seed_zach_dummy.py (see scripts/seed_zach_dummy.py)"

expect "GET /api/mongo/users/zwest2563 (seeded dummy)" 200 "$BASE_URL/api/mongo/users/zwest2563"
log ""

if ! curl -sS --connect-timeout 5 "$BASE_URL/openapi.json" | grep -q '/api/mongo/users'; then
  log ""
  log "WARNING: OpenAPI has no /api/mongo/users — this server build may not include mongo_routes."
  log "Restart uvicorn from backend/server after: app.include_router(mongo_api_router) in server/rest.py"
  log ""
fi

log "=== Phase 1: shallow (random smoke subject) ==="
# --- users (shallow) ---
expect "PUT /api/mongo/users" 200 -X PUT "$BASE_URL/api/mongo/users" \
  -H "Content-Type: application/json" \
  -d "{\"auth_subject\":\"$SUBJECT\",\"email\":\"smoke@example.com\",\"display_name\":\"Smoke\",\"preferences\":{\"daw\":\"ableton\"}}"

expect "GET /api/mongo/users/me (header)" 200 "$BASE_URL/api/mongo/users/me" \
  -H "X-Auth-Subject: $SUBJECT"

expect "GET /api/mongo/users/{id}" 200 "$BASE_URL/api/mongo/users/$SUBJECT"

# --- samples (shallow) ---
expect "PUT /api/mongo/samples" 200 -X PUT "$BASE_URL/api/mongo/samples" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$SUBJECT\",\"file_path\":\"/smoke/kick.wav\",\"source\":\"local\",\"vibe\":{\"category\":\"drums\",\"tags\":[\"kick\"]}}"

expect "GET /api/mongo/samples" 200 "$BASE_URL/api/mongo/samples?user_id=$SUBJECT&limit=5"

expect "PUT /api/mongo/samples (bad body → 400)" 400 -X PUT "$BASE_URL/api/mongo/samples" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$SUBJECT\",\"source\":\"local\"}"

# --- sessions (shallow) ---
expect "PUT /api/mongo/sessions" 200 -X PUT "$BASE_URL/api/mongo/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$SUBJECT\",\"session_id\":\"$SESSION_ID\",\"client\":\"smoke-script\",\"turns\":[{\"role\":\"user\",\"content\":\"hello\"}],\"meta\":{}}"

expect "GET /api/mongo/sessions/{id}" 200 "$BASE_URL/api/mongo/sessions/$SESSION_ID"

expect "POST /api/mongo/sessions/{id}/turns" 200 -X POST "$BASE_URL/api/mongo/sessions/$SESSION_ID/turns" \
  -H "Content-Type: application/json" \
  -d '{"turn":{"role":"assistant","content":"smoke reply"}}'

expect "GET /api/mongo/sessions/{id}/analytics-events" 200 "$BASE_URL/api/mongo/sessions/$SESSION_ID/analytics-events"

log ""
if [[ "$FAILURES" -ne 0 ]]; then
  log "$FAILURES shallow check(s) failed — skipping deep checks."
  exit 1
fi

# =============================================================================
# Deep checks: response bodies + edge-case status codes
# =============================================================================
log "=== Deep checks (JSON + edge cases) ==="

# User document from GET by id matches upsert
if deep_fetch_200 "GET user by id" "$BASE_URL/api/mongo/users/$SUBJECT"; then
  py_assert "deep: GET user JSON has auth_subject, email, _id" "
import json, sys, os
d = json.load(open(sys.argv[1]))
sub = os.environ['SUBJECT']
assert d.get('auth_subject') == sub, d.get('auth_subject')
assert d.get('email') == 'smoke@example.com'
assert d.get('display_name') == 'Smoke'
assert '_id' in d
"
fi

# GET /users/me matches same profile
if deep_fetch_200 "GET /users/me" "$BASE_URL/api/mongo/users/me" -H "X-Auth-Subject: $SUBJECT"; then
  py_assert "deep: GET /users/me JSON matches subject + email" "
import json, sys, os
d = json.load(open(sys.argv[1]))
assert d.get('auth_subject') == os.environ['SUBJECT']
assert d.get('email') == 'smoke@example.com'
"
fi

# Sample list contains our kick.wav row
if deep_fetch_200 "GET /samples list" "$BASE_URL/api/mongo/samples?user_id=$SUBJECT&limit=10"; then
  py_assert "deep: GET /samples returns list with /smoke/kick.wav" "
import json, sys
rows = json.load(open(sys.argv[1]))
assert isinstance(rows, list)
paths = [r.get('file_path') for r in rows]
assert '/smoke/kick.wav' in paths, paths
"
fi

# Bad sample error detail mentions file_path / uri (re-PUT to refill TMP_BODY)
code="$(http_code -X PUT "$BASE_URL/api/mongo/samples" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$SUBJECT\",\"source\":\"local\"}")"
if [[ "$code" != "400" ]]; then
  bad "deep: bad sample re-check — expected HTTP 400, got $code"
else
  ok "deep: bad sample re-check (HTTP 400)"
  py_assert "deep: bad sample 400 body mentions file_path or uri" "
import json, sys
d = json.load(open(sys.argv[1]))
detail = d.get('detail', '')
assert isinstance(detail, str)
low = detail.lower()
assert 'file_path' in low or 'uri' in low, detail
"
fi

# Session has two turns in order after POST turn
if deep_fetch_200 "GET session" "$BASE_URL/api/mongo/sessions/$SESSION_ID"; then
  py_assert "deep: session has 2 turns; last assistant content" "
import json, sys, os
d = json.load(open(sys.argv[1]))
assert d.get('user_id') == os.environ['SUBJECT']
assert d.get('session_id') == os.environ['SESSION_ID']
turns = d.get('turns') or []
assert len(turns) == 2, len(turns)
assert turns[0].get('content') == 'hello'
assert turns[1].get('role') == 'assistant'
assert turns[1].get('content') == 'smoke reply'
"
fi

# Analytics returns a non-empty list of dicts with expected keys
if deep_fetch_200 "GET analytics-events" "$BASE_URL/api/mongo/sessions/$SESSION_ID/analytics-events"; then
  py_assert "deep: analytics-events non-empty with event_type" "
import json, sys
rows = json.load(open(sys.argv[1]))
assert isinstance(rows, list)
assert len(rows) >= 1
for r in rows:
    assert 'event_type' in r
"
fi

# Edge: GET /users/me with no identity → 400
expect "deep: GET /users/me without header/query → 400" 400 "$BASE_URL/api/mongo/users/me"

# Edge: GET unknown user → 404
expect "deep: GET /users/{missing} → 404" 404 "$BASE_URL/api/mongo/users/$MISSING_USER_ID"

# Edge: GET unknown session → 404
expect "deep: GET /sessions/{missing} → 404" 404 "$BASE_URL/api/mongo/sessions/$MISSING_SESSION_ID"

# Edge: invalid JSON body → 422
expect "deep: PUT /users with invalid JSON → 422" 422 -X PUT "$BASE_URL/api/mongo/users" \
  -H "Content-Type: application/json" \
  -d '{'

# Edge: query validation — limit above max → 422
expect "deep: GET /samples?limit=9999 → 422" 422 "$BASE_URL/api/mongo/samples?user_id=$SUBJECT&limit=9999"

log ""
if [[ "$FAILURES" -eq 0 ]]; then
  log "All shallow + deep checks passed."
  exit 0
else
  log "$FAILURES total check(s) failed."
  exit 1
fi
