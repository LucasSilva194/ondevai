/*
 * Helpers CommonJS sem estado mutável para ownership/relations.
 *
 * PocketBase serializa cada handler para um contexto isolado; por isso os
 * callbacks em ownership.pb.js carregam explicitamente este módulo. `require`
 * de módulos locais é uma API JSVM suportada e não depende do runtime Node.js.
 */

function authenticatedUserId(e) {
  if (!e.auth || e.auth.collection().name !== 'users' || !e.auth.verified()) {
    throw e.forbiddenError('Operação não autorizada.', {})
  }

  return e.auth.getString('id')
}

function assertRequestOwner(e) {
  if (e.hasSuperuserAuth()) {
    return
  }

  const authId = authenticatedUserId(e)
  if (!e.record || e.record.getString('owner') !== authId) {
    throw e.forbiddenError('Operação não autorizada.', {})
  }
}

function assertUnchangedOwner(e) {
  if (e.hasSuperuserAuth()) {
    return
  }

  assertRequestOwner(e)

  if (
    !e.record ||
    e.record.original().getString('owner') !== e.record.getString('owner')
  ) {
    throw e.badRequestError('O proprietário do registo não pode ser alterado.', {})
  }
}

function findRelatedRecord(e, collection, id) {
  if (!id) {
    throw e.badRequestError('Referência inválida.', {})
  }

  try {
    return e.app.findRecordById(collection, id)
  } catch (_) {
    // Não revelar a existência de registos de outro utilizador.
    throw e.badRequestError('Referência inválida.', {})
  }
}

function assertOwnedRelation(e, collection, field) {
  const related = findRelatedRecord(e, collection, e.record.getString(field))
  if (related.getString('owner') !== e.record.getString('owner')) {
    throw e.badRequestError('Referência inválida.', {})
  }
}

function assertRelations(e) {
  if (e.hasSuperuserAuth() || !e.record) {
    return
  }

  const collection = e.record.collection().name
  if (collection === 'expenses') {
    assertOwnedRelation(e, 'categories', 'category')
    return
  }

  if (collection === 'monthly_budgets') {
    assertOwnedRelation(e, 'categories', 'category')
    return
  }

  if (collection === 'savings_transactions') {
    assertOwnedRelation(e, 'savings_goals', 'goal')
    return
  }

  if (collection === 'recurrence_exceptions') {
    const seriesType = e.record.getString('seriesType')
    const collectionName =
      seriesType === 'expense'
        ? 'expenses'
        : seriesType === 'income'
          ? 'monthly_incomes'
          : ''

    if (!collectionName) {
      throw e.badRequestError('Tipo de série inválido.', {})
    }

    const series = findRelatedRecord(
      e,
      collectionName,
      e.record.getString('seriesId'),
    )
    if (series.getString('owner') !== e.record.getString('owner')) {
      throw e.badRequestError('Referência inválida.', {})
    }
  }
}

function assertRequestFields(e) {
  if (e.hasSuperuserAuth()) return

  const body = e.requestInfo().body || {}
  const collection = e.record.collection().name
  const textLimits = {
    categories: { name: 80, icon: 64 },
    expenses: { subcategoryId: 64, description: 140, merchant: 100 },
    monthly_incomes: { name: 80 },
    savings_goals: { name: 80 },
    savings_transactions: { note: 180 },
    recurrence_exceptions: { seriesId: 64 },
  }
  const jsonLimits = {
    categories: { subcategories: 65536 },
    expenses: { recurrence: 4096, tags: 4096 },
    monthly_incomes: { recurrence: 4096 },
    recurrence_exceptions: { changes: 8192 },
  }
  const stringFields = textLimits[collection] || {}
  const jsonFields = jsonLimits[collection] || {}
  const bodySize = byteLength(JSON.stringify(body))
  if (bodySize > 131072) {
    throw e.badRequestError('O pedido excede o tamanho permitido.', {})
  }

  Object.keys(stringFields).forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(body, name) &&
      (typeof body[name] !== 'string' || body[name].length > stringFields[name])) {
      throw e.badRequestError('Um dos campos de texto excede o tamanho permitido.', {})
    }
  })
  Object.keys(jsonFields).forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(body, name) &&
      byteLength(JSON.stringify(body[name])) > jsonFields[name]) {
      throw e.badRequestError('Um dos campos estruturados excede o tamanho permitido.', {})
    }
  })

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    if (!Array.isArray(body.tags) || body.tags.length > 10 ||
      body.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 32)) {
      throw e.badRequestError('As etiquetas da despesa são inválidas.', {})
    }
  }
}

function byteLength(value) {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4
      i += 1
    } else bytes += 3
  }
  return bytes
}

module.exports = {
  assertRequestOwner: assertRequestOwner,
  assertUnchangedOwner: assertUnchangedOwner,
  assertRelations: assertRelations,
  assertRequestFields: assertRequestFields,
}
