/// <reference path="../pb_data/types.d.ts" />

/* Optional text metadata for merchant and reusable user tags on expenses. */
migrate(
  function (app) {
    const expenses = app.findCollectionByNameOrId('expenses')
    if (!expenses.fields.fieldNames().includes('merchant')) {
      expenses.fields.add(new TextField({ name: 'merchant', max: 100 }))
    }
    if (!expenses.fields.fieldNames().includes('tags')) {
      expenses.fields.add(new JSONField({ name: 'tags' }))
    }
    app.save(expenses)
  },
  function (app) {
    const expenses = app.findCollectionByNameOrId('expenses')
    expenses.fields.removeByName('merchant')
    expenses.fields.removeByName('tags')
    app.save(expenses)
  },
)
