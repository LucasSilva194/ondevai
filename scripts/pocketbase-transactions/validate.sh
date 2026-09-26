#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOKS_DIR="${PB_HOOKS_DIR:-${PROJECT_DIR}/pb_hooks}"
PB_BIN="${1:-${POCKETBASE_BIN:-pocketbase}}"
PB_TEST_PORT="${PB_TEST_PORT:-18093}"
BASE_URL="http://127.0.0.1:${PB_TEST_PORT}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ondevai-pocketbase-wave2.XXXXXX")"
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
    printf 'Ultima resposta HTTP:\n' >&2
    jq . "${TEMP_DIR}/response.json" >&2 2>/dev/null || true
  fi
  if [[ -f "${SERVER_LOG}" ]]; then
    tail -100 "${SERVER_LOG}" >&2 || true
  fi
  exit 1
}

expect_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  [[ "${actual}" == "${expected}" ]] || fail "${label}: HTTP ${actual}, esperado ${expected}"
}

expect_rejection() {
  local actual="$1"
  local label="$2"
  case "${actual}" in
    400|403|404) ;;
    *) fail "${label}: HTTP ${actual}, esperada rejeicao 400/403/404" ;;
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

for dependency in curl jq sqlite3 node; do
  command -v "${dependency}" >/dev/null 2>&1 || fail "dependencia em falta: ${dependency}"
done

node "${SCRIPT_DIR}/test-helpers.js"

pb_version="$("${PB_BIN}" --version 2>&1)"
printf '%s\n' "PocketBase: ${pb_version}"
[[ "${pb_version}" == *'0.40.4'* ]] || fail 'esta validacao exige PocketBase 0.40.4'

"${PB_BIN}" migrate up \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}"

for collection in savings_goals savings_transactions; do
  rules="$(sqlite3 -separator '|' "${DATA_DIR}/data.db" \
    "SELECT coalesce(createRule,'<null>'),coalesce(updateRule,'<null>'),coalesce(deleteRule,'<null>') FROM _collections WHERE name='${collection}';")"
  [[ "${rules}" == '<null>|<null>|<null>' ]] || fail "rules financeiras nao bloqueadas em ${collection}"
done

"${PB_BIN}" superuser create wave2-test-admin@example.invalid 'wave2-test-admin-password-12345' \
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
curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1 || fail 'servidor nao arrancou'

response="${TEMP_DIR}/response.json"
status="$(api_request POST '/api/collections/_superusers/auth-with-password' \
  '{"identity":"wave2-test-admin@example.invalid","password":"wave2-test-admin-password-12345"}' '' "${response}")"
expect_status 200 "${status}" 'autenticacao do superutilizador descartavel'
admin_token="$(json_value "${response}" '.token')"

register_user() {
  local suffix="$1"
  local email="wave2-${suffix}@example.invalid"
  local body
  local status
  local id
  body="$(jq -cn --arg email "${email}" '{email:$email,password:"wave2-user-password",passwordConfirm:"wave2-user-password"}')"
  status="$(api_request POST '/api/collections/users/records' "${body}" '' "${response}")"
  expect_status 200 "${status}" "registo do utilizador ${suffix}"
  id="$(json_value "${response}" '.id')"
  status="$(api_request PATCH "/api/collections/users/records/${id}" \
    '{"verified":true}' "${admin_token}" "${response}")"
  expect_status 200 "${status}" "verificacao do utilizador ${suffix}"
  body="$(jq -cn --arg email "${email}" '{identity:$email,password:"wave2-user-password"}')"
  status="$(api_request POST '/api/collections/users/auth-with-password' "${body}" '' "${response}")"
  expect_status 200 "${status}" "login do utilizador ${suffix}"
  printf '%s\t%s\n' "${id}" "$(json_value "${response}" '.token')"
}

IFS=$'\t' read -r user_a token_a < <(register_user 'a')
IFS=$'\t' read -r user_b token_b < <(register_user 'b')

category_a='caaaaaaaaaaaaaa'
category_a2='cbbbbbbbbbbbbbb'
category_b='ccccccccccccccc'

categories_a_body="$(jq -cn \
  --arg owner "${user_a}" --arg first "${category_a}" --arg second "${category_a2}" \
  '{owner:$owner,categories:[
    {id:$first,owner:$owner,name:"Casa",color:"#112233",order:0,archived:false,subcategories:[]},
    {id:$second,owner:$owner,name:"Lazer",color:"#445566",order:1,archived:false,subcategories:[]}
  ]}')"
status="$(api_request POST '/api/ondevai/categories/bulk-upsert' "${categories_a_body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'bulk inicial de categorias'
[[ "$(json_value "${response}" 'length')" == '2' ]] || fail 'bulk de categorias nao devolveu dois records'

categories_b_body="$(jq -cn --arg owner "${user_b}" --arg id "${category_b}" \
  '{owner:$owner,categories:[{id:$id,owner:$owner,name:"B",color:"#778899",order:0,archived:false,subcategories:[]}]}')"
status="$(api_request POST '/api/ondevai/categories/bulk-upsert' "${categories_b_body}" "${token_b}" "${response}")"
expect_status 200 "${status}" 'bulk de categorias do utilizador B'

failed_categories="$(jq -cn \
  --arg owner "${user_a}" --arg first "${category_a}" --arg second "${category_a2}" \
  '{owner:$owner,categories:[
    {id:$first,owner:$owner,name:"Casa alterada",color:"#ABCDEF",order:0,archived:false,subcategories:[]},
    {id:$second,owner:$owner,name:"Lazer",color:"#445566",order:1,archived:false,subcategories:[]},
    {id:"cdddddddddddddd",owner:$owner,name:"Invalida",color:"blue",order:2,archived:false,subcategories:[]}
  ]}')"
status="$(api_request POST '/api/ondevai/categories/bulk-upsert' "${failed_categories}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'falha integral do bulk de categorias'
status="$(api_request GET "/api/collections/categories/records/${category_a}" '' "${token_a}" "${response}")"
expect_status 200 "${status}" 'categoria permanece legivel depois do rollback'
[[ "$(json_value "${response}" '.name')" == 'Casa' ]] || fail 'bulk de categorias deixou alteracao parcial'

repeated_onboarding="$(jq -cn --arg owner "${user_a}" \
  '{owner:$owner,categories:[{id:"ceeeeeeeeeeeeee",owner:$owner,name:"Casa",color:"#112233",order:0,archived:false,subcategories:[]}]}')"
status="$(api_request POST '/api/ondevai/categories/bulk-upsert' "${repeated_onboarding}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'repeticao do onboarding nao duplica categorias'

goal_zero='gaaaaaaaaaaaaaa'
goal_main='gbbbbbbbbbbbbbb'
goal_delete='gcccccccccccccc'
goal_b='gdddddddddddddd'
goal_concurrent='geeeeeeeeeeeeee'
goal_rollback='gffffffffffffff'
opening_main='maaaaaaaaaaaaaa'
deposit_main='mbbbbbbbbbbbbbb'
withdraw_main='mcccccccccccccc'
adjustment_main='mdddddddddddddd'
large_withdraw='meeeeeeeeeeeeee'

goal_payload() {
  local owner="$1"
  local id="$2"
  local balance="$3"
  jq -cn --arg owner "${owner}" --arg id "${id}" --argjson balance "${balance}" \
    '{id:$id,owner:$owner,name:"Reserva",kind:"reserve",targetAmountCents:100000,currentAmountCents:$balance,monthlyContributionCents:100}'
}

body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" "${goal_zero}" 0)" '{owner:$owner,goal:$goal}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar goal sem saldo'
[[ "$(json_value "${response}" '.currentAmountCents')" == '0' ]] || fail 'goal sem saldo devolveu saldo incorreto'

opening="$(jq -cn --arg id "${opening_main}" --arg owner "${user_a}" --arg goal "${goal_main}" \
  '{id:$id,owner:$owner,goal:$goal,type:"opening",amountCents:1000,effectiveDate:"2026-09-25",note:"Saldo inicial"}')"
body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" "${goal_main}" 1000)" --argjson opening "${opening}" \
  '{owner:$owner,goal:$goal,opening:$opening}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar goal com opening'

body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" 'ggggggggggggggg' 100)" '{owner:$owner,goal:$goal}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'rejeitar saldo sem opening'

bad_opening="$(jq -cn --arg owner "${user_a}" '{id:"mgggggggggggggg",owner:$owner,goal:"ghhhhhhhhhhhhhh",type:"opening",amountCents:99,effectiveDate:"2026-09-25"}')"
body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" 'ghhhhhhhhhhhhhh' 100)" --argjson opening "${bad_opening}" \
  '{owner:$owner,goal:$goal,opening:$opening}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'rejeitar opening inconsistente'

transaction_body() {
  local owner="$1"
  local id="$2"
  local goal="$3"
  local type="$4"
  local amount="$5"
  jq -cn --arg owner "${owner}" --arg id "${id}" --arg goal "${goal}" --arg type "${type}" --argjson amount "${amount}" \
    '{owner:$owner,transaction:{id:$id,owner:$owner,goal:$goal,type:$type,amountCents:$amount,effectiveDate:"2026-09-25"}}'
}

status="$(api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" "${deposit_main}" "${goal_main}" deposit 500)" "${token_a}" "${response}")"
expect_status 200 "${status}" 'adicionar deposito'
[[ "$(json_value "${response}" '.currentAmountCents')" == '1500' ]] || fail 'deposito nao atualizou saldo'

status="$(api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" "${withdraw_main}" "${goal_main}" withdrawal 200)" "${token_a}" "${response}")"
expect_status 200 "${status}" 'adicionar levantamento'
[[ "$(json_value "${response}" '.currentAmountCents')" == '1300' ]] || fail 'levantamento nao atualizou saldo'

status="$(api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" 'mhhhhhhhhhhhhhh' "${goal_main}" withdrawal 5000)" "${token_a}" "${response}")"
expect_status 400 "${status}" 'rejeitar levantamento acima do saldo'

status="$(api_request POST '/api/ondevai/savings/transactions/update' \
  "$(transaction_body "${user_a}" "${deposit_main}" "${goal_main}" deposit 700)" "${token_a}" "${response}")"
expect_status 200 "${status}" 'editar deposito'
[[ "$(json_value "${response}" '.currentAmountCents')" == '1500' ]] || fail 'edicao do deposito calculou saldo incorreto'

status="$(api_request POST '/api/ondevai/savings/transactions/update' \
  "$(transaction_body "${user_a}" "${withdraw_main}" "${goal_main}" withdrawal 300)" "${token_a}" "${response}")"
expect_status 200 "${status}" 'editar levantamento'
[[ "$(json_value "${response}" '.currentAmountCents')" == '1400' ]] || fail 'edicao do levantamento calculou saldo incorreto'

status="$(api_request POST '/api/ondevai/savings/transactions/update' \
  "$(transaction_body "${user_a}" "${deposit_main}" "${goal_main}" withdrawal 5000)" "${token_a}" "${response}")"
expect_status 400 "${status}" 'rejeitar edicao que cria saldo negativo'

status="$(api_request POST '/api/ondevai/savings/transactions/delete' \
  "$(jq -cn --arg owner "${user_a}" --arg id "${withdraw_main}" '{owner:$owner,id:$id}')" "${token_a}" "${response}")"
expect_status 200 "${status}" 'eliminar movimento'
[[ "$(json_value "${response}" '.currentAmountCents')" == '1700' ]] || fail 'delete do movimento calculou saldo incorreto'

goal_update="$(goal_payload "${user_a}" "${goal_main}" 1700)"
goal_update="$(jq -cn --argjson goal "${goal_update}" '$goal + {name:"Reserva atualizada"}')"
status="$(api_request POST '/api/ondevai/savings/goals/update' \
  "$(jq -cn --arg owner "${user_a}" --argjson goal "${goal_update}" '{owner:$owner,goal:$goal}')" "${token_a}" "${response}")"
expect_status 200 "${status}" 'atualizar metadados do goal sem ajuste'

adjustment="$(jq -cn --arg id "${adjustment_main}" --arg owner "${user_a}" --arg goal "${goal_main}" \
  '{id:$id,owner:$owner,goal:$goal,type:"deposit",amountCents:100,effectiveDate:"2026-09-25"}')"
goal_update="$(goal_payload "${user_a}" "${goal_main}" 1800)"
status="$(api_request POST '/api/ondevai/savings/goals/update' \
  "$(jq -cn --arg owner "${user_a}" --argjson goal "${goal_update}" --argjson adjustment "${adjustment}" '{owner:$owner,goal:$goal,adjustment:$adjustment}')" \
  "${token_a}" "${response}")"
expect_status 200 "${status}" 'atualizar saldo do goal com ajuste'

status="$(api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" "${large_withdraw}" "${goal_main}" withdrawal 1600)" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar levantamento para teste de delete negativo'
status="$(api_request POST '/api/ondevai/savings/transactions/delete' \
  "$(jq -cn --arg owner "${user_a}" --arg id "${opening_main}" '{owner:$owner,id:$id}')" "${token_a}" "${response}")"
expect_status 400 "${status}" 'rejeitar eliminacao que cria saldo negativo'

opening_delete="$(jq -cn --arg id 'miiiiiiiiiiiiii' --arg owner "${user_a}" --arg goal "${goal_delete}" \
  '{id:$id,owner:$owner,goal:$goal,type:"opening",amountCents:250,effectiveDate:"2026-09-25"}')"
body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" "${goal_delete}" 250)" --argjson opening "${opening_delete}" \
  '{owner:$owner,goal:$goal,opening:$opening}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar goal a eliminar'
status="$(api_request POST '/api/ondevai/savings/goals/delete' \
  "$(jq -cn --arg owner "${user_a}" --arg id "${goal_delete}" '{owner:$owner,id:$id}')" "${token_a}" "${response}")"
expect_status 204 "${status}" 'eliminar goal e movimentos'
status="$(api_request GET "/api/collections/savings_transactions/records/miiiiiiiiiiiiii" '' "${token_a}" "${response}")"
expect_status 404 "${status}" 'movimento foi eliminado com o goal'

body="$(jq -cn --arg owner "${user_b}" --argjson goal "$(goal_payload "${user_b}" "${goal_b}" 0)" '{owner:$owner,goal:$goal}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_b}" "${response}")"
expect_status 200 "${status}" 'criar goal do utilizador B'
status="$(api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" 'mjjjjjjjjjjjjjj' "${goal_b}" deposit 1)" "${token_a}" "${response}")"
expect_status 404 "${status}" 'utilizador A nao opera goal de B'

direct_goal="$(jq -cn --arg owner "${user_a}" '{id:"gkkkkkkkkkkkkkk",owner:$owner,name:"Direto",kind:"general",targetAmountCents:100,currentAmountCents:0,monthlyContributionCents:0}')"
status="$(api_request POST '/api/collections/savings_goals/records' "${direct_goal}" "${token_a}" "${response}")"
expect_rejection "${status}" 'create financeiro direto bloqueado'
status="$(api_request PATCH "/api/collections/savings_goals/records/${goal_main}" '{"name":"Direto"}' "${token_a}" "${response}")"
expect_rejection "${status}" 'update financeiro direto bloqueado'
status="$(api_request DELETE "/api/collections/savings_goals/records/${goal_main}" '' "${token_a}" "${response}")"
expect_rejection "${status}" 'delete financeiro direto bloqueado'

direct_transaction="$(jq -cn --arg owner "${user_a}" --arg goal "${goal_main}" \
  '{id:"mmmmmmmmmmmmmmm",owner:$owner,goal:$goal,type:"deposit",amountCents:1,effectiveDate:"2026-09-25"}')"
status="$(api_request POST '/api/collections/savings_transactions/records' "${direct_transaction}" "${token_a}" "${response}")"
expect_rejection "${status}" 'create direto de movimento bloqueado'
status="$(api_request PATCH "/api/collections/savings_transactions/records/${opening_main}" '{"note":"Direto"}' "${token_a}" "${response}")"
expect_rejection "${status}" 'update direto de movimento bloqueado'
status="$(api_request DELETE "/api/collections/savings_transactions/records/${opening_main}" '' "${token_a}" "${response}")"
expect_rejection "${status}" 'delete direto de movimento bloqueado'

admin_goal="$(jq -cn --arg owner "${user_a}" '{id:"gllllllllllllll",owner:$owner,name:"Admin",kind:"general",targetAmountCents:100,currentAmountCents:0,monthlyContributionCents:0}')"
status="$(api_request POST '/api/collections/savings_goals/records' "${admin_goal}" "${admin_token}" "${response}")"
expect_status 200 "${status}" 'superutilizador mantem administracao legitima'

rollback_opening="$(jq -cn --arg id "${deposit_main}" --arg owner "${user_a}" --arg goal "${goal_rollback}" \
  '{id:$id,owner:$owner,goal:$goal,type:"opening",amountCents:50,effectiveDate:"2026-09-25"}')"
body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" "${goal_rollback}" 50)" --argjson opening "${rollback_opening}" \
  '{owner:$owner,goal:$goal,opening:$opening}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'segunda escrita falha e provoca rollback'
status="$(api_request GET "/api/collections/savings_goals/records/${goal_rollback}" '' "${token_a}" "${response}")"
expect_status 404 "${status}" 'goal da transacao falhada nao ficou persistido'

body="$(jq -cn --arg owner "${user_a}" --argjson goal "$(goal_payload "${user_a}" "${goal_concurrent}" 0)" '{owner:$owner,goal:$goal}')"
status="$(api_request POST '/api/ondevai/savings/goals/create' "${body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar goal para concorrencia'

concurrent_one="${TEMP_DIR}/concurrent-one.json"
concurrent_two="${TEMP_DIR}/concurrent-two.json"
status_one="${TEMP_DIR}/concurrent-one.status"
status_two="${TEMP_DIR}/concurrent-two.status"
api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" 'mkkkkkkkkkkkkkk' "${goal_concurrent}" deposit 100)" "${token_a}" "${concurrent_one}" >"${status_one}" &
pid_one="$!"
api_request POST '/api/ondevai/savings/transactions/create' \
  "$(transaction_body "${user_a}" 'mllllllllllllll' "${goal_concurrent}" deposit 200)" "${token_a}" "${concurrent_two}" >"${status_two}" &
pid_two="$!"
wait "${pid_one}"
wait "${pid_two}"
expect_status 200 "$(cat "${status_one}")" 'primeira escrita concorrente'
expect_status 200 "$(cat "${status_two}")" 'segunda escrita concorrente'
status="$(api_request GET "/api/collections/savings_goals/records/${goal_concurrent}" '' "${token_a}" "${response}")"
expect_status 200 "${status}" 'ler goal depois da concorrencia'
[[ "$(json_value "${response}" '.currentAmountCents')" == '300' ]] || fail 'concorrencia perdeu uma atualizacao de saldo'

budget_a='baaaaaaaaaaaaaa'
budget_a2='bbbbbbbbbbbbbbb'
budgets_body="$(jq -cn --arg owner "${user_a}" --arg first "${budget_a}" --arg second "${budget_a2}" --arg cat1 "${category_a}" --arg cat2 "${category_a2}" \
  '{owner:$owner,budgets:[
    {id:$first,owner:$owner,month:"2026-09",category:$cat1,amountCents:10000},
    {id:$second,owner:$owner,month:"2026-09",category:$cat2,amountCents:20000}
  ]}')"
status="$(api_request POST '/api/ondevai/budgets/bulk-upsert' "${budgets_body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'bulk de orcamentos integral'
[[ "$(json_value "${response}" 'length')" == '2' ]] || fail 'bulk de orcamentos nao devolveu dois records'

failed_budgets="$(jq -cn --arg owner "${user_a}" --arg first "${budget_a}" --arg cat1 "${category_a}" --arg foreign "${category_b}" \
  '{owner:$owner,budgets:[
    {id:$first,owner:$owner,month:"2026-09",category:$cat1,amountCents:99999},
    {id:"bcccccccccccccc",owner:$owner,month:"2026-10",category:$foreign,amountCents:100}
  ]}')"
status="$(api_request POST '/api/ondevai/budgets/bulk-upsert' "${failed_budgets}" "${token_a}" "${response}")"
expect_status 400 "${status}" 'falha integral do bulk de orcamentos'
status="$(api_request GET "/api/collections/monthly_budgets/records/${budget_a}" '' "${token_a}" "${response}")"
expect_status 200 "${status}" 'orcamento permanece legivel depois do rollback'
[[ "$(json_value "${response}" '.amountCents')" == '10000' ]] || fail 'bulk de orcamentos deixou alteracao parcial'

expense_series='eaaaaaaaaaaaaaa'
exception_one='xaaaaaaaaaaaaaa'
exception_two='xbbbbbbbbbbbbbb'
expense_body="$(jq -cn --arg id "${expense_series}" --arg owner "${user_a}" --arg category "${category_a}" \
  '{id:$id,owner:$owner,date:"2026-09-25",amountCents:100,category:$category,recurrence:{frequency:"monthly",interval:1,startDate:"2026-09-25",status:"active"}}')"
status="$(api_request POST '/api/collections/expenses/records' "${expense_body}" "${token_a}" "${response}")"
expect_status 200 "${status}" 'criar serie de despesa'
for exception_spec in "${exception_one}:2026-10-25" "${exception_two}:2026-11-25"; do
  exception_id="${exception_spec%%:*}"
  exception_date="${exception_spec##*:}"
  exception_body="$(jq -cn --arg id "${exception_id}" --arg owner "${user_a}" --arg series "${expense_series}" --arg date "${exception_date}" \
    '{id:$id,owner:$owner,seriesType:"expense",seriesId:$series,occurrenceDate:$date,action:"skip"}')"
  status="$(api_request POST '/api/collections/recurrence_exceptions/records' "${exception_body}" "${token_a}" "${response}")"
  expect_status 200 "${status}" 'criar excecao de recorrencia'
done
status="$(api_request POST '/api/ondevai/series/delete' \
  "$(jq -cn --arg id "${expense_series}" '{seriesType:"expense",seriesId:$id}')" "${token_a}" "${response}")"
expect_status 204 "${status}" 'eliminar serie e excecoes'
for deleted in "${expense_series}:expenses" "${exception_one}:recurrence_exceptions" "${exception_two}:recurrence_exceptions"; do
  deleted_id="${deleted%%:*}"
  deleted_collection="${deleted##*:}"
  status="$(api_request GET "/api/collections/${deleted_collection}/records/${deleted_id}" '' "${token_a}" "${response}")"
  expect_status 404 "${status}" "${deleted_collection} eliminado atomicamente"
done

printf 'OK: endpoints, isolamento, concorrencia, rollback, bulks, series e bloqueio da Records API validados.\n'

kill "${SERVER_PID}"
wait "${SERVER_PID}" || true
SERVER_PID=""

# Retirar primeiro a migration operacional da Onda 3; o rollback verificado
# abaixo pertence à migration da Onda 2 que bloqueia escritas financeiras.
printf 'y\n' | "${PB_BIN}" migrate down 1 \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}"

wave3_remaining="$(sqlite3 "${DATA_DIR}/data.db" \
  "SELECT count(*) FROM _collections WHERE name = 'data_imports';")"
[[ "${wave3_remaining}" == '0' ]] || fail 'rollback da Onda 3 nao removeu data_imports'

printf 'y\n' | "${PB_BIN}" migrate down 1 \
  --dir "${DATA_DIR}" \
  --migrationsDir "${PROJECT_DIR}/pb_migrations" \
  --hooksDir "${HOOKS_DIR}"

expected_create_rule='@request.auth.id != "" && @request.auth.verified = true && @request.body.owner = @request.auth.id'
for collection in savings_goals savings_transactions; do
  restored="$(sqlite3 "${DATA_DIR}/data.db" "SELECT createRule FROM _collections WHERE name='${collection}';")"
  [[ "${restored}" == "${expected_create_rule}" ]] || fail "rollback nao repos createRule de ${collection}"
done

printf 'OK: rollback da migration repoe as rules financeiras anteriores.\n'
