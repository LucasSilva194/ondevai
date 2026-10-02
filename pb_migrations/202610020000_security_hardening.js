/// <reference path="../pb_data/types.d.ts" />

/* Bound user fields and prepare email OTP without requiring it before SMTP works. */
migrate(
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    // TODO: Enable MFA/OTP after PocketHost email delivery has been configured and verified.
    users.mfa.enabled = false
    users.mfa.duration = 180
    users.otp.enabled = false
    users.otp.duration = 300
    users.otp.length = 6
    app.save(users)

    const limits = {
      categories: { name: 80, icon: 64 },
      expenses: { subcategoryId: 64, description: 140, merchant: 100 },
      monthly_incomes: { name: 80 },
      savings_goals: { name: 80 },
      savings_transactions: { note: 180 },
      recurrence_exceptions: { seriesId: 64 },
    }
    Object.keys(limits).forEach((collectionName) => {
      const collection = app.findCollectionByNameOrId(collectionName)
      const fields = limits[collectionName]
      Object.keys(fields).forEach((fieldName) => {
        const field = collection.fields.getByName(fieldName)
        if (field) field.max = fields[fieldName]
      })
      app.save(collection)
    })

    const settings = app.settings()
    const rateLimits = settings.rateLimits.rules || []
    settings.rateLimits.rules = [
      { label: '/api/ondevai/data/', audience: '', duration: 60, maxRequests: 5 },
      { label: '/api/ondevai/account/', audience: '', duration: 60, maxRequests: 5 },
      { label: '*:auth', audience: '', duration: 60, maxRequests: 10 },
      ...rateLimits.filter((rule) => !['/api/ondevai/data/', '/api/ondevai/account/', '*:auth'].includes(rule.label)),
    ]
    settings.rateLimits.enabled = true
    settings.logs.maxDays = 30
    settings.logs.logIP = true
    settings.logs.logAuthId = true
    app.save(settings)
  },
  function (app) {
    const users = app.findCollectionByNameOrId('users')
    users.mfa = { ...users.mfa, enabled: false }
    users.otp = { ...users.otp, enabled: false }
    app.save(users)
    // Keep the abuse limits and audit retention enabled after a rollback.
  },
)
