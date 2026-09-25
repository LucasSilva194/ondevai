/*
 * Persistencia transacional da importacao e limpeza da Onda 3.
 *
 * O handler fornece a app transacional e a fonte criptografica de IDs. Todos
 * os IDs do backup sao convertidos, mesmo quando ja parecem IDs PocketBase.
 */

const FINANCIAL_COLLECTIONS = [
  'categories',
  'expenses',
  'monthly_incomes',
  'savings_goals',
  'savings_transactions',
  'monthly_budgets',
  'recurrence_exceptions',
]

const DELETE_ORDER = [
  'recurrence_exceptions',
  'savings_transactions',
  'monthly_budgets',
  'expenses',
  'monthly_incomes',
  'savings_goals',
  'categories',
  'user_settings',
]

function authenticatedOwner(e) {
  if (
    !e.auth ||
    e.hasSuperuserAuth() ||
    e.auth.collection().name !== 'users' ||
    !e.auth.verified()
  ) {
    throw e.forbiddenError('Operacao nao autorizada.', {})
  }
  return e.auth.getString('id')
}

function requestBody(e) {
  const info = e.requestInfo()
  if (!info || !info.body || typeof info.body !== 'object' || Array.isArray(info.body)) {
    throw e.badRequestError('O corpo do pedido e invalido.', {})
  }
  return info.body
}

function runTransaction(e, callback) {
  try {
    let result = null
    e.app.runInTransaction(function (txApp) {
      result = callback(txApp)
    })
    return result
  } catch (error) {
    if (error && typeof error.status === 'number') {
      throw error
    }
    throw e.badRequestError('Nao foi possivel concluir a operacao.', {})
  }
}

function findRecords(app, collection, filter, params, maximum) {
  return app.findRecordsByFilter(collection, filter, '', maximum || 0, 0, params || {})
}

function findImport(app, owner, idempotencyKey) {
  const records = findRecords(
    app,
    'data_imports',
    'owner = {:owner} && idempotencyKey = {:key}',
    { owner: owner, key: idempotencyKey },
    1,
  )
  return records.length === 1 ? records[0] : null
}

function assertIdempotency(e, existing, request) {
  if (!existing) {
    return null
  }
  if (
    existing.getString('snapshotHash') !== request.snapshotHash ||
    existing.getString('mode') !== request.mode
  ) {
    throw e.error(409, 'A chave de idempotencia ja foi usada noutro pedido.', {})
  }
  return {
    status: 'already_imported',
    // JSONField e exposto pelo JSVM como um valor Go e nao como um objeto JS
    // simples em todas as chamadas. As contagens do pedido foram novamente
    // calculadas pelo validador server-side sobre o backup cujo SHA-256 acabou
    // de ser confirmado e, portanto, sao a resposta deterministica correta.
    counts: request.counts,
  }
}

function hasFinancialData(app, owner) {
  for (let i = 0; i < FINANCIAL_COLLECTIONS.length; i++) {
    const records = findRecords(
      app,
      FINANCIAL_COLLECTIONS[i],
      'owner = {:owner}',
      { owner: owner },
      1,
    )
    if (records.length > 0) {
      return true
    }
  }
  return false
}

function deleteOwnedData(app, owner) {
  for (let i = 0; i < DELETE_ORDER.length; i++) {
    const records = findRecords(
      app,
      DELETE_ORDER[i],
      'owner = {:owner}',
      { owner: owner },
      0,
    )
    for (let j = 0; j < records.length; j++) {
      app.delete(records[j])
    }
  }
}

function idExists(app, collection, id) {
  const records = findRecords(app, collection, 'id = {:id}', { id: id }, 1)
  return records.length > 0
}

function generateRecordId(e, app, collection, generated, randomString) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = randomString(15, 'abcdefghijklmnopqrstuvwxyz0123456789')
    if (!generated[id] && !idExists(app, collection, id)) {
      generated[id] = true
      return id
    }
  }
  throw e.internalServerError('Nao foi possivel preparar a importacao.', {})
}

function createIdMap(e, app, collection, records, randomString) {
  const map = {}
  const generated = {}
  for (let i = 0; i < records.length; i++) {
    map[records[i].id] = generateRecordId(
      e,
      app,
      collection,
      generated,
      randomString,
    )
  }
  return map
}

function createIdMaps(e, app, backup, randomString) {
  return {
    categories: createIdMap(e, app, 'categories', backup.categories, randomString),
    expenses: createIdMap(e, app, 'expenses', backup.expenses, randomString),
    monthlyIncomes: createIdMap(
      e,
      app,
      'monthly_incomes',
      backup.monthlyIncomes,
      randomString,
    ),
    savingsGoals: createIdMap(
      e,
      app,
      'savings_goals',
      backup.savingsGoals,
      randomString,
    ),
    savingsTransactions: createIdMap(
      e,
      app,
      'savings_transactions',
      backup.savingsTransactions,
      randomString,
    ),
    monthlyBudgets: createIdMap(
      e,
      app,
      'monthly_budgets',
      backup.monthlyBudgets,
      randomString,
    ),
    recurrenceExceptions: createIdMap(
      e,
      app,
      'recurrence_exceptions',
      backup.recurrenceExceptions,
      randomString,
    ),
  }
}

function createRecord(app, collectionName, id, values) {
  const collection = app.findCollectionByNameOrId(collectionName)
  const record = new Record(collection)
  record.set('id', id)
  const keys = Object.keys(values)
  for (let i = 0; i < keys.length; i++) {
    record.set(keys[i], values[keys[i]])
  }
  app.save(record)
  return record
}

function optionalValue(target, key, source, sourceKey) {
  if (source[sourceKey || key] !== undefined) {
    target[key] = source[sourceKey || key]
  }
}

function insertCategories(app, owner, categories, ids) {
  for (let i = 0; i < categories.length; i++) {
    const item = categories[i]
    const values = {
      owner: owner,
      name: item.name,
      color: item.color,
      order: item.order,
      archived: item.archived,
      subcategories: item.subcategories,
    }
    optionalValue(values, 'icon', item, 'icon')
    createRecord(app, 'categories', ids[item.id], values)
  }
}

function insertExpenses(app, owner, expenses, maps) {
  for (let i = 0; i < expenses.length; i++) {
    const item = expenses[i]
    const values = {
      owner: owner,
      date: item.date,
      amountCents: item.amountCents,
      category: maps.categories[item.categoryId],
    }
    optionalValue(values, 'subcategoryId', item, 'subcategoryId')
    optionalValue(values, 'description', item, 'description')
    optionalValue(values, 'recurrence', item, 'recurrence')
    createRecord(app, 'expenses', maps.expenses[item.id], values)
  }
}

function insertIncomes(app, owner, incomes, maps) {
  for (let i = 0; i < incomes.length; i++) {
    const item = incomes[i]
    const values = {
      owner: owner,
      name: item.name,
      kind: item.kind,
      amountCents: item.amountCents,
      date: item.date,
    }
    optionalValue(values, 'recurrence', item, 'recurrence')
    createRecord(app, 'monthly_incomes', maps.monthlyIncomes[item.id], values)
  }
}

function insertGoals(app, owner, goals, maps) {
  for (let i = 0; i < goals.length; i++) {
    const item = goals[i]
    const values = {
      owner: owner,
      name: item.name,
      kind: item.kind,
      targetAmountCents: item.targetAmountCents,
      currentAmountCents: item.currentAmountCents,
      monthlyContributionCents: item.monthlyContributionCents,
    }
    optionalValue(values, 'targetDate', item, 'targetDate')
    createRecord(app, 'savings_goals', maps.savingsGoals[item.id], values)
  }
}

function insertTransactions(app, owner, transactions, maps) {
  for (let i = 0; i < transactions.length; i++) {
    const item = transactions[i]
    const values = {
      owner: owner,
      goal: maps.savingsGoals[item.goalId],
      type: item.type,
      amountCents: item.amountCents,
      effectiveDate: item.effectiveDate,
    }
    optionalValue(values, 'note', item, 'note')
    createRecord(
      app,
      'savings_transactions',
      maps.savingsTransactions[item.id],
      values,
    )
  }
}

function insertBudgets(app, owner, budgets, maps) {
  for (let i = 0; i < budgets.length; i++) {
    const item = budgets[i]
    createRecord(app, 'monthly_budgets', maps.monthlyBudgets[item.id], {
      owner: owner,
      month: item.month,
      category: maps.categories[item.categoryId],
      amountCents: item.amountCents,
    })
  }
}

function rewrittenChanges(changes, maps) {
  if (!changes) {
    return undefined
  }
  const result = {}
  const keys = Object.keys(changes)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    result[key] = key === 'categoryId' ? maps.categories[changes[key]] : changes[key]
  }
  return result
}

function insertExceptions(app, owner, exceptions, maps) {
  for (let i = 0; i < exceptions.length; i++) {
    const item = exceptions[i]
    const seriesId = item.seriesType === 'expense'
      ? maps.expenses[item.seriesId]
      : maps.monthlyIncomes[item.seriesId]
    const values = {
      owner: owner,
      seriesType: item.seriesType,
      seriesId: seriesId,
      occurrenceDate: item.occurrenceDate,
      action: item.action,
    }
    if (item.changes !== undefined) {
      values.changes = rewrittenChanges(item.changes, maps)
    }
    createRecord(
      app,
      'recurrence_exceptions',
      maps.recurrenceExceptions[item.id],
      values,
    )
  }
}

function insertSettings(e, app, owner, settings, randomString) {
  const id = generateRecordId(e, app, 'user_settings', {}, randomString)
  const values = {
    owner: owner,
    currency: settings.currency,
    locale: settings.locale,
    onboardingCompleted: settings.onboardingCompleted,
    changesSinceExport: settings.changesSinceExport,
  }
  optionalValue(values, 'lastExportAt', settings, 'lastExportAt')
  createRecord(app, 'user_settings', id, values)
}

function insertBackup(e, app, owner, backup, maps, randomString) {
  insertCategories(app, owner, backup.categories, maps.categories)
  insertExpenses(app, owner, backup.expenses, maps)
  insertIncomes(app, owner, backup.monthlyIncomes, maps)
  insertGoals(app, owner, backup.savingsGoals, maps)
  insertTransactions(app, owner, backup.savingsTransactions, maps)
  insertBudgets(app, owner, backup.monthlyBudgets, maps)
  insertExceptions(app, owner, backup.recurrenceExceptions, maps)
  insertSettings(e, app, owner, backup.settings, randomString)
}

function saveImportMetadata(e, app, owner, request, randomString) {
  const id = generateRecordId(e, app, 'data_imports', {}, randomString)
  createRecord(app, 'data_imports', id, {
    owner: owner,
    idempotencyKey: request.idempotencyKey,
    snapshotHash: request.snapshotHash,
    mode: request.mode,
    status: 'completed',
    counts: request.counts,
    completedAt: new Date().toISOString(),
  })
}

function replaceAll(e, owner, request, randomString) {
  return runTransaction(e, function (app) {
    const existing = findImport(app, owner, request.idempotencyKey)
    const repeated = assertIdempotency(e, existing, request)
    if (repeated) {
      return repeated
    }

    if (request.mode === 'migrate-empty' && hasFinancialData(app, owner)) {
      throw e.error(409, 'A conta ja contem dados financeiros.', {})
    }

    // Os IDs sao preparados antes do delete para excluir colisoes tambem com
    // os records que esta mesma transacao vai substituir.
    const maps = createIdMaps(e, app, request.backup, randomString)
    deleteOwnedData(app, owner)
    insertBackup(e, app, owner, request.backup, maps, randomString)
    saveImportMetadata(e, app, owner, request, randomString)
    return { status: 'imported', counts: request.counts }
  })
}

function clearAll(e, owner) {
  return runTransaction(e, function (app) {
    deleteOwnedData(app, owner)
    return null
  })
}

module.exports = {
  DELETE_ORDER: DELETE_ORDER,
  FINANCIAL_COLLECTIONS: FINANCIAL_COLLECTIONS,
  authenticatedOwner: authenticatedOwner,
  clearAll: clearAll,
  createIdMaps: createIdMaps,
  deleteOwnedData: deleteOwnedData,
  replaceAll: replaceAll,
  requestBody: requestBody,
  rewrittenChanges: rewrittenChanges,
  runTransaction: runTransaction,
}
