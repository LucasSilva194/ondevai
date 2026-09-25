#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOKS_DIR="${PB_HOOKS_DIR:-${PROJECT_DIR}/pb_hooks}"
PB_BIN="${1:-${POCKETBASE_BIN:-pocketbase}}"
PB_TEST_PORT="${PB_TEST_PORT:-18091}"
BASE_URL="http://127.0.0.1:${PB_TEST_PORT}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ondevai-pocketbase-schema.XXXXXX")"
DATA_DIR="${TEMP_DIR}/pb_data"
SERVER_LOG="${TEMP_DIR}/pocketbase.log"
SERVER_PID=""

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
  if [[ -f "${TEMP_DIR}/response.json" ]]; then
    printf 'Última resposta HTTP:\n' >&2
    jq . "${TEMP_DIR}/response.json" >&2 2>/dev/null || cat "${TEMP_DIR}/response.json" >&2
  fi
  if [[ -f "${SERVER_LOG}" ]]; then
    tail -80 "${SERVER_LOG}" >&2 || true
  fi
  exit 1
}

expect_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    fail "${label}: HTTP ${actual}, esperado ${expected}"
  fi
}

expect_failure_status() {
  local actual="$1"
  local label="$2"
  case "${actual}" in
    400|403|404) ;;
    *) fail "${label}: HTTP ${actual}, esperada rejeição 400/403/404" ;;
  esac
}

api_request() {
  local method="$1"
  local path="$2"
  local body="$3"
  local token="${4:-}"
  local response_file="$5"
  local args=(-sS -o "${response_file}" -w '%{http_code}' -X "${method}")
  args+=(-H 'Content-Type: application/json')
  if [[ -n "${token}" ]]; then
    args+=(-H "Authorization: ${token}")
  fi
  if [[ -n "${body}" ]]; then
    args+=(-d "${body}")
  fi
  curl "${args[@]}" "${BASE_URL}${path}"
}

json_value() {
  jq -er "$2" "$1"
}

printf 'PocketBase: '
"${PB_BIN}" --version

"${PB_BIN}" migrate up \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}"

# Confirma o schema diretamente antes de arrancar o servidor.
collection_count="$(sqlite3 "${DATA_DIR}/data.db" \
  "SELECT count(*) FROM _collections WHERE name IN ('users','user_settings','categories','expenses','monthly_incomes','savings_goals','savings_transactions','monthly_budgets','recurrence_exceptions');")"
[[ "${collection_count}" == '9' ]] || fail 'a migration não criou as nove coleções esperadas'

"${PB_BIN}" superuser create schema-test-admin@example.invalid 'schema-test-password-12345' \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}" >/dev/null

"${PB_BIN}" serve \
  --dev \
  --http "127.0.0.1:${PB_TEST_PORT}" \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}" \
  --hooksWatch=false >"${SERVER_LOG}" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 100); do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1 || fail 'servidor não arrancou'

response="${TEMP_DIR}/response.json"
status="$(api_request POST '/api/collections/_superusers/auth-with-password' \
  '{"identity":"schema-test-admin@example.invalid","password":"schema-test-password-12345"}' '' "${response}")"
expect_status 200 "${status}" 'autenticação do superutilizador descartável'
admin_token="$(json_value "${response}" '.token')"

register_user() {
  local suffix="$1"
  local email="schema-test-${suffix}@example.invalid"
  local body
  body="$(jq -cn --arg email "${email}" '{email:$email,password:"schema-test-user-password",passwordConfirm:"schema-test-user-password"}')"
  local status
  status="$(api_request POST '/api/collections/users/records' "${body}" '' "${response}")"
  expect_status 200 "${status}" "registo do utilizador ${suffix}"
  local id
  id="$(json_value "${response}" '.id')"

  body="$(jq -cn --arg email "${email}" '{identity:$email,password:"schema-test-user-password"}')"
  status="$(api_request POST '/api/collections/users/auth-with-password' "${body}" '' "${response}")"
  expect_status 403 "${status}" "login não verificado do utilizador ${suffix}"

  status="$(api_request PATCH "/api/collections/users/records/${id}" \
    '{"verified":true}' "${admin_token}" "${response}")"
  expect_status 200 "${status}" "verificação do utilizador ${suffix}"

  body="$(jq -cn --arg email "${email}" '{identity:$email,password:"schema-test-user-password"}')"
  status="$(api_request POST '/api/collections/users/auth-with-password' "${body}" '' "${response}")"
  expect_status 200 "${status}" "login do utilizador ${suffix}"
  printf '%s\t%s\n' "${id}" "$(json_value "${response}" '.token')"
}

IFS=$'\t' read -r user_a token_a < <(register_user 'a')
IFS=$'\t' read -r user_b token_b < <(register_user 'b')

create_record() {
  local collection="$1"
  local body="$2"
  local token="$3"
  local label="$4"
  local status
  status="$(api_request POST "/api/collections/${collection}/records" "${body}" "${token}" "${response}")"
  expect_status 200 "${status}" "${label}"
  json_value "${response}" '.id'
}

category_a="$(create_record categories \
  "$(jq -cn --arg owner "${user_a}" '{owner:$owner,name:"Categoria A",color:"#123456",order:0,archived:false,subcategories:[]}')" \
  "${token_a}" 'criação da categoria A')"
category_b="$(create_record categories \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner,name:"Categoria B",color:"#654321",order:0,archived:false,subcategories:[]}')" \
  "${token_b}" 'criação da categoria B')"

expense_a="$(create_record expenses \
  "$(jq -cn --arg owner "${user_a}" --arg category "${category_a}" '{owner:$owner,date:"2026-09-25",amountCents:1234,category:$category}')" \
  "${token_a}" 'criação da despesa A')"
expense_b="$(create_record expenses \
  "$(jq -cn --arg owner "${user_b}" --arg category "${category_b}" '{owner:$owner,date:"2026-09-25",amountCents:5678,category:$category}')" \
  "${token_b}" 'criação da despesa B')"

status="$(api_request GET '/api/collections/expenses/records' '' "${token_a}" "${response}")"
expect_status 200 "${status}" 'leitura da lista de despesas A'
[[ "$(json_value "${response}" '.totalItems')" == '1' ]] || fail 'A conseguiu listar despesas de B'
[[ "$(json_value "${response}" '.items[0].id')" == "${expense_a}" ]] || fail 'A não recebeu apenas a sua despesa'

status="$(api_request GET "/api/collections/expenses/records/${expense_b}" '' "${token_a}" "${response}")"
expect_status 404 "${status}" 'A não pode ler despesa de B'

status="$(api_request PATCH "/api/collections/expenses/records/${expense_b}" \
  '{"amountCents":1}' "${token_a}" "${response}")"
expect_status 404 "${status}" 'A não pode alterar despesa de B'

status="$(api_request DELETE "/api/collections/expenses/records/${expense_b}" '' "${token_a}" "${response}")"
expect_status 404 "${status}" 'A não pode apagar despesa de B'

status="$(api_request PATCH "/api/collections/categories/records/${category_a}" \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner}')" "${token_a}" "${response}")"
expect_failure_status "${status}" 'owner é imutável'

status="$(api_request POST '/api/collections/expenses/records' \
  "$(jq -cn --arg owner "${user_a}" --arg category "${category_b}" '{owner:$owner,date:"2026-09-25",amountCents:100,category:$category}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'categoria de outro owner é rejeitada'

status="$(api_request POST '/api/collections/categories/records' \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner,name:"Owner falso",color:"#112233",order:1,archived:false,subcategories:[]}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'A não pode criar um record com owner B'

status="$(api_request PATCH "/api/collections/expenses/records/${expense_a}" \
  "$(jq -cn --arg category "${category_b}" '{category:$category}')" "${token_a}" "${response}")"
expect_status 400 "${status}" 'update para categoria de outro owner é rejeitado'

status="$(api_request POST '/api/collections/expenses/records' \
  "$(jq -cn --arg owner "${user_a}" --arg category "${category_a}" '{owner:$owner,date:"2026-09-25",amountCents:1.5,category:$category}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'montante não inteiro é rejeitado'

status="$(api_request POST '/api/collections/expenses/records' \
  "$(jq -cn --arg owner "${user_a}" --arg category "${category_a}" '{owner:$owner,date:"2026-00-00",amountCents:100,category:$category}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'data civil estruturalmente inválida é rejeitada'

status="$(api_request POST '/api/collections/categories/records' \
  "$(jq -cn --arg owner "${user_a}" '{owner:$owner,name:"Cor inválida",color:"blue",order:2,archived:false,subcategories:[]}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'cor não hexadecimal é rejeitada'

goal_a="$(create_record savings_goals \
  "$(jq -cn --arg owner "${user_a}" '{owner:$owner,name:"Objetivo A",kind:"general",targetAmountCents:10000,currentAmountCents:0,monthlyContributionCents:0}')" \
  "${token_a}" 'criação do objetivo A')"
goal_b="$(create_record savings_goals \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner,name:"Objetivo B",kind:"general",targetAmountCents:10000,currentAmountCents:0,monthlyContributionCents:0}')" \
  "${token_b}" 'criação do objetivo B')"

transaction_a="$(create_record savings_transactions \
  "$(jq -cn --arg owner "${user_a}" --arg goal "${goal_a}" '{owner:$owner,goal:$goal,type:"deposit",amountCents:100,effectiveDate:"2026-09-25"}')" \
  "${token_a}" 'criação do movimento A')"

status="$(api_request POST '/api/collections/savings_transactions/records' \
  "$(jq -cn --arg owner "${user_a}" --arg goal "${goal_b}" '{owner:$owner,goal:$goal,type:"deposit",amountCents:100,effectiveDate:"2026-09-25"}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'objetivo de outro owner é rejeitado'

status="$(api_request PATCH "/api/collections/savings_transactions/records/${transaction_a}" \
  "$(jq -cn --arg goal "${goal_b}" '{goal:$goal}')" "${token_a}" "${response}")"
expect_status 400 "${status}" 'update para objetivo de outro owner é rejeitado'

income_b="$(create_record monthly_incomes \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner,name:"Rendimento B",kind:"salary",amountCents:100000,date:"2026-09-25"}')" \
  "${token_b}" 'criação do rendimento B')"

status="$(api_request POST '/api/collections/recurrence_exceptions/records' \
  "$(jq -cn --arg owner "${user_a}" --arg series "${income_b}" '{owner:$owner,seriesType:"income",seriesId:$series,occurrenceDate:"2026-10-25",action:"skip"}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'série de outro owner é rejeitada'

exception_body="$(jq -cn --arg owner "${user_a}" --arg series "${expense_a}" '{owner:$owner,seriesType:"expense",seriesId:$series,occurrenceDate:"2026-10-25",action:"skip"}')"
exception_a="$(create_record recurrence_exceptions "${exception_body}" "${token_a}" 'criação da exceção A')"
status="$(api_request POST '/api/collections/recurrence_exceptions/records' "${exception_body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'índice único de recurrence_exceptions'

status="$(api_request PATCH "/api/collections/recurrence_exceptions/records/${exception_a}" \
  "$(jq -cn --arg series "${income_b}" '{seriesType:"income",seriesId:$series}')" "${token_a}" "${response}")"
expect_status 400 "${status}" 'update para série de outro owner é rejeitado'

settings_body="$(jq -cn --arg owner "${user_a}" '{owner:$owner,currency:"EUR",locale:"pt-PT",onboardingCompleted:false,changesSinceExport:0}')"
create_record user_settings "${settings_body}" "${token_a}" 'criação das definições A' >/dev/null
status="$(api_request POST '/api/collections/user_settings/records' "${settings_body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'índice único de user_settings'

budget_body="$(jq -cn --arg owner "${user_a}" --arg category "${category_a}" '{owner:$owner,month:"2026-09",category:$category,amountCents:5000}')"
budget_a="$(create_record monthly_budgets "${budget_body}" "${token_a}" 'criação do orçamento A')"
status="$(api_request POST '/api/collections/monthly_budgets/records' "${budget_body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'índice único de monthly_budgets'

status="$(api_request POST '/api/collections/monthly_budgets/records' \
  "$(jq -cn --arg owner "${user_a}" --arg category "${category_b}" '{owner:$owner,month:"2026-10",category:$category,amountCents:5000}')" \
  "${token_a}" "${response}")"
expect_status 400 "${status}" 'categoria de orçamento de outro owner é rejeitada'

status="$(api_request PATCH "/api/collections/monthly_budgets/records/${budget_a}" \
  "$(jq -cn --arg category "${category_b}" '{category:$category}')" "${token_a}" "${response}")"
expect_status 400 "${status}" 'update de orçamento para categoria de outro owner é rejeitado'

create_record categories \
  "$(jq -cn --arg owner "${user_b}" '{owner:$owner,name:"Admin",color:"#ABCDEF",order:10,archived:false,subcategories:[]}')" \
  "${admin_token}" 'superutilizador pode administrar records privados' >/dev/null

status="$(api_request DELETE "/api/collections/users/records/${user_b}" '' "${admin_token}" "${response}")"
expect_status 204 "${status}" 'superutilizador elimina utilizador B'
status="$(api_request GET "/api/collections/expenses/records/${expense_b}" '' "${admin_token}" "${response}")"
expect_status 404 "${status}" 'cascade delete remove despesas do utilizador B'
status="$(api_request GET "/api/collections/categories/records/${category_b}" '' "${admin_token}" "${response}")"
expect_status 404 "${status}" 'cascade delete remove categorias do utilizador B'
status="$(api_request GET "/api/collections/savings_goals/records/${goal_b}" '' "${admin_token}" "${response}")"
expect_status 404 "${status}" 'cascade delete remove objetivos do utilizador B'

printf 'OK: isolamento, ownership, relações, campos e índices únicos validados.\n'

kill "${SERVER_PID}"
wait "${SERVER_PID}" || true
SERVER_PID=""

printf 'y\n' | "${PB_BIN}" migrate down 1 \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}"

remaining="$(sqlite3 "${DATA_DIR}/data.db" \
  "SELECT count(*) FROM _collections WHERE name IN ('users','user_settings','categories','expenses','monthly_incomes','savings_goals','savings_transactions','monthly_budgets','recurrence_exceptions');")"
[[ "${remaining}" == '1' ]] || fail 'migrate down não removeu as oito coleções privadas da Onda 1'

restored_users_rule="$(sqlite3 "${DATA_DIR}/data.db" \
  "SELECT deleteRule FROM _collections WHERE name = 'users';")"
[[ "${restored_users_rule}" == 'id = @request.auth.id' ]] || fail 'migrate down não repôs a rule original de users'

printf 'OK: migrate up e migrate down validados.\n'
