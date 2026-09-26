'use strict'

const assert = require('node:assert/strict')
const tx = require('../../pb_hooks/transactions/common.js')

function apiError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const event = {
  badRequestError(message) {
    return apiError(400, message)
  },
  forbiddenError(message) {
    return apiError(403, message)
  },
}

const owner = 'user00000000001'
const goal = tx.assertGoal(
  event,
  {
    id: 'goal00000000001',
    owner,
    name: ' Reserva ',
    kind: 'reserve',
    targetAmountCents: 100000,
    currentAmountCents: 1000,
    monthlyContributionCents: 100,
    targetDate: '2027-01-01',
  },
  owner,
)
assert.equal(goal.name, 'Reserva')
assert.equal(goal.currentAmountCents, 1000)

const deposit = tx.assertTransaction(
  event,
  {
    id: 'move00000000001',
    owner,
    goal: goal.id,
    type: 'deposit',
    amountCents: 500,
    effectiveDate: '2026-09-25',
  },
  owner,
)
assert.equal(tx.signedAmount(deposit), 500)
assert.equal(tx.signedAmount({ type: 'withdrawal', amountCents: 200 }), -200)

const category = tx.assertCategory(
  event,
  {
    id: 'cate00000000001',
    owner,
    name: 'Casa',
    color: '#123ABC',
    order: 0,
    archived: false,
    subcategories: [{ id: 'legacy-uuid', name: 'Renda', archived: false }],
  },
  owner,
)
assert.equal(category.subcategories[0].id, 'legacy-uuid')

const budget = tx.assertBudget(
  event,
  {
    id: 'budg00000000001',
    owner,
    month: '2026-09',
    category: category.id,
    amountCents: 25000,
  },
  owner,
)
assert.equal(budget.month, '2026-09')

assert.throws(
  () => tx.assertRecordId(event, 'uuid-is-not-a-pocketbase-id', 'ID'),
  /invalido/,
)
assert.throws(
  () => tx.assertGoal(event, { ...goal, currentAmountCents: -1 }, owner),
  /Saldo/,
)
assert.throws(
  () => tx.assertTransaction(event, { ...deposit, amountCents: 1.5 }, owner),
  /Valor/,
)
assert.throws(
  () => tx.assertCategory(event, { ...category, color: 'blue' }, owner),
  /Cor/,
)
assert.throws(
  () => tx.assertBudget(event, { ...budget, owner: 'other0000000001' }, owner),
  /autorizada/,
)

console.log('OK: validadores transacionais e calculo de saldo validados.')
