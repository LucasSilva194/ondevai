/* Eliminacao autenticada e transacional da propria conta. */

const CONFIRMATION = 'APAGAR CONTA'
const OWNED_COLLECTIONS = [
  'recurrence_exceptions',
  'savings_transactions',
  'monthly_budgets',
  'expenses',
  'monthly_incomes',
  'savings_goals',
  'categories',
  'user_settings',
  'data_imports',
]

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function validateRequest(e, body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !hasOwn(body, 'password') ||
    !hasOwn(body, 'confirmation')
  ) {
    throw e.badRequestError('O pedido de eliminacao e invalido.', {})
  }
  if (
    typeof body.password !== 'string' ||
    body.password.length === 0 ||
    body.password.length > 1024
  ) {
    throw e.badRequestError('Nao foi possivel confirmar as credenciais.', {})
  }
  if (body.confirmation !== CONFIRMATION) {
    throw e.badRequestError('A confirmacao de eliminacao e invalida.', {})
  }
  return { password: body.password }
}

function assertNoOwnedRecords(e, app, owner) {
  for (let i = 0; i < OWNED_COLLECTIONS.length; i++) {
    const records = app.findRecordsByFilter(
      OWNED_COLLECTIONS[i],
      'owner = {:owner}',
      '',
      1,
      0,
      { owner: owner },
    )
    if (records.length > 0) {
      throw e.internalServerError('Nao foi possivel eliminar a conta.', {})
    }
  }
}

function deleteAccount(e, owner, body, runTransaction) {
  const request = validateRequest(e, body)
  return runTransaction(e, function (app) {
    let user
    try {
      user = app.findRecordById('users', owner)
    } catch (_) {
      throw e.badRequestError('Nao foi possivel confirmar as credenciais.', {})
    }
    if (!user.validatePassword(request.password)) {
      throw e.badRequestError('Nao foi possivel confirmar as credenciais.', {})
    }
    app.delete(user)
    assertNoOwnedRecords(e, app, owner)
    return null
  })
}

module.exports = {
  CONFIRMATION: CONFIRMATION,
  deleteAccount: deleteAccount,
  validateRequest: validateRequest,
}
