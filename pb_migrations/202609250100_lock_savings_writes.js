/// <reference path="../pb_data/types.d.ts" />

/*
 * Onda 2: o cache de saldo e o ledger de poupancas so podem ser alterados
 * pelos endpoints transacionais. Rules null bloqueiam a Records API normal,
 * mas o bypass nativo de superutilizador continua disponivel ao dashboard e
 * as escritas internas/migrations continuam a usar a app diretamente.
 */

const OWNER_READ_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id'
const OWNER_CREATE_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && @request.body.owner = @request.auth.id'
const OWNER_UPDATE_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id && @request.body.owner:changed = false'

migrate(
  function (app) {
    const names = ['savings_goals', 'savings_transactions']
    for (let i = 0; i < names.length; i++) {
      const collection = app.findCollectionByNameOrId(names[i])
      collection.createRule = null
      collection.updateRule = null
      collection.deleteRule = null
      app.save(collection)
    }
  },
  function (app) {
    const names = ['savings_goals', 'savings_transactions']
    for (let i = 0; i < names.length; i++) {
      const collection = app.findCollectionByNameOrId(names[i])
      collection.listRule = OWNER_READ_RULE
      collection.viewRule = OWNER_READ_RULE
      collection.createRule = OWNER_CREATE_RULE
      collection.updateRule = OWNER_UPDATE_RULE
      collection.deleteRule = OWNER_READ_RULE
      app.save(collection)
    }
  },
)
