/*
 * Helpers partilhados pelos endpoints transacionais da Onda 2.
 *
 * Este modulo e CommonJS porque os handlers do JSVM sao executados em scopes
 * isolados. Nao depende de Node.js nem do `$app` global: todas as pesquisas e
 * escritas recebem explicitamente a app transacional.
 */

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/
const CIVIL_DATE_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/
const CIVIL_MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/
const MAX_SAFE_INTEGER = 9007199254740991

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(e, message) {
  throw e.badRequestError(message || 'Pedido invalido.', {})
}

function assertObject(e, value, message) {
  if (!isObject(value)) {
    fail(e, message || 'Pedido invalido.')
  }
  return value
}

function requestBody(e) {
  const info = e.requestInfo()
  return assertObject(e, info && info.body, 'O corpo do pedido e invalido.')
}

function authenticatedOwner(e) {
  if (
    !e.auth ||
    e.auth.collection().name !== 'users' ||
    !e.auth.verified()
  ) {
    throw e.forbiddenError('Operacao nao autorizada.', {})
  }

  return e.auth.getString('id')
}

function assertOwner(e, value, owner) {
  if (hasOwn(value, 'owner') && value.owner !== owner) {
    throw e.forbiddenError('Operacao nao autorizada.', {})
  }
}

function assertRecordId(e, value, field) {
  if (typeof value !== 'string' || !RECORD_ID_PATTERN.test(value)) {
    fail(e, `${field || 'ID'} invalido.`)
  }
  return value
}

function isSafeInteger(value, minimum) {
  return (
    typeof value === 'number' &&
    isFinite(value) &&
    Math.floor(value) === value &&
    Math.abs(value) <= MAX_SAFE_INTEGER &&
    value >= minimum
  )
}

function assertInteger(e, value, minimum, message) {
  if (!isSafeInteger(value, minimum)) {
    fail(e, message)
  }
  return value
}

function assertString(e, value, options) {
  const config = options || {}
  if (typeof value !== 'string') {
    fail(e, config.message || 'Campo de texto invalido.')
  }

  const candidate = config.trim === false ? value : value.trim()
  if (!config.allowEmpty && candidate.length === 0) {
    fail(e, config.message || 'Campo de texto invalido.')
  }
  if (config.maxLength && candidate.length > config.maxLength) {
    fail(e, config.message || 'Campo de texto invalido.')
  }
  return candidate
}

function assertBoolean(e, value, message) {
  if (typeof value !== 'boolean') {
    fail(e, message)
  }
  return value
}

function assertEnum(e, value, allowed, message) {
  if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
    fail(e, message)
  }
  return value
}

function assertCivilDate(e, value, optional, message) {
  if (optional && (value === undefined || value === null || value === '')) {
    return ''
  }
  if (typeof value !== 'string' || !CIVIL_DATE_PATTERN.test(value)) {
    fail(e, message || 'Data invalida.')
  }
  return value
}

function assertCivilMonth(e, value) {
  if (typeof value !== 'string' || !CIVIL_MONTH_PATTERN.test(value)) {
    fail(e, 'Mes invalido.')
  }
  return value
}

function assertGoal(e, value, owner) {
  const goal = assertObject(e, value, 'Objetivo invalido.')
  assertOwner(e, goal, owner)

  return {
    id: assertRecordId(e, goal.id, 'ID do objetivo'),
    owner: owner,
    name: assertString(e, goal.name, {
      maxLength: 80,
      message: 'Nome do objetivo invalido.',
    }),
    kind: assertEnum(
      e,
      goal.kind,
      ['general', 'reserve', 'home', 'car', 'travel', 'education', 'other'],
      'Tipo de objetivo invalido.',
    ),
    targetAmountCents: assertInteger(
      e,
      goal.targetAmountCents,
      1,
      'Valor objetivo invalido.',
    ),
    currentAmountCents: assertInteger(
      e,
      goal.currentAmountCents,
      0,
      'Saldo do objetivo invalido.',
    ),
    monthlyContributionCents: assertInteger(
      e,
      goal.monthlyContributionCents,
      0,
      'Reforco mensal invalido.',
    ),
    targetDate: assertCivilDate(
      e,
      goal.targetDate,
      true,
      'Data objetivo invalida.',
    ),
  }
}

function assertTransaction(e, value, owner) {
  const transaction = assertObject(e, value, 'Movimento invalido.')
  assertOwner(e, transaction, owner)

  let note = ''
  if (
    transaction.note !== undefined &&
    transaction.note !== null &&
    transaction.note !== ''
  ) {
    note = assertString(e, transaction.note, {
      maxLength: 180,
      message: 'Nota do movimento invalida.',
    })
  }

  return {
    id: assertRecordId(e, transaction.id, 'ID do movimento'),
    owner: owner,
    goal: assertRecordId(e, transaction.goal, 'ID do objetivo'),
    type: assertEnum(
      e,
      transaction.type,
      ['opening', 'deposit', 'withdrawal'],
      'Tipo de movimento invalido.',
    ),
    amountCents: assertInteger(
      e,
      transaction.amountCents,
      1,
      'Valor do movimento invalido.',
    ),
    effectiveDate: assertCivilDate(
      e,
      transaction.effectiveDate,
      false,
      'Data efetiva invalida.',
    ),
    note: note,
  }
}

function assertSubcategories(e, value) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(e, 'Lista de subcategorias invalida.')
  }

  const ids = {}
  const result = []
  for (let i = 0; i < value.length; i++) {
    const item = assertObject(e, value[i], 'Subcategoria invalida.')
    const id = assertString(e, item.id, {
      maxLength: 100,
      message: 'ID de subcategoria invalido.',
    })
    if (ids[id]) {
      fail(e, 'Existem subcategorias repetidas.')
    }
    ids[id] = true
    result.push({
      id: id,
      name: assertString(e, item.name, {
        maxLength: 80,
        message: 'Nome de subcategoria invalido.',
      }),
      archived: assertBoolean(
        e,
        item.archived,
        'Estado de subcategoria invalido.',
      ),
    })
  }
  return result
}

function assertCategory(e, value, owner) {
  const category = assertObject(e, value, 'Categoria invalida.')
  assertOwner(e, category, owner)

  let icon = ''
  if (
    category.icon !== undefined &&
    category.icon !== null &&
    category.icon !== ''
  ) {
    icon = assertString(e, category.icon, {
      maxLength: 80,
      message: 'Icone de categoria invalido.',
    })
  }

  if (typeof category.color !== 'string' || !HEX_COLOR_PATTERN.test(category.color)) {
    fail(e, 'Cor de categoria invalida.')
  }

  return {
    id: assertRecordId(e, category.id, 'ID da categoria'),
    owner: owner,
    name: assertString(e, category.name, {
      maxLength: 80,
      message: 'Nome de categoria invalido.',
    }),
    color: category.color,
    icon: icon,
    order: assertInteger(e, category.order, 0, 'Ordem de categoria invalida.'),
    archived: assertBoolean(
      e,
      category.archived,
      'Estado de categoria invalido.',
    ),
    subcategories: assertSubcategories(e, category.subcategories),
  }
}

function assertBudget(e, value, owner) {
  const budget = assertObject(e, value, 'Orcamento invalido.')
  assertOwner(e, budget, owner)

  return {
    id: assertRecordId(e, budget.id, 'ID do orcamento'),
    owner: owner,
    month: assertCivilMonth(e, budget.month),
    category: assertRecordId(e, budget.category, 'ID da categoria'),
    amountCents: assertInteger(
      e,
      budget.amountCents,
      1,
      'Valor do orcamento invalido.',
    ),
  }
}

function requireArray(e, value, maximum, message) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(e, message)
  }
  return value
}

function applyGoal(record, data) {
  setRecordValues(record, {
    owner: data.owner,
    name: data.name,
    kind: data.kind,
    targetAmountCents: data.targetAmountCents,
    currentAmountCents: data.currentAmountCents,
    monthlyContributionCents: data.monthlyContributionCents,
    targetDate: data.targetDate,
  })
}

function applyTransaction(record, data) {
  setRecordValues(record, {
    owner: data.owner,
    goal: data.goal,
    type: data.type,
    amountCents: data.amountCents,
    effectiveDate: data.effectiveDate,
    note: data.note,
  })
}

function signedAmount(transaction) {
  return transaction.type === 'withdrawal'
    ? -transaction.amountCents
    : transaction.amountCents
}

function findById(app, collection, id) {
  const records = app.findRecordsByFilter(
    collection,
    'id = {:id}',
    '',
    1,
    0,
    { id: id },
  )
  return records.length === 1 ? records[0] : null
}

function findOwnedRecord(e, app, collection, id, owner, message) {
  const record = findById(app, collection, id)
  if (!record || record.getString('owner') !== owner) {
    throw e.notFoundError(message || 'Registo nao encontrado.', {})
  }
  return record
}

function assertOwnedReference(e, app, collection, id, owner) {
  const record = findById(app, collection, id)
  if (!record || record.getString('owner') !== owner) {
    fail(e, 'Referencia invalida.')
  }
  return record
}

function createRecord(app, collectionName, id, data) {
  const collection = app.findCollectionByNameOrId(collectionName)
  const record = new Record(collection)
  record.set('id', id)
  setRecordValues(record, data)
  return record
}

function setRecordValues(record, data) {
  const keys = Object.keys(data)
  for (let i = 0; i < keys.length; i++) {
    record.set(keys[i], data[keys[i]])
  }
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

module.exports = {
  applyGoal: applyGoal,
  applyTransaction: applyTransaction,
  assertBudget: assertBudget,
  assertCategory: assertCategory,
  assertEnum: assertEnum,
  assertGoal: assertGoal,
  assertObject: assertObject,
  assertOwner: assertOwner,
  assertOwnedReference: assertOwnedReference,
  assertRecordId: assertRecordId,
  assertTransaction: assertTransaction,
  authenticatedOwner: authenticatedOwner,
  createRecord: createRecord,
  fail: fail,
  findById: findById,
  findOwnedRecord: findOwnedRecord,
  hasOwn: hasOwn,
  requestBody: requestBody,
  requireArray: requireArray,
  runTransaction: runTransaction,
  setRecordValues: setRecordValues,
  signedAmount: signedAmount,
}
