import { AppBackup } from '../../models/domain.models';

/**
 * Keeps the Wave 2 fingerprint contract: exportedAt is deliberately ignored,
 * undefined object properties are omitted and object keys are sorted with the
 * English locale. Array order remains significant.
 */
export function normalizeBackupForFingerprint(backup: AppBackup): AppBackup {
  return { ...backup, exportedAt: '' };
}

export function deterministicBackupRepresentation(backup: AppBackup): string {
  return stableStringify(normalizeBackupForFingerprint(backup));
}

export async function calculateBackupFingerprint(backup: AppBackup): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('Web Crypto não está disponível neste browser.');
  const bytes = new TextEncoder().encode(deterministicBackupRepresentation(backup));
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function backupFingerprintMatches(backup: AppBackup, expectedHash: string): Promise<boolean> {
  return (await calculateBackupFingerprint(backup)) === expectedHash.toLocaleLowerCase('en');
}

export function createBackupAttemptKey(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error('Web Crypto não está disponível neste browser.');
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, 'en'));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
