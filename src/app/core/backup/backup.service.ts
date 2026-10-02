import { Injectable, inject } from '@angular/core';
import { AppBackup } from '../../models/domain.models';
import {
  BUDGET_REPOSITORY,
  CATEGORY_REPOSITORY,
  DATA_REPOSITORY,
  EXPENSE_REPOSITORY,
  INCOME_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
  SETTINGS_REPOSITORY,
} from '../repositories/repository.tokens';
import { BackupValidationResult, parseBackupContents, validateBackup } from './backup-validation';

const ENCRYPTED_BACKUP_FORMAT = 'ondevai-encrypted-backup';
const BACKUP_KDF_ITERATIONS = 310_000;

interface EncryptedBackup {
  readonly format: typeof ENCRYPTED_BACKUP_FORMAT;
  readonly version: 1;
  readonly iterations: number;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly expenses = inject(EXPENSE_REPOSITORY);
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly incomes = inject(INCOME_REPOSITORY);
  private readonly savingsGoals = inject(SAVINGS_GOAL_REPOSITORY);
  private readonly budgets = inject(BUDGET_REPOSITORY);
  private readonly recurrenceExceptions = inject(RECURRENCE_EXCEPTION_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);
  private readonly data = inject(DATA_REPOSITORY);

  async exportToFile(passphrase: string): Promise<AppBackup> {
    const [expenses, categories, monthlyIncomes, savingsGoals, savingsTransactions, monthlyBudgets, recurrenceExceptions, currentSettings] = await Promise.all([
      this.expenses.getAll(),
      this.categories.getAll(),
      this.incomes.getAll(),
      this.savingsGoals.getAll(),
      this.savingsGoals.getTransactions(),
      this.budgets.getAll(),
      this.recurrenceExceptions.getAll(),
      this.settings.get(),
    ]);
    if (!currentSettings) throw new Error('Não foi possível ler as preferências locais.');

    const exportedAt = new Date().toISOString();
    const nextSettings = { ...currentSettings, lastExportAt: exportedAt, changesSinceExport: 0 };
    const backup: AppBackup = {
      schemaVersion: 5,
      exportedAt,
      settings: nextSettings,
      categories,
      expenses,
      monthlyIncomes,
      savingsGoals,
      savingsTransactions,
      monthlyBudgets,
      recurrenceExceptions,
    };
    const blob = new Blob([await encryptBackup(JSON.stringify(backup, null, 2), passphrase)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ondevai-backup-${exportedAt.slice(0, 10)}.ondevai.json`;
    link.click();
    URL.revokeObjectURL(url);
    await this.settings.put(nextSettings);
    return backup;
  }

  isEncryptedBackup(contents: string): boolean {
    try {
      return isEncryptedEnvelope(JSON.parse(contents) as unknown);
    } catch {
      return false;
    }
  }

  async parse(contents: string, passphrase?: string): Promise<BackupValidationResult> {
    if (!this.isEncryptedBackup(contents)) return parseBackupContents(contents);
    if (!passphrase) return { valid: false, errors: ['Indique a senha da cópia de segurança.'] };
    try {
      return parseBackupContents(await decryptBackup(JSON.parse(contents) as EncryptedBackup, passphrase));
    } catch {
      return { valid: false, errors: ['A senha está incorreta ou a cópia de segurança está danificada.'] };
    }
  }

  async importValidated(backup: AppBackup): Promise<void> {
    const validation = validateBackup(backup);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    await this.data.replaceAll(validation.backup);
  }

  clearAll(): Promise<void> { return this.data.clearAll(); }
}

async function encryptBackup(contents: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(contents));
  return JSON.stringify({
    format: ENCRYPTED_BACKUP_FORMAT,
    version: 1,
    iterations: BACKUP_KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  } satisfies EncryptedBackup, null, 2);
}

async function decryptBackup(envelope: EncryptedBackup, passphrase: string): Promise<string> {
  if (!isEncryptedEnvelope(envelope) || envelope.iterations !== BACKUP_KDF_ITERATIONS) {
    throw new Error('Unsupported encrypted backup.');
  }
  const key = await deriveKey(passphrase, fromBase64(envelope.salt));
  const cleartext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(cleartext);
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: BACKUP_KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function isEncryptedEnvelope(value: unknown): value is EncryptedBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record['format'] === ENCRYPTED_BACKUP_FORMAT
    && record['version'] === 1
    && record['iterations'] === BACKUP_KDF_ITERATIONS
    && typeof record['salt'] === 'string'
    && typeof record['iv'] === 'string'
    && typeof record['ciphertext'] === 'string';
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
