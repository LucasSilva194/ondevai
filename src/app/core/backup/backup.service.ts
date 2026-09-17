import { Injectable, inject } from '@angular/core';
import { AppBackup } from '../../models/domain.models';
import {
  CATEGORY_REPOSITORY,
  DATA_REPOSITORY,
  EXPENSE_REPOSITORY,
  INCOME_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
  SETTINGS_REPOSITORY,
} from '../repositories/repository.tokens';
import { BackupValidationResult, parseBackupContents, validateBackup } from './backup-validation';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly expenses = inject(EXPENSE_REPOSITORY);
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly incomes = inject(INCOME_REPOSITORY);
  private readonly savingsGoals = inject(SAVINGS_GOAL_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);
  private readonly data = inject(DATA_REPOSITORY);

  async exportToFile(): Promise<AppBackup> {
    const [expenses, categories, monthlyIncomes, savingsGoals, currentSettings] = await Promise.all([
      this.expenses.getAll(),
      this.categories.getAll(),
      this.incomes.getAll(),
      this.savingsGoals.getAll(),
      this.settings.get(),
    ]);
    if (!currentSettings) throw new Error('Não foi possível ler as preferências locais.');

    const exportedAt = new Date().toISOString();
    const nextSettings = { ...currentSettings, lastExportAt: exportedAt, changesSinceExport: 0 };
    const backup: AppBackup = {
      schemaVersion: 3,
      exportedAt,
      settings: nextSettings,
      categories,
      expenses,
      monthlyIncomes,
      savingsGoals,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ondevai-backup-${exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    await this.settings.put(nextSettings);
    return backup;
  }

  parse(contents: string): BackupValidationResult {
    return parseBackupContents(contents);
  }

  async importValidated(backup: AppBackup): Promise<void> {
    const validation = validateBackup(backup);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    await this.data.replaceAll(backup);
  }

  clearAll(): Promise<void> {
    return this.data.clearAll();
  }
}
