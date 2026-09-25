'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const account = require('../../pb_hooks/account/delete.js')
const fingerprint = require('../../pb_hooks/data/fingerprint.js')
const operations = require('../../pb_hooks/data/operations.js')
const validation = require('../../pb_hooks/data/validation.js')

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
  internalServerError(message) {
    return apiError(500, message)
  },
}

function validBackup() {
  const timestamp = '2026-09-25T10:00:00.000Z'
  return {
    schemaVersion: 4,
    exportedAt: '2026-09-25T11:00:00.000Z',
    settings: {
      currency: 'EUR',
      locale: 'pt-PT',
      onboardingCompleted: true,
      lastExportAt: timestamp,
      changesSinceExport: 0,
    },
    categories: [
      {
        id: 'food',
        name: 'Alimentacao',
        color: '#123ABC',
        icon: '',
        order: 0,
        archived: false,
        subcategories: [
          { id: '5304f412-0e39-4ec6-9512-a091c2889667', name: 'Mercado', archived: false },
        ],
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Lazer',
        color: '#445566',
        order: 1,
        archived: false,
        subcategories: [],
      },
    ],
    expenses: [
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        date: '2026-09-25',
        amountCents: 1250,
        categoryId: 'food',
        subcategoryId: '5304f412-0e39-4ec6-9512-a091c2889667',
        description: 'Compras',
        recurrence: {
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-09-25',
          status: 'active',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    monthlyIncomes: [
      {
        id: 'income-static-id',
        name: 'Salario',
        kind: 'salary',
        amountCents: 150000,
        date: '2026-09-01',
        recurrence: {
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-09-01',
          status: 'active',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    savingsGoals: [
      {
        id: 'goal-uuid-legacy',
        name: 'Reserva',
        kind: 'reserve',
        targetAmountCents: 100000,
        currentAmountCents: 800,
        monthlyContributionCents: 100,
        targetDate: '2027-02-28',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    savingsTransactions: [
      {
        id: 'movement-opening',
        goalId: 'goal-uuid-legacy',
        type: 'opening',
        amountCents: 1000,
        effectiveDate: '2026-09-01',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: timestamp,
      },
      {
        id: 'movement-withdrawal',
        goalId: 'goal-uuid-legacy',
        type: 'withdrawal',
        amountCents: 200,
        effectiveDate: '2026-09-02',
        note: 'Ajuste',
        createdAt: '2026-09-02T10:00:00.000Z',
        updatedAt: timestamp,
      },
    ],
    monthlyBudgets: [
      {
        id: 'budget-legacy',
        month: '2026-09',
        categoryId: 'food',
        amountCents: 30000,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    recurrenceExceptions: [
      {
        id: 'exception-legacy',
        seriesType: 'expense',
        seriesId: '550e8400-e29b-41d4-a716-446655440002',
        occurrenceDate: '2026-10-25',
        action: 'override',
        changes: {
          categoryId: '550e8400-e29b-41d4-a716-446655440001',
          amountCents: 1700,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

function rejects(mutator, pattern) {
  const backup = validBackup()
  mutator(backup)
  assert.throws(() => validation.validateBackup(event, backup), pattern)
}

const backup = validBackup()
const normalized = validation.validateBackup(event, backup)
assert.deepEqual(normalized, backup)

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex')
const hash = fingerprint.calculateBackupFingerprint(normalized, sha256)
assert.match(hash, /^[0-9a-f]{64}$/)
const changedExport = structuredClone(normalized)
changedExport.exportedAt = '2027-01-01T00:00:00.000Z'
assert.equal(fingerprint.calculateBackupFingerprint(changedExport, sha256), hash)
const reordered = { ...normalized, settings: { ...normalized.settings } }
assert.equal(fingerprint.calculateBackupFingerprint(reordered, sha256), hash)

const request = validation.validateImportRequest(event, {
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
  snapshotHash: hash,
  backup,
})
assert.equal(request.mode, 'migrate-empty')
assert.equal(request.counts.savingsTransactions, 2)

rejects((item) => { item.expenses[0].date = '2026-02-30' }, /invalida/)
rejects((item) => { item.expenses[0].createdAt = 'September 25, 2026' }, /invalido/)
rejects((item) => { item.expenses[0].createdAt = '2026-02-30T10:00:00.000Z' }, /invalida/)
rejects((item) => { item.expenses[0].id = item.expenses[0].id; item.expenses.push({ ...item.expenses[0] }) }, /repetido/)
rejects((item) => { item.expenses[0].categoryId = 'missing' }, /inexistente/)
rejects((item) => { item.savingsGoals[0].currentAmountCents = 801 }, /saldo guardado/)
rejects((item) => {
  item.savingsTransactions[0].type = 'withdrawal'
  item.savingsGoals[0].currentAmountCents = 0
}, /saldo invalido/)
rejects((item) => { item.monthlyBudgets.push({ ...item.monthlyBudgets[0], id: 'budget-2' }) }, /mais do que um orcamento/)
rejects((item) => {
  item.recurrenceExceptions.push({ ...item.recurrenceExceptions[0], id: 'exception-2' })
}, /mais do que uma excecao/)
rejects((item) => { item.recurrenceExceptions[0].changes.categoryId = 'missing' }, /inexistente/)

const ids = [
  'aaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbb',
  'ccccccccccccccc',
  'ddddddddddddddd',
  'eeeeeeeeeeeeeee',
  'fffffffffffffff',
  'ggggggggggggggg',
  'hhhhhhhhhhhhhhh',
  'iiiiiiiiiiiiiii',
  'jjjjjjjjjjjjjjj',
]
let nextId = 0
const maps = operations.createIdMaps(
  event,
  {
    findRecordsByFilter() {
      return []
    },
  },
  normalized,
  () => ids[nextId++],
)
assert.equal(maps.categories.food, 'aaaaaaaaaaaaaaa')
assert.equal(maps.expenses['550e8400-e29b-41d4-a716-446655440002'], 'ccccccccccccccc')
assert.notEqual(maps.categories.food, 'food')
assert.deepEqual(
  operations.rewrittenChanges(normalized.recurrenceExceptions[0].changes, maps),
  { categoryId: 'bbbbbbbbbbbbbbb', amountCents: 1700 },
)

assert.deepEqual(
  account.validateRequest(event, {
    password: 'password-atual',
    confirmation: account.CONFIRMATION,
  }),
  { password: 'password-atual' },
)
assert.throws(
  () => account.validateRequest(event, {
    password: 'password-atual',
    confirmation: account.CONFIRMATION,
    userId: 'outro',
  }),
  /invalido/,
)
assert.throws(
  () => account.validateRequest(event, {
    password: 'password-atual',
    confirmation: 'apagar conta',
  }),
  /confirmacao/,
)

console.log('OK: validacao schema 4, fingerprint, ledger, remapeamento e conta validados.')
