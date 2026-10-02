/// <reference path="../pb_data/types.d.ts" />

migrate(
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(new TextField({ name: 'legalAcceptanceVersion', max: 20 }))
    app.save(users)
  },
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('legalAcceptanceVersion')
    app.save(users)
  },
)
