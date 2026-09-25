#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PB_BIN="${1:-${POCKETBASE_BIN:-pocketbase}}"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail 'dependencia em falta: node'

for source in \
  "${PROJECT_DIR}/pb_hooks/data"/*.js \
  "${PROJECT_DIR}/pb_hooks/account"/*.js \
  "${PROJECT_DIR}/pb_hooks/routes/wave3.pb.js" \
  "${PROJECT_DIR}/pb_migrations/202609250200_wave3_data_imports.js"; do
  node --check "${source}"
done
node "${SCRIPT_DIR}/test-helpers.js"

pb_version="$("${PB_BIN}" --version 2>&1)"
printf '%s\n' "PocketBase: ${pb_version}"
[[ "${pb_version}" == *'0.40.4'* ]] || fail 'esta validacao exige PocketBase 0.40.4'

# A suite de integracao e seguranca e mantida separada para que os seus
# fixtures tambem possam ser usados pela regressao Angular/coordenador.
INTEGRATION_RUNNER="${PROJECT_DIR}/scripts/pocketbase-wave3-tests/validate.sh"
if [[ -x "${INTEGRATION_RUNNER}" ]]; then
  exec "${INTEGRATION_RUNNER}" "${PB_BIN}"
fi

fail 'suite de integracao scripts/pocketbase-wave3-tests/validate.sh em falta'
