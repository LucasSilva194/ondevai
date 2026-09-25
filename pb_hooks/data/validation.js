/*
 * Validacao integral e normalizacao de AppBackup schema 4.
 *
 * Este modulo e deliberadamente independente do schema PocketBase. Nenhuma
 * escrita ocorre durante a validacao e todas as relacoes sao resolvidas sobre
 * a representacao normalizada antes de o handler abrir uma transacao.
 */

const MAX_SAFE_INTEGER = 9007199254740991
const MAX_REQUEST_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_RECORDS = 5000
const MAX_JSON_BYTES = {
  recurrence: 4096,
  subcategories: 65536,
  changes: 8192,
}
const LIMITS = {
  categories: 200,
  expenses: 2500,
  monthlyIncomes: 500,
  savingsGoals: 250,
  savingsTransactions: 1000,
  monthlyBudgets: 400,
  recurrenceExceptions: 150,
}
const COLLECTION_FIELDS = Object.keys(LIMITS)
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(e, message) {
  throw e.badRequestError(message || 'O backup e invalido.', {})
}

function byteLengthUtf8(value) {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

function assertJsonSize(e, value, maximum, label) {
  const serialized = JSON.stringify(value)
  if (byteLengthUtf8(serialized) > maximum) {
    fail(e, `${label} excede o limite permitido.`)
  }
}

function assertObject(e, value, label) {
  if (!isObject(value)) {
    fail(e, `${label} tem um formato invalido.`)
  }
  return value
}

function assertExactKeys(e, value, required, optional, label) {
  const allowed = {}
  for (let i = 0; i < required.length; i++) {
    allowed[required[i]] = true
    if (!hasOwn(value, required[i])) {
      fail(e, `${label} nao contem todos os campos obrigatorios.`)
    }
  }
  for (let i = 0; i < optional.length; i++) {
    allowed[optional[i]] = true
  }
  const keys = Object.keys(value)
  for (let i = 0; i < keys.length; i++) {
    if (!allowed[keys[i]]) {
      fail(e, `${label} contem campos desconhecidos.`)
    }
  }
}

function assertString(e, value, minimum, maximum, label, trimRequired) {
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    (trimRequired !== false && value.trim().length === 0)
  ) {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function assertOptionalString(e, value, maximum, label, allowEmpty) {
  if (value === undefined) {
    return undefined
  }
  return assertString(e, value, allowEmpty ? 0 : 1, maximum, label, !allowEmpty)
}

function assertBoolean(e, value, label) {
  if (typeof value !== 'boolean') {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function assertInteger(e, value, minimum, maximum, label) {
  if (
    typeof value !== 'number' ||
    !isFinite(value) ||
    Math.floor(value) !== value ||
    Math.abs(value) > MAX_SAFE_INTEGER ||
    value < minimum ||
    value > maximum
  ) {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function assertEnum(e, value, choices, label) {
  if (typeof value !== 'string' || choices.indexOf(value) === -1) {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days[month - 1] || 0
}

function assertCivilDate(e, value, label) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    fail(e, `${label} e invalida.`)
  }
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    fail(e, `${label} e invalida.`)
  }
  return value
}

function assertCivilMonth(e, value, label) {
  if (typeof value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function assertTimestamp(e, value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 64 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
  ) {
    fail(e, `${label} e invalido.`)
  }
  assertCivilDate(e, value.slice(0, 10), label)
  if (!isFinite(Date.parse(value))) {
    fail(e, `${label} e invalido.`)
  }
  return value
}

function assertLegacyId(e, value, label) {
  return assertString(e, value, 1, 200, label, true)
}

function assertUniqueId(e, value, seen, label) {
  const id = assertLegacyId(e, value, label)
  if (seen[id]) {
    fail(e, `${label} esta repetido.`)
  }
  seen[id] = true
  return id
}

function assertArray(e, value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(e, `${label} excede o limite permitido.`)
  }
  return value
}

function parseSettings(e, value) {
  const settings = assertObject(e, value, 'As preferencias')
  assertExactKeys(
    e,
    settings,
    ['currency', 'locale', 'onboardingCompleted', 'changesSinceExport'],
    ['lastExportAt'],
    'As preferencias',
  )
  const result = {
    currency: assertEnum(e, settings.currency, ['EUR'], 'A moeda'),
    locale: assertEnum(e, settings.locale, ['pt-PT'], 'O idioma'),
    onboardingCompleted: assertBoolean(
      e,
      settings.onboardingCompleted,
      'O estado do onboarding',
    ),
    changesSinceExport: assertInteger(
      e,
      settings.changesSinceExport,
      0,
      MAX_SAFE_INTEGER,
      'O contador de alteracoes',
    ),
  }
  if (settings.lastExportAt !== undefined) {
    result.lastExportAt = assertTimestamp(
      e,
      settings.lastExportAt,
      'A data da ultima exportacao',
    )
  }
  return result
}

function parseSubcategories(e, value, globalOwners, categoryId, label) {
  const input = assertArray(e, value, 100, `${label}: subcategorias`)
  assertJsonSize(e, input, MAX_JSON_BYTES.subcategories, `${label}: subcategorias`)
  const localIds = {}
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `A subcategoria ${i + 1}`)
    assertExactKeys(e, item, ['id', 'name', 'archived'], [], `A subcategoria ${i + 1}`)
    const id = assertUniqueId(e, item.id, localIds, 'O ID de subcategoria')
    if (globalOwners[id]) {
      fail(e, 'Existem IDs de subcategoria repetidos entre categorias.')
    }
    globalOwners[id] = categoryId
    result.push({
      id: id,
      name: assertString(e, item.name, 1, 80, 'O nome da subcategoria', true),
      archived: assertBoolean(e, item.archived, 'O estado da subcategoria'),
    })
  }
  return result
}

function parseCategories(e, values, context) {
  const input = assertArray(e, values, LIMITS.categories, 'A lista de categorias')
  const result = []
  const orders = {}
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `A categoria ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'name', 'color', 'order', 'archived', 'subcategories'],
      ['icon'],
      `A categoria ${i + 1}`,
    )
    const id = assertUniqueId(e, item.id, context.ids.categories, 'O ID de categoria')
    const order = assertInteger(e, item.order, 0, LIMITS.categories - 1, 'A ordem da categoria')
    if (orders[String(order)]) {
      fail(e, 'Existem ordens de categoria repetidas.')
    }
    orders[String(order)] = true
    if (typeof item.color !== 'string' || !HEX_COLOR_PATTERN.test(item.color)) {
      fail(e, 'A cor da categoria e invalida.')
    }
    const category = {
      id: id,
      name: assertString(e, item.name, 1, 80, 'O nome da categoria', true),
      color: item.color,
      order: order,
      archived: assertBoolean(e, item.archived, 'O estado da categoria'),
      subcategories: parseSubcategories(
        e,
        item.subcategories,
        context.subcategoryOwners,
        id,
        `A categoria ${i + 1}`,
      ),
    }
    if (item.icon !== undefined) {
      category.icon = assertOptionalString(e, item.icon, 80, 'O icone da categoria', true)
    }
    result.push(category)
  }
  return result
}

function parseRecurrence(e, value, seriesDate, label) {
  if (value === undefined) {
    return undefined
  }
  const item = assertObject(e, value, `A recorrencia de ${label}`)
  assertExactKeys(
    e,
    item,
    ['frequency', 'interval', 'startDate', 'status'],
    ['endDate', 'pausedFrom'],
    `A recorrencia de ${label}`,
  )
  assertJsonSize(e, item, MAX_JSON_BYTES.recurrence, `A recorrencia de ${label}`)
  const result = {
    frequency: assertEnum(
      e,
      item.frequency,
      ['weekly', 'monthly', 'yearly'],
      'A frequencia da recorrencia',
    ),
    interval: assertInteger(e, item.interval, 1, 1000, 'O intervalo da recorrencia'),
    startDate: assertCivilDate(e, item.startDate, 'A data inicial da recorrencia'),
    status: assertEnum(e, item.status, ['active', 'paused'], 'O estado da recorrencia'),
  }
  if (result.startDate !== seriesDate) {
    fail(e, `A recorrencia de ${label} nao comeca na data da serie.`)
  }
  if (item.endDate !== undefined) {
    result.endDate = assertCivilDate(e, item.endDate, 'A data final da recorrencia')
    if (result.endDate < result.startDate) {
      fail(e, 'A data final da recorrencia antecede a data inicial.')
    }
  }
  if (item.pausedFrom !== undefined) {
    result.pausedFrom = assertCivilDate(e, item.pausedFrom, 'A data de pausa da recorrencia')
    if (result.pausedFrom < result.startDate) {
      fail(e, 'A data de pausa da recorrencia antecede a data inicial.')
    }
  }
  if (result.status === 'paused' && !result.pausedFrom) {
    fail(e, 'Uma recorrencia pausada exige a data de pausa.')
  }
  return result
}

function parseExpenses(e, values, context) {
  const input = assertArray(e, values, LIMITS.expenses, 'A lista de despesas')
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `A despesa ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'date', 'amountCents', 'categoryId', 'createdAt', 'updatedAt'],
      ['subcategoryId', 'description', 'recurrence'],
      `A despesa ${i + 1}`,
    )
    const date = assertCivilDate(e, item.date, 'A data da despesa')
    const categoryId = assertLegacyId(e, item.categoryId, 'A categoria da despesa')
    if (!context.ids.categories[categoryId]) {
      fail(e, `A despesa ${i + 1} refere uma categoria inexistente.`)
    }
    const expense = {
      id: assertUniqueId(e, item.id, context.ids.expenses, 'O ID de despesa'),
      date: date,
      amountCents: assertInteger(e, item.amountCents, 1, MAX_SAFE_INTEGER, 'O valor da despesa'),
      categoryId: categoryId,
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao da despesa'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao da despesa'),
    }
    if (item.subcategoryId !== undefined) {
      const subcategoryId = assertLegacyId(e, item.subcategoryId, 'A subcategoria da despesa')
      if (context.subcategoryOwners[subcategoryId] !== categoryId) {
        fail(e, `A despesa ${i + 1} refere uma subcategoria invalida.`)
      }
      expense.subcategoryId = subcategoryId
    }
    if (item.description !== undefined) {
      expense.description = assertString(e, item.description, 1, 140, 'A descricao da despesa', true)
    }
    const recurrence = parseRecurrence(e, item.recurrence, date, `a despesa ${i + 1}`)
    if (recurrence) {
      expense.recurrence = recurrence
    }
    result.push(expense)
  }
  return result
}

function parseIncomes(e, values, context) {
  const input = assertArray(e, values, LIMITS.monthlyIncomes, 'A lista de rendimentos')
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `O rendimento ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'name', 'kind', 'amountCents', 'date', 'createdAt', 'updatedAt'],
      ['recurrence'],
      `O rendimento ${i + 1}`,
    )
    const date = assertCivilDate(e, item.date, 'A data do rendimento')
    const income = {
      id: assertUniqueId(e, item.id, context.ids.monthlyIncomes, 'O ID de rendimento'),
      name: assertString(e, item.name, 1, 80, 'O nome do rendimento', true),
      kind: assertEnum(
        e,
        item.kind,
        ['salary', 'subsidy', 'freelance', 'other'],
        'O tipo do rendimento',
      ),
      amountCents: assertInteger(e, item.amountCents, 1, MAX_SAFE_INTEGER, 'O valor do rendimento'),
      date: date,
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao do rendimento'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao do rendimento'),
    }
    const recurrence = parseRecurrence(e, item.recurrence, date, `o rendimento ${i + 1}`)
    if (recurrence) {
      income.recurrence = recurrence
    }
    result.push(income)
  }
  return result
}

function parseGoals(e, values, context) {
  const input = assertArray(e, values, LIMITS.savingsGoals, 'A lista de objetivos')
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `O objetivo ${i + 1}`)
    assertExactKeys(
      e,
      item,
      [
        'id',
        'name',
        'kind',
        'targetAmountCents',
        'currentAmountCents',
        'monthlyContributionCents',
        'createdAt',
        'updatedAt',
      ],
      ['targetDate'],
      `O objetivo ${i + 1}`,
    )
    const goal = {
      id: assertUniqueId(e, item.id, context.ids.savingsGoals, 'O ID de objetivo'),
      name: assertString(e, item.name, 1, 80, 'O nome do objetivo', true),
      kind: assertEnum(
        e,
        item.kind,
        ['general', 'reserve', 'home', 'car', 'travel', 'education', 'other'],
        'O tipo do objetivo',
      ),
      targetAmountCents: assertInteger(
        e,
        item.targetAmountCents,
        1,
        MAX_SAFE_INTEGER,
        'O valor objetivo',
      ),
      currentAmountCents: assertInteger(
        e,
        item.currentAmountCents,
        0,
        MAX_SAFE_INTEGER,
        'O saldo do objetivo',
      ),
      monthlyContributionCents: assertInteger(
        e,
        item.monthlyContributionCents,
        0,
        MAX_SAFE_INTEGER,
        'O reforco mensal',
      ),
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao do objetivo'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao do objetivo'),
    }
    if (item.targetDate !== undefined) {
      goal.targetDate = assertCivilDate(e, item.targetDate, 'A data objetivo')
    }
    result.push(goal)
  }
  return result
}

function parseTransactions(e, values, context) {
  const input = assertArray(
    e,
    values,
    LIMITS.savingsTransactions,
    'A lista de movimentos de poupanca',
  )
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `O movimento ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'goalId', 'type', 'amountCents', 'effectiveDate', 'createdAt', 'updatedAt'],
      ['note'],
      `O movimento ${i + 1}`,
    )
    const goalId = assertLegacyId(e, item.goalId, 'O objetivo do movimento')
    if (!context.ids.savingsGoals[goalId]) {
      fail(e, `O movimento ${i + 1} refere um objetivo inexistente.`)
    }
    const transaction = {
      id: assertUniqueId(
        e,
        item.id,
        context.ids.savingsTransactions,
        'O ID de movimento',
      ),
      goalId: goalId,
      type: assertEnum(
        e,
        item.type,
        ['opening', 'deposit', 'withdrawal'],
        'O tipo do movimento',
      ),
      amountCents: assertInteger(e, item.amountCents, 1, MAX_SAFE_INTEGER, 'O valor do movimento'),
      effectiveDate: assertCivilDate(e, item.effectiveDate, 'A data efetiva do movimento'),
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao do movimento'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao do movimento'),
      _inputOrder: i,
    }
    if (item.note !== undefined) {
      transaction.note = assertString(e, item.note, 1, 180, 'A nota do movimento', true)
    }
    result.push(transaction)
  }
  return result
}

function validateLedgers(e, goals, transactions) {
  const byGoal = {}
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]
    if (!byGoal[transaction.goalId]) {
      byGoal[transaction.goalId] = []
    }
    byGoal[transaction.goalId].push(transaction)
  }

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i]
    const ledger = byGoal[goal.id] || []
    ledger.sort(function (left, right) {
      if (left.effectiveDate !== right.effectiveDate) {
        return left.effectiveDate < right.effectiveDate ? -1 : 1
      }
      if (left.createdAt !== right.createdAt) {
        return left.createdAt < right.createdAt ? -1 : 1
      }
      return left._inputOrder - right._inputOrder
    })

    let balance = 0
    let openingCount = 0
    for (let j = 0; j < ledger.length; j++) {
      const transaction = ledger[j]
      if (transaction.type === 'opening') {
        openingCount += 1
        if (j !== 0 || openingCount > 1) {
          fail(e, `O historico do objetivo "${goal.id}" tem uma abertura invalida.`)
        }
      }
      balance += transaction.type === 'withdrawal'
        ? -transaction.amountCents
        : transaction.amountCents
      if (!Number.isSafeInteger(balance) || balance < 0) {
        fail(e, `O historico do objetivo "${goal.id}" produz saldo invalido.`)
      }
    }
    if (balance !== goal.currentAmountCents) {
      fail(e, `O historico do objetivo "${goal.id}" nao corresponde ao saldo guardado.`)
    }
  }
}

function parseBudgets(e, values, context) {
  const input = assertArray(e, values, LIMITS.monthlyBudgets, 'A lista de orcamentos')
  const uniqueKeys = {}
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `O orcamento ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'month', 'categoryId', 'amountCents', 'createdAt', 'updatedAt'],
      [],
      `O orcamento ${i + 1}`,
    )
    const categoryId = assertLegacyId(e, item.categoryId, 'A categoria do orcamento')
    if (!context.ids.categories[categoryId]) {
      fail(e, `O orcamento ${i + 1} refere uma categoria inexistente.`)
    }
    const month = assertCivilMonth(e, item.month, 'O mes do orcamento')
    const key = `${month}:${categoryId}`
    if (uniqueKeys[key]) {
      fail(e, 'Existe mais do que um orcamento para a mesma categoria e mes.')
    }
    uniqueKeys[key] = true
    result.push({
      id: assertUniqueId(e, item.id, context.ids.monthlyBudgets, 'O ID de orcamento'),
      month: month,
      categoryId: categoryId,
      amountCents: assertInteger(e, item.amountCents, 1, MAX_SAFE_INTEGER, 'O valor do orcamento'),
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao do orcamento'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao do orcamento'),
    })
  }
  return result
}

function parseExceptionChanges(e, value, seriesType, context, series, label) {
  const changes = assertObject(e, value, `As alteracoes de ${label}`)
  const expenseKeys = ['date', 'amountCents', 'categoryId', 'subcategoryId', 'description']
  const incomeKeys = ['date', 'amountCents', 'name', 'kind']
  assertExactKeys(
    e,
    changes,
    [],
    seriesType === 'expense' ? expenseKeys : incomeKeys,
    `As alteracoes de ${label}`,
  )
  if (Object.keys(changes).length === 0) {
    fail(e, `As alteracoes de ${label} estao vazias.`)
  }
  assertJsonSize(e, changes, MAX_JSON_BYTES.changes, `As alteracoes de ${label}`)
  const result = {}
  if (changes.date !== undefined) {
    result.date = assertCivilDate(e, changes.date, 'A nova data da ocorrencia')
  }
  if (changes.amountCents !== undefined) {
    result.amountCents = assertInteger(
      e,
      changes.amountCents,
      1,
      MAX_SAFE_INTEGER,
      'O novo valor da ocorrencia',
    )
  }
  if (seriesType === 'expense') {
    let categoryId = series.categoryId
    if (changes.categoryId !== undefined) {
      categoryId = assertLegacyId(e, changes.categoryId, 'A nova categoria da ocorrencia')
      if (!context.ids.categories[categoryId]) {
        fail(e, `${label} refere uma categoria inexistente.`)
      }
      result.categoryId = categoryId
    }
    if (changes.subcategoryId !== undefined) {
      const subcategoryId = assertLegacyId(
        e,
        changes.subcategoryId,
        'A nova subcategoria da ocorrencia',
      )
      if (context.subcategoryOwners[subcategoryId] !== categoryId) {
        fail(e, `${label} refere uma subcategoria invalida.`)
      }
      result.subcategoryId = subcategoryId
    }
    if (changes.description !== undefined) {
      result.description = assertString(
        e,
        changes.description,
        1,
        140,
        'A nova descricao da ocorrencia',
        true,
      )
    }
  } else {
    if (changes.name !== undefined) {
      result.name = assertString(e, changes.name, 1, 80, 'O novo nome da ocorrencia', true)
    }
    if (changes.kind !== undefined) {
      result.kind = assertEnum(
        e,
        changes.kind,
        ['salary', 'subsidy', 'freelance', 'other'],
        'O novo tipo do rendimento',
      )
    }
  }
  return result
}

function parseExceptions(e, values, context, expenses, incomes) {
  const input = assertArray(
    e,
    values,
    LIMITS.recurrenceExceptions,
    'A lista de excecoes de recorrencia',
  )
  const expenseSeries = {}
  const incomeSeries = {}
  for (let i = 0; i < expenses.length; i++) {
    if (expenses[i].recurrence) {
      expenseSeries[expenses[i].id] = expenses[i]
    }
  }
  for (let i = 0; i < incomes.length; i++) {
    if (incomes[i].recurrence) {
      incomeSeries[incomes[i].id] = incomes[i]
    }
  }

  const uniqueKeys = {}
  const result = []
  for (let i = 0; i < input.length; i++) {
    const item = assertObject(e, input[i], `A excecao ${i + 1}`)
    assertExactKeys(
      e,
      item,
      ['id', 'seriesType', 'seriesId', 'occurrenceDate', 'action', 'createdAt', 'updatedAt'],
      ['changes'],
      `A excecao ${i + 1}`,
    )
    const seriesType = assertEnum(
      e,
      item.seriesType,
      ['expense', 'income'],
      'O tipo da serie',
    )
    const seriesId = assertLegacyId(e, item.seriesId, 'O ID da serie')
    const series = seriesType === 'expense' ? expenseSeries[seriesId] : incomeSeries[seriesId]
    if (!series) {
      fail(e, `A excecao ${i + 1} refere uma serie inexistente.`)
    }
    const occurrenceDate = assertCivilDate(e, item.occurrenceDate, 'A data da ocorrencia')
    if (occurrenceDate < series.recurrence.startDate) {
      fail(e, `A excecao ${i + 1} antecede o inicio da serie.`)
    }
    const action = assertEnum(e, item.action, ['skip', 'override'], 'A acao da excecao')
    if (action === 'skip' && item.changes !== undefined) {
      fail(e, 'Uma excecao skip nao pode conter alteracoes.')
    }
    if (action === 'override' && item.changes === undefined) {
      fail(e, 'Uma excecao override exige alteracoes.')
    }
    const key = `${seriesType}:${seriesId}:${occurrenceDate}`
    if (uniqueKeys[key]) {
      fail(e, 'Existe mais do que uma excecao para a mesma ocorrencia.')
    }
    uniqueKeys[key] = true
    const exception = {
      id: assertUniqueId(
        e,
        item.id,
        context.ids.recurrenceExceptions,
        'O ID de excecao',
      ),
      seriesType: seriesType,
      seriesId: seriesId,
      occurrenceDate: occurrenceDate,
      action: action,
      createdAt: assertTimestamp(e, item.createdAt, 'A data de criacao da excecao'),
      updatedAt: assertTimestamp(e, item.updatedAt, 'A data de atualizacao da excecao'),
    }
    if (item.changes !== undefined) {
      exception.changes = parseExceptionChanges(
        e,
        item.changes,
        seriesType,
        context,
        series,
        `a excecao ${i + 1}`,
      )
    }
    result.push(exception)
  }
  return result
}

function stripInternalTransactionFields(transactions) {
  const result = []
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i]
    const clean = {
      id: transaction.id,
      goalId: transaction.goalId,
      type: transaction.type,
      amountCents: transaction.amountCents,
      effectiveDate: transaction.effectiveDate,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }
    if (transaction.note !== undefined) {
      clean.note = transaction.note
    }
    result.push(clean)
  }
  return result
}

function validateBackup(e, value) {
  const backup = assertObject(e, value, 'O backup')
  assertExactKeys(
    e,
    backup,
    [
      'schemaVersion',
      'exportedAt',
      'settings',
      'categories',
      'expenses',
      'monthlyIncomes',
      'savingsGoals',
      'savingsTransactions',
      'monthlyBudgets',
      'recurrenceExceptions',
    ],
    [],
    'O backup',
  )
  if (backup.schemaVersion !== 4) {
    fail(e, 'Apenas backups schemaVersion 4 sao aceites.')
  }

  let total = 0
  for (let i = 0; i < COLLECTION_FIELDS.length; i++) {
    const field = COLLECTION_FIELDS[i]
    if (!Array.isArray(backup[field])) {
      fail(e, `A lista ${field} e invalida.`)
    }
    total += backup[field].length
  }
  if (total > MAX_TOTAL_RECORDS) {
    fail(e, 'O backup excede o limite total de registos.')
  }

  const context = {
    ids: {
      categories: {},
      expenses: {},
      monthlyIncomes: {},
      savingsGoals: {},
      savingsTransactions: {},
      monthlyBudgets: {},
      recurrenceExceptions: {},
    },
    subcategoryOwners: {},
  }
  const settings = parseSettings(e, backup.settings)
  const categories = parseCategories(e, backup.categories, context)
  const expenses = parseExpenses(e, backup.expenses, context)
  const monthlyIncomes = parseIncomes(e, backup.monthlyIncomes, context)
  const savingsGoals = parseGoals(e, backup.savingsGoals, context)
  const transactionsWithOrder = parseTransactions(e, backup.savingsTransactions, context)
  validateLedgers(e, savingsGoals, transactionsWithOrder)
  const savingsTransactions = stripInternalTransactionFields(transactionsWithOrder)
  const monthlyBudgets = parseBudgets(e, backup.monthlyBudgets, context)
  const recurrenceExceptions = parseExceptions(
    e,
    backup.recurrenceExceptions,
    context,
    expenses,
    monthlyIncomes,
  )

  return {
    schemaVersion: 4,
    exportedAt: assertTimestamp(e, backup.exportedAt, 'A data de exportacao'),
    settings: settings,
    categories: categories,
    expenses: expenses,
    monthlyIncomes: monthlyIncomes,
    savingsGoals: savingsGoals,
    savingsTransactions: savingsTransactions,
    monthlyBudgets: monthlyBudgets,
    recurrenceExceptions: recurrenceExceptions,
  }
}

function calculateCounts(backup) {
  return {
    categories: backup.categories.length,
    expenses: backup.expenses.length,
    monthlyIncomes: backup.monthlyIncomes.length,
    savingsGoals: backup.savingsGoals.length,
    savingsTransactions: backup.savingsTransactions.length,
    monthlyBudgets: backup.monthlyBudgets.length,
    recurrenceExceptions: backup.recurrenceExceptions.length,
  }
}

function validateImportRequest(e, body) {
  const request = assertObject(e, body, 'O pedido')
  const serialized = JSON.stringify(request)
  if (byteLengthUtf8(serialized) > MAX_REQUEST_BYTES) {
    throw e.error(413, 'O pedido excede o limite de 20 MiB.', {})
  }
  assertExactKeys(
    e,
    request,
    ['idempotencyKey', 'snapshotHash', 'backup'],
    ['mode'],
    'O pedido',
  )
  const mode = request.mode === undefined
    ? 'migrate-empty'
    : assertEnum(e, request.mode, ['migrate-empty', 'replace'], 'O modo de importacao')
  const idempotencyKey = assertString(
    e,
    request.idempotencyKey,
    8,
    200,
    'A chave de idempotencia',
    true,
  )
  if (typeof request.snapshotHash !== 'string' || !HASH_PATTERN.test(request.snapshotHash)) {
    fail(e, 'O fingerprint do backup e invalido.')
  }
  const backup = validateBackup(e, request.backup)
  return {
    mode: mode,
    idempotencyKey: idempotencyKey,
    snapshotHash: request.snapshotHash,
    backup: backup,
    counts: calculateCounts(backup),
  }
}

module.exports = {
  LIMITS: LIMITS,
  MAX_JSON_BYTES: MAX_JSON_BYTES,
  MAX_REQUEST_BYTES: MAX_REQUEST_BYTES,
  MAX_TOTAL_RECORDS: MAX_TOTAL_RECORDS,
  byteLengthUtf8: byteLengthUtf8,
  calculateCounts: calculateCounts,
  validateBackup: validateBackup,
  validateImportRequest: validateImportRequest,
}
