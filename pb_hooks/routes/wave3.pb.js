/// <reference path="../../pb_data/types.d.ts" />

/* Rotas server-side de importacao, limpeza e eliminacao de conta da Onda 3. */

routerAdd(
  'POST',
  '/api/ondevai/data/replace-all',
  function (e) {
    const fingerprint = require(`${__hooks}/data/fingerprint.js`)
    const operations = require(`${__hooks}/data/operations.js`)
    const validation = require(`${__hooks}/data/validation.js`)
    const owner = operations.authenticatedOwner(e)
    const request = validation.validateImportRequest(e, operations.requestBody(e))
    const calculatedHash = fingerprint.calculateBackupFingerprint(
      request.backup,
      $security.sha256,
    )
    if (!$security.equal(calculatedHash, request.snapshotHash)) {
      throw e.badRequestError('O fingerprint do backup nao corresponde ao conteudo.', {})
    }
    const result = operations.replaceAll(
      e,
      owner,
      request,
      $security.randomStringWithAlphabet,
    )
    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/data/clear-all',
  function (e) {
    const operations = require(`${__hooks}/data/operations.js`)
    const owner = operations.authenticatedOwner(e)
    operations.clearAll(e, owner)
    return e.noContent(204)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/account/delete',
  function (e) {
    const account = require(`${__hooks}/account/delete.js`)
    const operations = require(`${__hooks}/data/operations.js`)
    const owner = operations.authenticatedOwner(e)
    account.deleteAccount(
      e,
      owner,
      operations.requestBody(e),
      operations.runTransaction,
    )
    return e.noContent(204)
  },
  $apis.requireAuth('users'),
)
