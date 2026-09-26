/// <reference path="../../pb_data/types.d.ts" />

/*
 * Defesa adicional às API rules das coleções privadas do OndeVai.
 *
 * Cada handler carrega helpers CommonJS dentro do próprio scope porque o
 * PocketBase serializa handlers como programas isolados. A dupla resolução de
 * caminho suporta tanto `--hooksDir pb_hooks/validation` como o entrypoint na
 * raiz `pb_hooks` planeado pelo coordenador.
 */

const PRIVATE_COLLECTIONS = [
  'user_settings',
  'categories',
  'expenses',
  'monthly_incomes',
  'savings_goals',
  'savings_transactions',
  'monthly_budgets',
  'recurrence_exceptions',
]

onRecordCreateRequest(
  function (e) {
    let validation
    try {
      validation = require(`${__hooks}/validation/ownership.js`)
    } catch (_) {
      validation = require(`${__hooks}/ownership.js`)
    }
    validation.assertRequestOwner(e)
    validation.assertRelations(e)
    e.next()
  },
  ...PRIVATE_COLLECTIONS,
)

onRecordUpdateRequest(
  function (e) {
    let validation
    try {
      validation = require(`${__hooks}/validation/ownership.js`)
    } catch (_) {
      validation = require(`${__hooks}/ownership.js`)
    }
    validation.assertUnchangedOwner(e)
    validation.assertRelations(e)
    e.next()
  },
  ...PRIVATE_COLLECTIONS,
)

onRecordViewRequest(
  function (e) {
    let validation
    try {
      validation = require(`${__hooks}/validation/ownership.js`)
    } catch (_) {
      validation = require(`${__hooks}/ownership.js`)
    }
    validation.assertRequestOwner(e)
    e.next()
  },
  ...PRIVATE_COLLECTIONS,
)

onRecordDeleteRequest(
  function (e) {
    let validation
    try {
      validation = require(`${__hooks}/validation/ownership.js`)
    } catch (_) {
      validation = require(`${__hooks}/ownership.js`)
    }
    validation.assertRequestOwner(e)
    e.next()
  },
  ...PRIVATE_COLLECTIONS,
)
