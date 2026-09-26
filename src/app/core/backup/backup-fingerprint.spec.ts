import { describe, expect, it } from 'vitest';
import { AppBackup } from '../../models/domain.models';
import {
  backupFingerprintMatches,
  calculateBackupFingerprint,
  createBackupAttemptKey,
  deterministicBackupRepresentation,
  normalizeBackupForFingerprint,
} from './backup-fingerprint';

const backup: AppBackup = {
  schemaVersion: 4,
  exportedAt: '2026-09-25T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: false, changesSinceExport: 0 },
  categories: [],
  expenses: [],
  monthlyIncomes: [],
  savingsGoals: [],
  savingsTransactions: [],
  monthlyBudgets: [],
  recurrenceExceptions: [],
};

describe('backup fingerprint', () => {
  it('mantém o contrato da Onda 2 e ignora apenas exportedAt', async () => {
    const changedDate = { ...backup, exportedAt: '2030-01-01T00:00:00.000Z' };
    expect(normalizeBackupForFingerprint(backup).exportedAt).toBe('');
    expect(deterministicBackupRepresentation(changedDate)).toBe(deterministicBackupRepresentation(backup));
    expect(await calculateBackupFingerprint(changedDate)).toBe(await calculateBackupFingerprint(backup));
  });

  it('gera SHA-256 hex verificável e chaves de tentativa opacas', async () => {
    const hash = await calculateBackupFingerprint(backup);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(backupFingerprintMatches(backup, hash.toUpperCase())).resolves.toBe(true);
    await expect(backupFingerprintMatches({ ...backup, settings: { ...backup.settings, onboardingCompleted: true } }, hash)).resolves.toBe(false);
    expect(createBackupAttemptKey()).toMatch(/^[a-f0-9-]{36}$/);
  });
});
