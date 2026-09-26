#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PB_BIN="${1:-${POCKETBASE_BIN:-pocketbase}}"
PB_TEST_PORT="${PB_TEST_PORT:-18094}"
BASE_URL="http://127.0.0.1:${PB_TEST_PORT}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ondevai-pocketbase-wave3.XXXXXX")"
DATA_DIR="${TEMP_DIR}/pb_data"
SERVER_LOG="${TEMP_DIR}/pocketbase.log"
SERVER_PID=""
ADMIN_EMAIL='wave3-test-admin@example.invalid'
ADMIN_PASSWORD='wave3-test-admin-password-12345'

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  if [[ -f "${SERVER_LOG}" ]]; then
    tail -120 "${SERVER_LOG}" >&2 || true
  fi
  exit 1
}

for dependency in node curl sqlite3; do
  command -v "${dependency}" >/dev/null 2>&1 || fail "dependência em falta: ${dependency}"
done

for source in \
  "${PROJECT_DIR}/pb_hooks/data"/*.js \
  "${PROJECT_DIR}/pb_hooks/account"/*.js \
  "${PROJECT_DIR}/pb_hooks/routes/wave3.pb.js"; do
  [[ -f "${source}" ]] || continue
  node --check "${source}"
done
node --check "${SCRIPT_DIR}/fixtures.js"
node --check "${SCRIPT_DIR}/integration.js"
node --check "${SCRIPT_DIR}/test-helpers.js"
node --check "${SCRIPT_DIR}/test-atomicity.js"
node "${SCRIPT_DIR}/test-helpers.js"
node "${SCRIPT_DIR}/test-atomicity.js"

pb_version="$("${PB_BIN}" --version 2>&1)"
printf '%s\n' "PocketBase: ${pb_version}"
[[ "${pb_version}" == *'0.40.4'* ]] || fail 'esta validação exige PocketBase 0.40.4'

"${PB_BIN}" migrate up \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${PROJECT_DIR}/pb_hooks"

data_imports_count="$(sqlite3 "${DATA_DIR}/data.db" "SELECT count(*) FROM _collections WHERE name='data_imports';")"
[[ "${data_imports_count}" == '1' ]] || fail 'migration da Onda 3 não criou data_imports'

"${PB_BIN}" superuser create "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${PROJECT_DIR}/pb_hooks" >/dev/null

"${PB_BIN}" serve \
  --dev \
  --http "127.0.0.1:${PB_TEST_PORT}" \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${PROJECT_DIR}/pb_hooks" \
  --hooksWatch=false >"${SERVER_LOG}" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 100); do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1 || fail 'servidor descartável não arrancou'

PB_TEST_URL="${BASE_URL}" \
PB_TEST_ADMIN_EMAIL="${ADMIN_EMAIL}" \
PB_TEST_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  node "${SCRIPT_DIR}/integration.js"

kill "${SERVER_PID}" 2>/dev/null || true
wait "${SERVER_PID}" 2>/dev/null || true
SERVER_PID=""

printf 'y\n' | "${PB_BIN}" migrate down 1 \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${PROJECT_DIR}/pb_hooks" >/dev/null

data_imports_after_rollback="$(sqlite3 "${DATA_DIR}/data.db" "SELECT count(*) FROM _collections WHERE name='data_imports';")"
[[ "${data_imports_after_rollback}" == '0' ]] || fail 'rollback da Onda 3 não removeu data_imports'

printf 'OK: suite PocketBase Onda 3 e rollback executados em pb_data temporário.\n'
