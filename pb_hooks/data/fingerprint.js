/*
 * Fingerprint partilhado com a Onda 2.
 *
 * O modulo nao referencia APIs Node.js. O SHA-256 e injetado pelo handler
 * (`$security.sha256` no JSVM), o que permite testar a representacao
 * deterministica fora do PocketBase sem duplicar o algoritmo.
 */

function normalizeBackupForFingerprint(backup) {
  const normalized = {}
  const keys = Object.keys(backup)
  for (let i = 0; i < keys.length; i++) {
    normalized[keys[i]] = backup[keys[i]]
  }
  normalized.exportedAt = ''
  return normalized
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter(function (key) {
        return value[key] !== undefined
      })
      .sort(function (left, right) {
        return left.localeCompare(right, 'en')
      })
    const parts = []
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i]
      parts.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`)
    }
    return `{${parts.join(',')}}`
  }

  return JSON.stringify(value)
}

function deterministicBackupRepresentation(backup) {
  return stableStringify(normalizeBackupForFingerprint(backup))
}

function calculateBackupFingerprint(backup, sha256) {
  if (typeof sha256 !== 'function') {
    throw new Error('Funcao SHA-256 em falta.')
  }
  return sha256(deterministicBackupRepresentation(backup))
}

module.exports = {
  calculateBackupFingerprint: calculateBackupFingerprint,
  deterministicBackupRepresentation: deterministicBackupRepresentation,
  normalizeBackupForFingerprint: normalizeBackupForFingerprint,
  stableStringify: stableStringify,
}
