/// <reference path="../pb_data/types.d.ts" />

/*
 * Onda 3: metadata operacional de importacoes concluídas.
 *
 * Todas as API rules ficam null para bloquear Records API publica. A relacao
 * owner usa cascadeDelete para a metadata desaparecer com a conta, mas
 * clear-all preserva deliberadamente esta collection.
 */

migrate(
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    const collection = new Collection({
      type: 'base',
      name: 'data_imports',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'owner',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          type: 'text',
          name: 'idempotencyKey',
          required: true,
          min: 8,
          max: 200,
        },
        {
          type: 'text',
          name: 'snapshotHash',
          required: true,
          pattern: '^[0-9a-f]{64}$',
        },
        {
          type: 'select',
          name: 'mode',
          required: true,
          maxSelect: 1,
          values: ['migrate-empty', 'replace'],
        },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['completed'],
        },
        { type: 'json', name: 'counts', required: true },
        { type: 'date', name: 'completedAt', required: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_data_imports_owner_key` ON `data_imports` (`owner`, `idempotencyKey`)',
        'CREATE INDEX `idx_data_imports_owner_hash` ON `data_imports` (`owner`, `snapshotHash`)',
      ],
    })
    app.save(collection)
  },
  function (app) {
    app.delete(app.findCollectionByNameOrId('data_imports'))
  },
)
