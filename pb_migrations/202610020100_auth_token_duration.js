/// <reference path="../pb_data/types.d.ts" />

/* Keep browser sessions valid for up to 8 hours after the last auth refresh. */
migrate(
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    users.authToken.duration = 8 * 60 * 60
    app.save(users)
  },
  function (app) {
    // Keep the 8-hour limit on rollback; the previous provider value is unknown.
  },
)
