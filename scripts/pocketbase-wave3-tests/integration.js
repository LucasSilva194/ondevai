'use strict'

const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createBackup, importRequest } = require('./fixtures.js')

const baseUrl = process.env.PB_TEST_URL || 'http://127.0.0.1:18094'
const adminEmail = process.env.PB_TEST_ADMIN_EMAIL || 'wave3-test-admin@example.invalid'
const adminPassword = process.env.PB_TEST_ADMIN_PASSWORD || 'wave3-test-admin-password-12345'
const userPassword = 'wave3-user-password-12345'

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = token
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, text, json }
}

function expectStatus(result, expected, label) {
  const accepted = Array.isArray(expected) ? expected : [expected]
  assert.ok(
    accepted.includes(result.status),
    `${label}: HTTP ${result.status}, esperado ${accepted.join('/')}\n${result.text}`,
  )
}

function assertSafeError(result, label) {
  const lower = result.text.toLowerCase()
  for (const forbidden of ['sqlite', 'sql:', 'stack', 'runtime error', 'authorization:', 'token=']) {
    assert.ok(!lower.includes(forbidden), `${label}: erro expõe detalhe interno (${forbidden})`)
  }
}

async function adminLogin() {
  const result = await request('POST', '/api/collections/_superusers/auth-with-password', {
    identity: adminEmail,
    password: adminPassword,
  })
  expectStatus(result, 200, 'login de superutilizador descartável')
  return result.json.token
}

async function createUser(adminToken, suffix, verified = true) {
  const email = `wave3-${suffix}-${Date.now()}@example.invalid`
  const created = await request('POST', '/api/collections/users/records', {
    email,
    password: userPassword,
    passwordConfirm: userPassword,
  })
  expectStatus(created, 200, `registo ${suffix}`)
  if (verified) {
    const updated = await request(
      'PATCH',
      `/api/collections/users/records/${created.json.id}`,
      { verified: true },
      adminToken,
    )
    expectStatus(updated, 200, `verificação ${suffix}`)
  }
  return { id: created.json.id, email, token: verified ? await userLogin(email) : null }
}

async function userLogin(email) {
  const result = await request('POST', '/api/collections/users/auth-with-password', {
    identity: email,
    password: userPassword,
  })
  expectStatus(result, 200, `login ${email}`)
  return result.json.token
}

async function impersonate(adminToken, userId) {
  const result = await request(
    'POST',
    `/api/collections/users/impersonate/${userId}`,
    { duration: 300 },
    adminToken,
  )
  expectStatus(result, 200, 'impersonação de utilizador não verificado')
  return result.json.token
}

async function listOwned(collection, owner, token) {
  const filter = encodeURIComponent(`owner = "${owner}"`)
  const result = await request('GET', `/api/collections/${collection}/records?perPage=500&filter=${filter}`, undefined, token)
  expectStatus(result, 200, `listar ${collection}`)
  return result.json.items
}

async function adminRecord(collection, id, token) {
  return request('GET', `/api/collections/${collection}/records/${id}`, undefined, token)
}

async function readSseEvent(reader, state, timeoutMs = 5000) {
  while (true) {
    const boundary = state.buffer.indexOf('\n\n')
    if (boundary >= 0) {
      const frame = state.buffer.slice(0, boundary)
      state.buffer = state.buffer.slice(boundary + 2)
      const event = { id: '', name: 'message', data: '' }
      for (const line of frame.split('\n')) {
        if (line.startsWith('id:')) event.id = line.slice(3).trim()
        else if (line.startsWith('event:')) event.name = line.slice(6).trim()
        else if (line.startsWith('data:')) event.data += line.slice(5).trim()
      }
      if (event.id || event.data) return event
      continue
    }
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout à espera de evento realtime')), timeoutMs)
    })
    const chunk = await Promise.race([reader.read(), timeout])
    if (chunk.done) throw new Error('stream realtime terminou inesperadamente')
    state.buffer += state.decoder.decode(chunk.value, { stream: true }).replaceAll('\r\n', '\n')
  }
}

async function openRealtime(token) {
  const controller = new AbortController()
  const response = await fetch(`${baseUrl}/api/realtime`, {
    headers: { Authorization: token },
    signal: controller.signal,
  })
  assert.equal(response.status, 200, 'ligação SSE realtime')
  assert.ok(response.body, 'resposta SSE sem stream')
  const reader = response.body.getReader()
  const state = { buffer: '', decoder: new TextDecoder() }
  const connected = await readSseEvent(reader, state)
  assert.equal(connected.name, 'PB_CONNECT')
  assert.ok(connected.id, 'PB_CONNECT sem clientId')
  const subscribed = await request('POST', '/api/realtime', {
    clientId: connected.id,
    subscriptions: ['categories/*'],
  }, token)
  expectStatus(subscribed, 204, 'subscrição realtime do segundo cliente')
  return {
    async nextCategoryEvent() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const event = await readSseEvent(reader, state)
        if (event.name === 'categories/*') return JSON.parse(event.data)
      }
      throw new Error('evento de categoria não recebido')
    },
    close() {
      controller.abort()
    },
  }
}

async function assertOwnerCounts(user, expected) {
  const mapping = {
    categories: 'categories',
    expenses: 'expenses',
    monthlyIncomes: 'monthly_incomes',
    savingsGoals: 'savings_goals',
    savingsTransactions: 'savings_transactions',
    monthlyBudgets: 'monthly_budgets',
    recurrenceExceptions: 'recurrence_exceptions',
  }
  for (const [countName, collection] of Object.entries(mapping)) {
    const items = await listOwned(collection, user.id, user.token)
    assert.equal(items.length, expected[countName], `${collection}: contagem inesperada`)
  }
}

async function main() {
  const adminToken = await adminLogin()
  const userA = await createUser(adminToken, 'a')
  const userB = await createUser(adminToken, 'b')
  const userC = await createUser(adminToken, 'c')
  const userD = await createUser(adminToken, 'd')
  const unverified = await createUser(adminToken, 'unverified', false)

  const backupA = createBackup('a')
  const requestA = importRequest(backupA, 'migrate-empty')

  for (const [path, body] of [
    ['/api/ondevai/data/replace-all', requestA],
    ['/api/ondevai/data/clear-all', {}],
    ['/api/ondevai/account/delete', { password: userPassword, confirmation: 'APAGAR CONTA' }],
  ]) {
    const result = await request('POST', path, body)
    expectStatus(result, [401, 403], `${path} sem autenticação`)
    assertSafeError(result, `${path} sem autenticação`)
  }

  const invalidToken = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    requestA,
    'token-invalido',
  )
  expectStatus(invalidToken, [401, 403], 'token inválido')
  assertSafeError(invalidToken, 'token inválido')

  const superuserRejected = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    requestA,
    adminToken,
  )
  expectStatus(superuserRejected, [401, 403], 'superutilizador na rota pública')
  assertSafeError(superuserRejected, 'superutilizador na rota pública')

  const unverifiedToken = await impersonate(adminToken, unverified.id)
  const unverifiedImport = await request('POST', '/api/ondevai/data/replace-all', requestA, unverifiedToken)
  expectStatus(unverifiedImport, 403, 'email não confirmado')
  assertSafeError(unverifiedImport, 'email não confirmado')

  const imported = await request('POST', '/api/ondevai/data/replace-all', requestA, userA.token)
  expectStatus(imported, 200, 'importação v4 completa')
  assert.equal(imported.json.status, 'imported')
  assert.deepEqual(imported.json.counts, {
    categories: 2,
    expenses: 1,
    monthlyIncomes: 1,
    savingsGoals: 1,
    savingsTransactions: 3,
    monthlyBudgets: 1,
    recurrenceExceptions: 1,
  })
  await assertOwnerCounts(userA, imported.json.counts)

  const categoriesA = await listOwned('categories', userA.id, userA.token)
  const expensesA = await listOwned('expenses', userA.id, userA.token)
  const goalsA = await listOwned('savings_goals', userA.id, userA.token)
  const movementsA = await listOwned('savings_transactions', userA.id, userA.token)
  const budgetsA = await listOwned('monthly_budgets', userA.id, userA.token)
  const exceptionsA = await listOwned('recurrence_exceptions', userA.id, userA.token)
  const settingsA = await listOwned('user_settings', userA.id, userA.token)
  const categoryByName = new Map(categoriesA.map((item) => [item.name, item]))
  const mappedPrimary = categoryByName.get('Alimentação a')
  const mappedSecondary = categoryByName.get('Casa a')
  assert.match(mappedPrimary.id, /^[a-z0-9]{15}$/)
  assert.notEqual(mappedPrimary.id, backupA.categories[0].id)
  assert.equal(expensesA[0].category, mappedPrimary.id)
  assert.equal(expensesA[0].subcategoryId, 'legacy-sub-a')
  assert.equal(budgetsA[0].category, mappedPrimary.id)
  assert.match(goalsA[0].id, /^[a-z0-9]{15}$/)
  assert.notEqual(goalsA[0].id, backupA.savingsGoals[0].id)
  assert.ok(movementsA.every((item) => item.goal === goalsA[0].id))
  assert.equal(exceptionsA[0].seriesId, expensesA[0].id)
  assert.equal(exceptionsA[0].changes.categoryId, mappedSecondary.id)
  assert.equal(goalsA[0].currentAmountCents, 10500)
  assert.equal(settingsA[0].onboardingCompleted, true)
  assert.match(settingsA[0].lastExportAt, /^2026-09-24/)

  const hiddenMetadata = await request(
    'GET',
    '/api/collections/data_imports/records?perPage=10',
    undefined,
    userA.token,
  )
  expectStatus(hiddenMetadata, [403, 404], 'metadata operacional bloqueada ao cliente')

  const retry = await request('POST', '/api/ondevai/data/replace-all', requestA, userA.token)
  expectStatus(retry, 200, 'retry sequencial')
  assert.equal(retry.json.status, 'already_imported')
  assert.deepEqual(retry.json.counts, imported.json.counts)
  await assertOwnerCounts(userA, imported.json.counts)

  const keyConflictBackup = createBackup('a')
  keyConflictBackup.expenses[0].amountCents += 1
  const keyConflict = importRequest(keyConflictBackup, 'migrate-empty', requestA.idempotencyKey)
  const conflict = await request('POST', '/api/ondevai/data/replace-all', keyConflict, userA.token)
  expectStatus(conflict, [400, 409], 'mesma key com hash diferente')
  assertSafeError(conflict, 'conflito de idempotência')

  const invalidCases = [
    ['data impossível', (backup) => { backup.expenses[0].date = '2026-02-30' }],
    ['ID duplicado', (backup) => { backup.expenses.push(structuredClone(backup.expenses[0])) }],
    ['relação forjada', (backup) => { backup.expenses[0].categoryId = 'category-from-user-b' }],
    ['changes.categoryId forjado', (backup) => { backup.recurrenceExceptions[0].changes.categoryId = 'category-from-user-b' }],
    ['ledger inconsistente', (backup) => { backup.savingsGoals[0].currentAmountCents = 1 }],
    ['ledger temporariamente negativo', (backup) => {
      backup.savingsTransactions[0] = { ...backup.savingsTransactions[0], type: 'withdrawal', amountCents: 1 }
      backup.savingsTransactions[1] = { ...backup.savingsTransactions[1], type: 'deposit', amountCents: 10501 }
    }],
    ['orçamento duplicado', (backup) => {
      backup.monthlyBudgets.push({ ...structuredClone(backup.monthlyBudgets[0]), id: 'other-budget-id' })
    }],
    ['exceção duplicada', (backup) => {
      backup.recurrenceExceptions.push({ ...structuredClone(backup.recurrenceExceptions[0]), id: 'other-exception-id' })
    }],
  ]
  for (const [label, mutate] of invalidCases) {
    const invalidBackup = createBackup('a')
    mutate(invalidBackup)
    const invalid = await request(
      'POST',
      '/api/ondevai/data/replace-all',
      importRequest(invalidBackup, 'replace'),
      userA.token,
    )
    expectStatus(invalid, [400, 409, 413], label)
    assertSafeError(invalid, label)
    await assertOwnerCounts(userA, imported.json.counts)
  }

  const wrongHash = { ...importRequest(createBackup('a'), 'replace'), snapshotHash: '0'.repeat(64) }
  const hashRejected = await request('POST', '/api/ondevai/data/replace-all', wrongHash, userA.token)
  expectStatus(hashRejected, 400, 'hash incorreto')
  await assertOwnerCounts(userA, imported.json.counts)

  const accountNotEmpty = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    importRequest(createBackup('new'), 'migrate-empty'),
    userA.token,
  )
  expectStatus(accountNotEmpty, [400, 409], 'migrate-empty em conta não vazia')

  const backupB = createBackup('b')
  const importB = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    importRequest(backupB, 'migrate-empty'),
    userB.token,
  )
  expectStatus(importB, 200, 'importação B')
  await assertOwnerCounts(userB, importB.json.counts)

  const realtimeClientB = await openRealtime(userB.token)
  const realtimeEventPromise = realtimeClientB.nextCategoryEvent()
  const realtimeReplace = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    importRequest(createBackup('br'), 'replace'),
    userB.token,
  )
  expectStatus(realtimeReplace, 200, 'replace observado pelo segundo cliente realtime')
  const realtimeEvent = await realtimeEventPromise
  assert.ok(['create', 'update', 'delete'].includes(realtimeEvent.action))
  assert.equal(realtimeEvent.record.owner, userB.id)
  realtimeClientB.close()
  await assertOwnerCounts(userB, realtimeReplace.json.counts)

  const backupC = createBackup('c')
  const concurrentBody = importRequest(backupC, 'migrate-empty')
  const concurrentResults = await Promise.all([
    request('POST', '/api/ondevai/data/replace-all', concurrentBody, userC.token),
    request('POST', '/api/ondevai/data/replace-all', concurrentBody, userC.token),
  ])
  concurrentResults.forEach((result) => expectStatus(result, 200, 'retry concorrente'))
  assert.deepEqual(concurrentResults.map((result) => result.json.status).sort(), ['already_imported', 'imported'])
  concurrentResults.forEach((result) => assert.deepEqual(result.json.counts, concurrentResults[0].json.counts))
  await assertOwnerCounts(userC, concurrentResults[0].json.counts)

  const sameHashDifferentKey = {
    ...requestA,
    mode: 'replace',
    idempotencyKey: randomUUID(),
  }
  const replaced = await request('POST', '/api/ondevai/data/replace-all', sameHashDifferentKey, userA.token)
  expectStatus(replaced, 200, 'mesmo hash com key diferente')
  assert.equal(replaced.json.status, 'imported')
  await assertOwnerCounts(userB, realtimeReplace.json.counts)

  const cleared = await request('POST', '/api/ondevai/data/clear-all', { owner: userB.id }, userA.token)
  expectStatus(cleared, 204, 'clear-all deriva owner da sessão')
  await assertOwnerCounts(userA, {
    categories: 0,
    expenses: 0,
    monthlyIncomes: 0,
    savingsGoals: 0,
    savingsTransactions: 0,
    monthlyBudgets: 0,
    recurrenceExceptions: 0,
  })
  await assertOwnerCounts(userB, realtimeReplace.json.counts)

  const retryAfterClear = await request('POST', '/api/ondevai/data/replace-all', requestA, userA.token)
  expectStatus(retryAfterClear, 200, 'retry depois de clear-all')
  assert.equal(retryAfterClear.json.status, 'already_imported')
  assert.equal((await listOwned('categories', userA.id, userA.token)).length, 0)

  const importsA = await listOwned('data_imports', userA.id, adminToken)
  assert.ok(importsA.length >= 2, 'clear-all preserva metadata de idempotência')

  for (const [label, body] of [
    ['password incorreta', { password: 'password-errada', confirmation: 'APAGAR CONTA' }],
    ['confirmação incorreta', { password: userPassword, confirmation: 'apagar conta' }],
  ]) {
    const rejected = await request('POST', '/api/ondevai/account/delete', body, userA.token)
    expectStatus(rejected, [400, 403], label)
    assertSafeError(rejected, label)
  }

  const forgedDelete = await request('POST', '/api/ondevai/account/delete', {
    password: userPassword,
    confirmation: 'APAGAR CONTA',
    userId: userB.id,
  }, userD.token)
  expectStatus(forgedDelete, 400, 'userId forjado é rejeitado')
  assertSafeError(forgedDelete, 'userId forjado')
  expectStatus(await adminRecord('users', userD.id, adminToken), 200, 'conta autenticada D preservada')
  expectStatus(await adminRecord('users', userB.id, adminToken), 200, 'conta B preservada')

  const deleted = await request('POST', '/api/ondevai/account/delete', {
    password: userPassword,
    confirmation: 'APAGAR CONTA',
  }, userA.token)
  expectStatus(deleted, 204, 'eliminação da conta A')
  expectStatus(await adminRecord('users', userA.id, adminToken), 404, 'auth record A eliminado')
  expectStatus(await adminRecord('users', userB.id, adminToken), 200, 'conta B continua intacta')
  const staleToken = await request('POST', '/api/ondevai/data/clear-all', {}, userA.token)
  expectStatus(staleToken, [401, 403], 'token invalidado depois de account/delete')

  const deepBackup = createBackup('deep')
  let nested = {}
  for (let index = 0; index < 80; index += 1) nested = { child: nested }
  deepBackup.expenses[0].recurrence.extra = nested
  const deep = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    importRequest(deepBackup, 'replace'),
    userB.token,
  )
  expectStatus(deep, [400, 413], 'JSON profundo')
  assertSafeError(deep, 'JSON profundo')

  // O limite absoluto de 20 MiB é exercitado sem rede em test-helpers.js.
  // Aqui usamos um campo pequeno mas acima do limite da aplicação para evitar
  // que o limite nativo do servidor termine o processo antes da resposta.
  const oversizedBackup = createBackup('large')
  oversizedBackup.expenses[0].description = 'x'.repeat(141)
  const oversized = await request(
    'POST',
    '/api/ondevai/data/replace-all',
    importRequest(oversizedBackup, 'replace'),
    userB.token,
  )
  expectStatus(oversized, 400, 'campo acima do limite')
  assertSafeError(oversized, 'campo acima do limite')
  await assertOwnerCounts(userB, realtimeReplace.json.counts)

  console.log('OK: integração, segurança, IDs, relações, ledger, idempotência, isolamento, clear-all e account/delete validados.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
