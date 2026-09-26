/// <reference path="../../pb_data/types.d.ts" />

/*
 * Rotas transacionais da Onda 2.
 *
 * O middleware aceita apenas tokens da auth collection `users`; os handlers
 * voltam a confirmar email verificado e derivam sempre owner de e.auth.
 */

routerAdd(
  'POST',
  '/api/ondevai/savings/goals/create',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const goal = tx.assertGoal(e, body.goal, owner)
      const hasOpening = body.opening !== undefined && body.opening !== null

      if (!hasOpening && goal.currentAmountCents !== 0) {
        tx.fail(e, 'Um saldo inicial exige um movimento de abertura.')
      }

      let opening = null
      if (hasOpening) {
        opening = tx.assertTransaction(e, body.opening, owner)
        if (
          opening.goal !== goal.id ||
          opening.type !== 'opening' ||
          opening.amountCents !== goal.currentAmountCents
        ) {
          tx.fail(e, 'O movimento de abertura nao corresponde ao objetivo.')
        }
      }

      const goalRecord = tx.createRecord(
        txApp,
        'savings_goals',
        goal.id,
        {},
      )
      tx.applyGoal(goalRecord, goal)
      txApp.save(goalRecord)

      if (opening) {
        const openingRecord = tx.createRecord(
          txApp,
          'savings_transactions',
          opening.id,
          {},
        )
        tx.applyTransaction(openingRecord, opening)
        txApp.save(openingRecord)
      }

      return goalRecord
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/savings/goals/update',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const goal = tx.assertGoal(e, body.goal, owner)
      const goalRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_goals',
        goal.id,
        owner,
        'Objetivo nao encontrado.',
      )
      const previousBalance = goalRecord.getInt('currentAmountCents')
      const hasAdjustment =
        body.adjustment !== undefined && body.adjustment !== null

      let adjustment = null
      if (hasAdjustment) {
        adjustment = tx.assertTransaction(e, body.adjustment, owner)
        if (
          adjustment.goal !== goal.id ||
          (adjustment.type !== 'deposit' && adjustment.type !== 'withdrawal')
        ) {
          tx.fail(e, 'O movimento de ajuste e invalido.')
        }

        const expectedBalance = previousBalance + tx.signedAmount(adjustment)
        if (expectedBalance < 0) {
          tx.fail(e, 'O saldo do objetivo nao pode ficar negativo.')
        }
        if (goal.currentAmountCents !== expectedBalance) {
          tx.fail(e, 'O saldo final nao corresponde ao movimento de ajuste.')
        }
      } else if (goal.currentAmountCents !== previousBalance) {
        tx.fail(e, 'Alterar o saldo exige um movimento de ajuste.')
      }

      tx.applyGoal(goalRecord, goal)
      txApp.save(goalRecord)

      if (adjustment) {
        const adjustmentRecord = tx.createRecord(
          txApp,
          'savings_transactions',
          adjustment.id,
          {},
        )
        tx.applyTransaction(adjustmentRecord, adjustment)
        txApp.save(adjustmentRecord)
      }

      return goalRecord
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/savings/transactions/create',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const transaction = tx.assertTransaction(e, body.transaction, owner)
      const goalRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_goals',
        transaction.goal,
        owner,
        'Objetivo nao encontrado.',
      )
      const nextBalance =
        goalRecord.getInt('currentAmountCents') + tx.signedAmount(transaction)
      if (nextBalance < 0) {
        tx.fail(e, 'O saldo do objetivo nao pode ficar negativo.')
      }

      const transactionRecord = tx.createRecord(
        txApp,
        'savings_transactions',
        transaction.id,
        {},
      )
      tx.applyTransaction(transactionRecord, transaction)
      txApp.save(transactionRecord)

      goalRecord.set('currentAmountCents', nextBalance)
      txApp.save(goalRecord)
      return goalRecord
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/savings/transactions/update',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const transaction = tx.assertTransaction(e, body.transaction, owner)
      const transactionRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_transactions',
        transaction.id,
        owner,
        'Movimento nao encontrado.',
      )
      const originalGoalId = transactionRecord.getString('goal')
      if (transaction.goal !== originalGoalId) {
        tx.fail(e, 'Um movimento nao pode mudar de objetivo.')
      }

      const goalRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_goals',
        originalGoalId,
        owner,
        'Objetivo nao encontrado.',
      )
      const previous = {
        type: transactionRecord.getString('type'),
        amountCents: transactionRecord.getInt('amountCents'),
      }
      const nextBalance =
        goalRecord.getInt('currentAmountCents') -
        tx.signedAmount(previous) +
        tx.signedAmount(transaction)
      if (nextBalance < 0) {
        tx.fail(e, 'O saldo do objetivo nao pode ficar negativo.')
      }

      tx.applyTransaction(transactionRecord, transaction)
      txApp.save(transactionRecord)
      goalRecord.set('currentAmountCents', nextBalance)
      txApp.save(goalRecord)
      return goalRecord
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/savings/transactions/delete',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const id = tx.assertRecordId(e, body.id, 'ID do movimento')
      const transactionRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_transactions',
        id,
        owner,
        'Movimento nao encontrado.',
      )
      const goalRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_goals',
        transactionRecord.getString('goal'),
        owner,
        'Objetivo nao encontrado.',
      )
      const previous = {
        type: transactionRecord.getString('type'),
        amountCents: transactionRecord.getInt('amountCents'),
      }
      const nextBalance =
        goalRecord.getInt('currentAmountCents') - tx.signedAmount(previous)
      if (nextBalance < 0) {
        tx.fail(e, 'O saldo do objetivo nao pode ficar negativo.')
      }

      txApp.delete(transactionRecord)
      goalRecord.set('currentAmountCents', nextBalance)
      txApp.save(goalRecord)
      return goalRecord
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/savings/goals/delete',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    tx.runTransaction(e, function (txApp) {
      const id = tx.assertRecordId(e, body.id, 'ID do objetivo')
      const goalRecord = tx.findOwnedRecord(
        e,
        txApp,
        'savings_goals',
        id,
        owner,
        'Objetivo nao encontrado.',
      )
      const transactions = txApp.findRecordsByFilter(
        'savings_transactions',
        'goal = {:goal}',
        '',
        0,
        0,
        { goal: id },
      )

      for (let i = 0; i < transactions.length; i++) {
        if (transactions[i].getString('owner') !== owner) {
          tx.fail(e, 'Operacao nao autorizada.')
        }
        txApp.delete(transactions[i])
      }
      txApp.delete(goalRecord)
      return null
    })

    return e.noContent(204)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/categories/bulk-upsert',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const input = tx.requireArray(
        e,
        body.categories,
        200,
        'A lista de categorias excede o limite permitido.',
      )
      const categories = []
      const ids = {}
      const orders = {}

      for (let i = 0; i < input.length; i++) {
        const category = tx.assertCategory(e, input[i], owner)
        if (ids[category.id]) {
          tx.fail(e, 'Existem categorias repetidas.')
        }
        if (orders[String(category.order)]) {
          tx.fail(e, 'Existem ordens de categoria repetidas.')
        }
        ids[category.id] = true
        orders[String(category.order)] = true
        categories.push(category)
      }

      const existing = txApp.findRecordsByFilter(
        'categories',
        'owner = {:owner}',
        '',
        0,
        0,
        { owner: owner },
      )
      for (let i = 0; i < existing.length; i++) {
        if (!ids[existing[i].id]) {
          tx.fail(e, 'A lista tem de incluir todas as categorias existentes.')
        }
      }

      const records = []
      for (let i = 0; i < categories.length; i++) {
        const data = categories[i]
        let record = tx.findById(txApp, 'categories', data.id)
        if (record && record.getString('owner') !== owner) {
          tx.fail(e, 'Operacao nao autorizada.')
        }
        if (!record) {
          record = tx.createRecord(txApp, 'categories', data.id, {})
        }
        tx.setRecordValues(record, {
          owner: owner,
          name: data.name,
          color: data.color,
          icon: data.icon,
          order: data.order,
          archived: data.archived,
          subcategories: data.subcategories,
        })
        records.push(record)
      }

      for (let i = 0; i < records.length; i++) {
        txApp.save(records[i])
      }
      return records
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/budgets/bulk-upsert',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    const result = tx.runTransaction(e, function (txApp) {
      const input = tx.requireArray(
        e,
        body.budgets,
        500,
        'A lista de orcamentos excede o limite permitido.',
      )
      const budgets = []
      const ids = {}
      const uniqueKeys = {}

      for (let i = 0; i < input.length; i++) {
        const budget = tx.assertBudget(e, input[i], owner)
        const uniqueKey = `${budget.month}:${budget.category}`
        if (ids[budget.id] || uniqueKeys[uniqueKey]) {
          tx.fail(e, 'Existem orcamentos repetidos.')
        }
        ids[budget.id] = true
        uniqueKeys[uniqueKey] = true
        tx.assertOwnedReference(
          e,
          txApp,
          'categories',
          budget.category,
          owner,
        )
        budgets.push(budget)
      }

      const records = []
      for (let i = 0; i < budgets.length; i++) {
        const data = budgets[i]
        let record = tx.findById(txApp, 'monthly_budgets', data.id)
        if (record && record.getString('owner') !== owner) {
          tx.fail(e, 'Operacao nao autorizada.')
        }

        const sameKey = txApp.findRecordsByFilter(
          'monthly_budgets',
          'owner = {:owner} && month = {:month} && category = {:category}',
          '',
          1,
          0,
          {
            owner: owner,
            month: data.month,
            category: data.category,
          },
        )
        if (sameKey.length === 1 && sameKey[0].id !== data.id) {
          tx.fail(e, 'Ja existe um orcamento para esta categoria e mes.')
        }

        if (!record) {
          record = tx.createRecord(txApp, 'monthly_budgets', data.id, {})
        }
        tx.setRecordValues(record, {
          owner: owner,
          month: data.month,
          category: data.category,
          amountCents: data.amountCents,
        })
        records.push(record)
      }

      for (let i = 0; i < records.length; i++) {
        txApp.save(records[i])
      }
      return records
    })

    return e.json(200, result)
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/api/ondevai/series/delete',
  function (e) {
    const tx = require(`${__hooks}/transactions/common.js`)
    const owner = tx.authenticatedOwner(e)
    const body = tx.requestBody(e)
    tx.assertOwner(e, body, owner)

    tx.runTransaction(e, function (txApp) {
      const seriesType = tx.assertEnum(
        e,
        body.seriesType,
        ['expense', 'income'],
        'Tipo de serie invalido.',
      )
      const seriesId = tx.assertRecordId(e, body.seriesId, 'ID da serie')
      const collection =
        seriesType === 'expense' ? 'expenses' : 'monthly_incomes'
      const series = tx.findOwnedRecord(
        e,
        txApp,
        collection,
        seriesId,
        owner,
        'Serie nao encontrada.',
      )
      const exceptions = txApp.findRecordsByFilter(
        'recurrence_exceptions',
        'owner = {:owner} && seriesType = {:seriesType} && seriesId = {:seriesId}',
        '',
        0,
        0,
        {
          owner: owner,
          seriesType: seriesType,
          seriesId: seriesId,
        },
      )

      for (let i = 0; i < exceptions.length; i++) {
        txApp.delete(exceptions[i])
      }
      txApp.delete(series)
      return null
    })

    return e.noContent(204)
  },
  $apis.requireAuth('users'),
)
