/// <reference path="../../pb_data/types.d.ts" />

/*
 * PocketBase pode visitar as owner relations numa ordem em que `categories`
 * ainda tenha referências obrigatórias de expenses/budgets (e `savings_goals`
 * de transactions). Apagamos os dependentes numa ordem topológica antes de
 * continuar a eliminação administrativa/interna do utilizador.
 *
 * Isto não expõe um endpoint de eliminação de conta: a users.deleteRule
 * continua bloqueada. O handler também corre dentro da app/transaction do
 * evento e não usa APIs Node.js.
 */
onRecordDelete(
  function (e) {
    if (!e.record) {
      return e.next()
    }

    const owner = e.record.getString('id')
    const deletionOrder = [
      'recurrence_exceptions',
      'monthly_budgets',
      'savings_transactions',
      'expenses',
      'monthly_incomes',
      'savings_goals',
      'categories',
      'user_settings',
    ]

    for (let i = 0; i < deletionOrder.length; i++) {
      const records = e.app.findRecordsByFilter(
        deletionOrder[i],
        'owner = {:owner}',
        '',
        0,
        0,
        { owner: owner },
      )

      for (let j = 0; j < records.length; j++) {
        e.app.delete(records[j])
      }
    }

    e.next()
  },
  'users',
)
