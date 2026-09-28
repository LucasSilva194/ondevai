/// <reference path="../pb_data/types.d.ts" />

/* Add PocketBase autodate fields omitted by the initial base-collection schema. */

const COLLECTION_TIMESTAMP_FALLBACKS = {
  user_settings: "strftime('%Y-%m-%d %H:%M:%fZ', 'now')",
  categories: "strftime('%Y-%m-%d %H:%M:%fZ', 'now')",
  expenses: "CASE WHEN \"date\" <> '' THEN substr(\"date\", 1, 10) || ' 00:00:00.000Z' ELSE strftime('%Y-%m-%d %H:%M:%fZ', 'now') END",
  monthly_incomes: "CASE WHEN \"date\" <> '' THEN substr(\"date\", 1, 10) || ' 00:00:00.000Z' ELSE strftime('%Y-%m-%d %H:%M:%fZ', 'now') END",
  savings_goals: "strftime('%Y-%m-%d %H:%M:%fZ', 'now')",
  savings_transactions: "CASE WHEN \"effectiveDate\" <> '' THEN substr(\"effectiveDate\", 1, 10) || ' 00:00:00.000Z' ELSE strftime('%Y-%m-%d %H:%M:%fZ', 'now') END",
  monthly_budgets: "CASE WHEN \"month\" <> '' THEN substr(\"month\", 1, 7) || '-01 00:00:00.000Z' ELSE strftime('%Y-%m-%d %H:%M:%fZ', 'now') END",
  recurrence_exceptions: "CASE WHEN \"occurrenceDate\" <> '' THEN substr(\"occurrenceDate\", 1, 10) || ' 00:00:00.000Z' ELSE strftime('%Y-%m-%d %H:%M:%fZ', 'now') END",
  data_imports: "strftime('%Y-%m-%d %H:%M:%fZ', 'now')",
}

function ensureTimestampFields(app, name) {
  const collection = app.findCollectionByNameOrId(name)

  const hasCreated = collection.fields.fieldNames().includes('created')
  const createdField = hasCreated
    ? collection.fields.getByName('created')
    : new AutodateField({ name: 'created', onCreate: true })
  if (!hasCreated) collection.fields.add(createdField)
  createdField.hidden = false
  createdField.onCreate = true
  createdField.onUpdate = false

  const hasUpdated = collection.fields.fieldNames().includes('updated')
  const updatedField = hasUpdated
    ? collection.fields.getByName('updated')
    : new AutodateField({ name: 'updated', onCreate: true, onUpdate: true })
  if (!hasUpdated) collection.fields.add(updatedField)
  updatedField.hidden = false
  updatedField.onCreate = true
  updatedField.onUpdate = true

  app.save(collection)

  const fallback = COLLECTION_TIMESTAMP_FALLBACKS[name]
  app.db().newQuery(`
    UPDATE "${name}"
    SET "created" = COALESCE(NULLIF("created", ''), ${fallback}),
        "updated" = COALESCE(NULLIF("updated", ''), ${fallback})
    WHERE "created" IS NULL OR "created" = '' OR "updated" IS NULL OR "updated" = ''
  `).execute()
}

migrate(
  function (app) {
    Object.keys(COLLECTION_TIMESTAMP_FALLBACKS).forEach((name) => ensureTimestampFields(app, name))
  },
  function (app) {
    Object.keys(COLLECTION_TIMESTAMP_FALLBACKS).forEach((name) => {
      const collection = app.findCollectionByNameOrId(name)
      collection.fields.removeByName('created')
      collection.fields.removeByName('updated')
      app.save(collection)
    })
  },
)
