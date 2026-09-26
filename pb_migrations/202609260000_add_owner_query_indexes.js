/// <reference path="../pb_data/types.d.ts" />

/* Index owner filters used by the client when it loads a user's snapshot. */

const OWNER_INDEXES = {
  categories: 'CREATE INDEX `idx_categories_owner` ON `categories` (`owner`)',
  expenses: 'CREATE INDEX `idx_expenses_owner` ON `expenses` (`owner`)',
  monthly_incomes: 'CREATE INDEX `idx_monthly_incomes_owner` ON `monthly_incomes` (`owner`)',
  savings_goals: 'CREATE INDEX `idx_savings_goals_owner` ON `savings_goals` (`owner`)',
  savings_transactions: 'CREATE INDEX `idx_savings_transactions_owner` ON `savings_transactions` (`owner`)',
}

migrate(
  function (app) {
    Object.keys(OWNER_INDEXES).forEach((name) => {
      const collection = app.findCollectionByNameOrId(name)
      collection.indexes = [...(collection.indexes || []), OWNER_INDEXES[name]]
      app.save(collection)
    })
  },
  function (app) {
    Object.keys(OWNER_INDEXES).forEach((name) => {
      const collection = app.findCollectionByNameOrId(name)
      collection.indexes = (collection.indexes || []).filter((index) => index !== OWNER_INDEXES[name])
      app.save(collection)
    })
  },
)
