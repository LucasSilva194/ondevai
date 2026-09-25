'use strict'

const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fingerprint = require('../../pb_hooks/data/fingerprint.js')
const validation = require('../../pb_hooks/data/validation.js')
const fixtures = require('./fixtures.js')

function apiError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const event = {
  badRequestError(message) {
    return apiError(400, message)
  },
  error(status, message) {
    return apiError(status, message)
  },
}

function expectRejected(label, mutate, pattern) {
  const backup = fixtures.createBackup('a')
  mutate(backup)
  assert.throws(() => validation.validateBackup(event, backup), pattern, label)
}

const backup = fixtures.createBackup('a')
const normalized = validation.validateBackup(event, backup)
assert.deepEqual(validation.calculateCounts(normalized), {
  categories: 2,
  expenses: 1,
  monthlyIncomes: 1,
  savingsGoals: 1,
  savingsTransactions: 3,
  monthlyBudgets: 1,
  recurrenceExceptions: 1,
})
assert.equal(normalized.expenses[0].categoryId, 'legacy-category-a')
assert.equal(normalized.expenses[0].subcategoryId, 'legacy-sub-a')
assert.equal(normalized.recurrenceExceptions[0].changes.categoryId, 'cat00000000000a')
assert.equal(normalized.savingsGoals[0].currentAmountCents, 10500)

const backendHash = fingerprint.calculateBackupFingerprint(normalized, (text) => (
  createHash('sha256').update(text, 'utf8').digest('hex')
))
assert.equal(backendHash, fixtures.fingerprint(normalized))
const anotherExport = { ...normalized, exportedAt: '2030-01-01T00:00:00.000Z' }
assert.equal(
  fingerprint.deterministicBackupRepresentation(normalized),
  fingerprint.deterministicBackupRepresentation(anotherExport),
)

const defaultMode = validation.validateImportRequest(event, {
  idempotencyKey: 'retry-key-a',
  snapshotHash: backendHash,
  backup,
})
assert.equal(defaultMode.mode, 'migrate-empty')

expectRejected('data impossível', (value) => { value.expenses[0].date = '2026-02-30' }, /data/i)
expectRejected('dinheiro fracionário', (value) => { value.expenses[0].amountCents = 10.5 }, /valor/i)
expectRejected('dinheiro inseguro', (value) => {
  value.expenses[0].amountCents = Number.MAX_SAFE_INTEGER + 1
}, /valor/i)
expectRejected('ID duplicado', (value) => {
  value.expenses.push(structuredClone(value.expenses[0]))
}, /repetido/i)
expectRejected('relação de categoria forjada', (value) => {
  value.expenses[0].categoryId = 'other-owner-category'
}, /categoria inexistente/i)
expectRejected('relação de goal forjada', (value) => {
  value.savingsTransactions[0].goalId = 'other-owner-goal'
}, /objetivo inexistente/i)
expectRejected('changes.categoryId forjado', (value) => {
  value.recurrenceExceptions[0].changes.categoryId = 'other-owner-category'
}, /categoria inexistente/i)
expectRejected('orçamento duplicado', (value) => {
  value.monthlyBudgets.push({ ...structuredClone(value.monthlyBudgets[0]), id: 'other-budget' })
}, /mais do que um orcamento/i)
expectRejected('exceção duplicada', (value) => {
  value.recurrenceExceptions.push({
    ...structuredClone(value.recurrenceExceptions[0]),
    id: 'other-exception',
  })
}, /mais do que uma excecao/i)
expectRejected('ledger final inconsistente', (value) => {
  value.savingsGoals[0].currentAmountCents += 1
}, /nao corresponde/i)
expectRejected('ledger fica negativo', (value) => {
  value.savingsTransactions[0].type = 'withdrawal'
  value.savingsTransactions[0].amountCents = 1
  value.savingsTransactions[1].amountCents = 10501
}, /saldo invalido/i)
expectRejected('duas aberturas', (value) => {
  value.savingsTransactions[1].type = 'opening'
}, /abertura invalida/i)
expectRejected('recorrência profunda/desconhecida', (value) => {
  let nested = {}
  for (let index = 0; index < 80; index += 1) nested = { child: nested }
  value.expenses[0].recurrence.extra = nested
}, /campos desconhecidos/i)

const oversized = fixtures.importRequest(fixtures.createBackup('large'), 'replace')
oversized.backup.expenses[0].description = 'x'.repeat(validation.MAX_REQUEST_BYTES)
assert.throws(
  () => validation.validateImportRequest(event, oversized),
  (error) => error.status === 413,
  'payload superior a 20 MiB deve ser rejeitado com 413',
)

console.log('OK: validadores, fingerprint, relações, ledger, limites e payload v4 validados sem PocketBase.')
