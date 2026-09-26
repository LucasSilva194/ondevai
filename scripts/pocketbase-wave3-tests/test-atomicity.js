'use strict'

const assert = require('node:assert/strict')
const operations = require('../../pb_hooks/data/operations.js')
const validation = require('../../pb_hooks/data/validation.js')
const fixtures = require('./fixtures.js')

function apiError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const eventErrors = {
  badRequestError(message) {
    return apiError(400, message)
  },
  error(status, message) {
    return apiError(status, message)
  },
  internalServerError(message) {
    return apiError(500, message)
  },
}

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = collection
    this.values = { ...values }
  }

  set(key, value) {
    this.values[key] = structuredClone(value)
  }

  get(key) {
    return structuredClone(this.values[key])
  }

  getString(key) {
    const value = this.values[key]
    return typeof value === 'string' ? value : ''
  }
}

global.Record = FakeRecord

class FakeTransactionApp {
  constructor(records, failure) {
    this.records = records
    this.failure = failure
    this.deleteCount = 0
    this.saveCount = 0
  }

  findCollectionByNameOrId(name) {
    return { name }
  }

  findRecordsByFilter(collection, filter, _sort, maximum, _offset, params = {}) {
    let records = this.records[collection] ?? []
    if (filter.includes('owner = {:owner}')) {
      records = records.filter((record) => record.getString('owner') === params.owner)
    }
    if (filter.includes('idempotencyKey = {:key}')) {
      records = records.filter((record) => record.getString('idempotencyKey') === params.key)
    }
    if (filter.includes('id = {:id}')) {
      records = records.filter((record) => record.getString('id') === params.id)
    }
    return maximum > 0 ? records.slice(0, maximum) : [...records]
  }

  delete(record) {
    this.deleteCount += 1
    if (this.failure.type === 'delete' && this.deleteCount === this.failure.at) {
      throw new Error('falha injetada durante delete')
    }
    const collection = record.collection.name
    this.records[collection] = this.records[collection].filter((item) => item !== record)
  }

  save(record) {
    this.saveCount += 1
    if (this.failure.type === 'insert' && this.saveCount === this.failure.at) {
      throw new Error('falha injetada durante insert')
    }
    if (this.failure.type === 'metadata' && record.collection.name === 'data_imports') {
      throw new Error('falha injetada durante metadata')
    }
    const collection = record.collection.name
    this.records[collection] = this.records[collection] ?? []
    const existing = this.records[collection].findIndex((item) => item.getString('id') === record.getString('id'))
    if (existing >= 0) this.records[collection][existing] = record
    else this.records[collection].push(record)
  }
}

class FakeTransactionalDatabase {
  constructor(owner, failure) {
    this.failure = failure
    this.records = {}
    for (const collection of [...operations.DELETE_ORDER, 'data_imports']) {
      this.records[collection] = []
    }
    for (const collection of operations.DELETE_ORDER) {
      this.records[collection].push(new FakeRecord(
        { name: collection },
        { id: `old-${collection}`, owner, marker: 'estado-anterior' },
      ))
    }
  }

  runInTransaction(callback) {
    const cloned = {}
    for (const [collection, records] of Object.entries(this.records)) {
      cloned[collection] = records.map((record) => new FakeRecord(
        { name: collection },
        structuredClone(record.values),
      ))
    }
    const tx = new FakeTransactionApp(cloned, this.failure)
    const result = callback(tx)
    this.records = cloned
    return result
  }

  snapshot() {
    const result = {}
    for (const collection of Object.keys(this.records).sort()) {
      result[collection] = this.records[collection].map((record) => structuredClone(record.values))
    }
    return result
  }
}

function createEvent(database) {
  return {
    ...eventErrors,
    app: database,
  }
}

function deterministicId() {
  deterministicId.counter += 1
  return `i${String(deterministicId.counter).padStart(14, '0')}`
}
deterministicId.counter = 0

const owner = 'user00000000001'
const backup = fixtures.createBackup('a')
const request = validation.validateImportRequest(eventErrors, fixtures.importRequest(backup, 'replace'))

for (const failure of [
  { type: 'delete', at: 2, label: 'delete' },
  { type: 'insert', at: 3, label: 'insert' },
  { type: 'metadata', at: 0, label: 'data_imports' },
]) {
  deterministicId.counter = 0
  const database = new FakeTransactionalDatabase(owner, failure)
  const before = database.snapshot()
  assert.throws(
    () => operations.replaceAll(createEvent(database), owner, request, deterministicId),
    (error) => error.status === 400,
    `falha durante ${failure.label} deve abortar a transação`,
  )
  assert.deepEqual(database.snapshot(), before, `falha durante ${failure.label} deixou estado parcial`)
  assert.equal(database.records.data_imports.length, 0, `falha durante ${failure.label} deixou metadata parcial`)
}

console.log('OK: fault injection de delete, insert e data_imports preserva integralmente o estado anterior.')
