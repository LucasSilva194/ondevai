/// <reference path="../pb_data/types.d.ts" />

/*
 * OndeVai - PocketBase schema inicial (Onda 1).
 *
 * Validado com PocketBase 0.40.4. Esta migration não cria utilizadores,
 * superutilizadores, tokens, credenciais ou dados da aplicação.
 */

const OWNER_READ_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id'
const OWNER_CREATE_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && @request.body.owner = @request.auth.id'
const OWNER_UPDATE_RULE =
  '@request.auth.id != "" && @request.auth.verified = true && owner = @request.auth.id && @request.body.owner:changed = false'

const CIVIL_DATE_PATTERN =
  '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
const CIVIL_MONTH_PATTERN = '^[0-9]{4}-(0[1-9]|1[0-2])$'
const HEX_COLOR_PATTERN = '^#[0-9A-Fa-f]{6}$'

function privateCollection(name, fields, indexes) {
  return new Collection({
    type: 'base',
    name: name,
    listRule: OWNER_READ_RULE,
    viewRule: OWNER_READ_RULE,
    createRule: OWNER_CREATE_RULE,
    updateRule: OWNER_UPDATE_RULE,
    deleteRule: OWNER_READ_RULE,
    fields: fields,
    indexes: indexes || [],
  })
}

function ownerField(usersId) {
  return {
    type: 'relation',
    name: 'owner',
    required: true,
    maxSelect: 1,
    collectionId: usersId,
    cascadeDelete: true,
  }
}

function positiveIntegerField(name) {
  return {
    type: 'number',
    name: name,
    required: true,
    onlyInt: true,
    min: 1,
  }
}

function nonNegativeIntegerField(name) {
  return {
    type: 'number',
    name: name,
    onlyInt: true,
    min: 0,
  }
}

function civilDateField(name, required) {
  return {
    type: 'text',
    name: name,
    required: required,
    pattern: CIVIL_DATE_PATTERN,
  }
}

migrate(
  function (app) {
    // PocketBase 0.40 inclui a auth collection `users` no bootstrap inicial.
    // Configuramo-la em vez de tentar criar uma coleção duplicada.
    const users = app.findCollectionByNameOrId('users')
    users.listRule = null
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = null
    users.authRule = 'verified = true'
    users.manageRule = null
    users.passwordAuth.enabled = true
    users.passwordAuth.identityFields = ['email']
    app.save(users)

    const userSettings = privateCollection(
      'user_settings',
      [
        ownerField(users.id),
        {
          type: 'select',
          name: 'currency',
          required: true,
          maxSelect: 1,
          values: ['EUR'],
        },
        {
          type: 'select',
          name: 'locale',
          required: true,
          maxSelect: 1,
          values: ['pt-PT'],
        },
        { type: 'bool', name: 'onboardingCompleted' },
        { type: 'date', name: 'lastExportAt' },
        nonNegativeIntegerField('changesSinceExport'),
      ],
      [
        'CREATE UNIQUE INDEX `idx_user_settings_owner` ON `user_settings` (`owner`)',
      ],
    )
    app.save(userSettings)

    const categories = privateCollection('categories', [
      ownerField(users.id),
      { type: 'text', name: 'name', required: true },
      {
        type: 'text',
        name: 'color',
        required: true,
        pattern: HEX_COLOR_PATTERN,
      },
      { type: 'text', name: 'icon' },
      nonNegativeIntegerField('order'),
      { type: 'bool', name: 'archived' },
      // JSONField considera [] um valor vazio quando `required` está ativo.
      // O domínio aceita categorias sem subcategorias, por isso fica opcional.
      { type: 'json', name: 'subcategories' },
    ])
    app.save(categories)

    const expenses = privateCollection('expenses', [
      ownerField(users.id),
      civilDateField('date', true),
      positiveIntegerField('amountCents'),
      {
        type: 'relation',
        name: 'category',
        required: true,
        maxSelect: 1,
        collectionId: categories.id,
      },
      { type: 'text', name: 'subcategoryId' },
      { type: 'text', name: 'description' },
      { type: 'json', name: 'recurrence' },
    ])
    app.save(expenses)

    const monthlyIncomes = privateCollection('monthly_incomes', [
      ownerField(users.id),
      { type: 'text', name: 'name', required: true },
      {
        type: 'select',
        name: 'kind',
        required: true,
        maxSelect: 1,
        values: ['salary', 'subsidy', 'freelance', 'other'],
      },
      positiveIntegerField('amountCents'),
      civilDateField('date', true),
      { type: 'json', name: 'recurrence' },
    ])
    app.save(monthlyIncomes)

    const savingsGoals = privateCollection('savings_goals', [
      ownerField(users.id),
      { type: 'text', name: 'name', required: true },
      {
        type: 'select',
        name: 'kind',
        required: true,
        maxSelect: 1,
        values: [
          'general',
          'reserve',
          'home',
          'car',
          'travel',
          'education',
          'other',
        ],
      },
      positiveIntegerField('targetAmountCents'),
      nonNegativeIntegerField('currentAmountCents'),
      nonNegativeIntegerField('monthlyContributionCents'),
      civilDateField('targetDate', false),
    ])
    app.save(savingsGoals)

    const savingsTransactions = privateCollection('savings_transactions', [
      ownerField(users.id),
      {
        type: 'relation',
        name: 'goal',
        required: true,
        maxSelect: 1,
        collectionId: savingsGoals.id,
        cascadeDelete: true,
      },
      {
        type: 'select',
        name: 'type',
        required: true,
        maxSelect: 1,
        values: ['opening', 'deposit', 'withdrawal'],
      },
      positiveIntegerField('amountCents'),
      civilDateField('effectiveDate', true),
      { type: 'text', name: 'note' },
    ])
    app.save(savingsTransactions)

    const monthlyBudgets = privateCollection(
      'monthly_budgets',
      [
        ownerField(users.id),
        {
          type: 'text',
          name: 'month',
          required: true,
          pattern: CIVIL_MONTH_PATTERN,
        },
        {
          type: 'relation',
          name: 'category',
          required: true,
          maxSelect: 1,
          collectionId: categories.id,
        },
        positiveIntegerField('amountCents'),
      ],
      [
        'CREATE UNIQUE INDEX `idx_monthly_budgets_owner_month_category` ON `monthly_budgets` (`owner`, `month`, `category`)',
      ],
    )
    app.save(monthlyBudgets)

    const recurrenceExceptions = privateCollection(
      'recurrence_exceptions',
      [
        ownerField(users.id),
        {
          type: 'select',
          name: 'seriesType',
          required: true,
          maxSelect: 1,
          values: ['expense', 'income'],
        },
        { type: 'text', name: 'seriesId', required: true },
        civilDateField('occurrenceDate', true),
        {
          type: 'select',
          name: 'action',
          required: true,
          maxSelect: 1,
          values: ['skip', 'override'],
        },
        { type: 'json', name: 'changes' },
      ],
      [
        'CREATE UNIQUE INDEX `idx_recurrence_exceptions_owner_series_occurrence` ON `recurrence_exceptions` (`owner`, `seriesType`, `seriesId`, `occurrenceDate`)',
      ],
    )
    app.save(recurrenceExceptions)
  },
  function (app) {
    // Ordem inversa para respeitar todas as relações entre coleções.
    const names = [
      'recurrence_exceptions',
      'monthly_budgets',
      'savings_transactions',
      'savings_goals',
      'monthly_incomes',
      'expenses',
      'categories',
      'user_settings',
    ]

    for (let i = 0; i < names.length; i++) {
      app.delete(app.findCollectionByNameOrId(names[i]))
    }

    // Repor as rules de bootstrap do PocketBase 0.40 para `users`, sem tocar
    // nos segredos dos tokens nem noutros defaults gerados pela instância.
    const users = app.findCollectionByNameOrId('users')
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    users.authRule = ''
    users.manageRule = null
    users.passwordAuth.enabled = true
    users.passwordAuth.identityFields = ['email']
    app.save(users)
  },
)
