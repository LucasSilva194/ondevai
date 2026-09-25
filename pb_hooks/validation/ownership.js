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

module.exports = {
  assertRequestOwner: assertRequestOwner,
  assertUnchangedOwner: assertUnchangedOwner,
  assertRelations: assertRelations,
}
