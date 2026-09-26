'use strict'

const { createHash, randomUUID } = require('node:crypto')

const timestamp = '2026-09-25T10:00:00.000Z'

function createBackup(label = 'a') {
  const categoryId = `legacy-category-${label}`
  const secondCategoryId = `cat00000000000${label}`
  const expenseId = `80faec59-30a0-4a3b-90db-96382b746e5${label}`
  const incomeId = `legacy-income-${label}`
  const goalId = `2f9df608-42ac-42a4-bd19-285b9abce77${label}`

  return {
    schemaVersion: 4,
    exportedAt: timestamp,
    settings: {
      currency: 'EUR',
      locale: 'pt-PT',
      onboardingCompleted: true,
      lastExportAt: '2026-09-24T09:00:00.000Z',
      changesSinceExport: 3,
    },
    categories: [
      {
        id: categoryId,
        name: `Alimentação ${label}`,
        color: '#52796F',
        icon: 'basket',
        order: 0,
        archived: false,
        subcategories: [{ id: `legacy-sub-${label}`, name: 'Supermercado', archived: false }],
      },
      {
        id: secondCategoryId,
        name: `Casa ${label}`,
        color: '#112233',
        order: 1,
        archived: false,
        subcategories: [],
      },
    ],
    expenses: [
      {
        id: expenseId,
        date: '2026-09-25',
        amountCents: 1299,
        categoryId,
        subcategoryId: `legacy-sub-${label}`,
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
        id: incomeId,
        name: 'Salário',
        kind: 'salary',
        amountCents: 180000,
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
        id: goalId,
        name: 'Reserva',
        kind: 'reserve',
        targetAmountCents: 500000,
        currentAmountCents: 10500,
        monthlyContributionCents: 10000,
        targetDate: '2027-12-31',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    savingsTransactions: [
      {
        id: `legacy-opening-${label}`,
        goalId,
        type: 'opening',
        amountCents: 10000,
        effectiveDate: '2026-09-01',
        note: 'Saldo inicial',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `legacy-deposit-${label}`,
        goalId,
        type: 'deposit',
        amountCents: 1000,
        effectiveDate: '2026-09-02',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `legacy-withdrawal-${label}`,
        goalId,
        type: 'withdrawal',
        amountCents: 500,
        effectiveDate: '2026-09-03',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    monthlyBudgets: [
      {
        id: `legacy-budget-${label}`,
        month: '2026-09',
        categoryId,
        amountCents: 30000,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    recurrenceExceptions: [
      {
        id: `legacy-exception-${label}`,
        seriesType: 'expense',
        seriesId: expenseId,
        occurrenceDate: '2026-10-25',
        action: 'override',
        changes: {
          date: '2026-10-26',
          amountCents: 1499,
          categoryId: secondCategoryId,
          description: 'Alterada',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(backup) {
  const normalized = { ...backup, exportedAt: '' }
  return createHash('sha256').update(stableStringify(normalized), 'utf8').digest('hex')
}

function importRequest(backup, mode = 'migrate-empty', idempotencyKey = randomUUID()) {
  return {
    mode,
    idempotencyKey,
    snapshotHash: fingerprint(backup),
    backup,
  }
}

module.exports = {
  createBackup,
  fingerprint,
  importRequest,
  stableStringify,
}
