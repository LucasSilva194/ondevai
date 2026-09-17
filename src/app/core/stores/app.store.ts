import { Injectable, computed, inject, signal } from '@angular/core';
import { AppBackup, Category, DEFAULT_SETTINGS, Expense, Settings } from '../../models/domain.models';
import { BackupService } from '../backup/backup.service';
import { BackupValidationResult } from '../backup/backup-validation';
import { CATEGORY_REPOSITORY, EXPENSE_REPOSITORY } from '../repositories/repository.tokens';
import { CategoryService } from '../services/category.service';
import { ExpenseInput, ExpenseService } from '../services/expense.service';
import { SettingsService } from '../services/settings.service';

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly expenseRepository = inject(EXPENSE_REPOSITORY);
  private readonly categoryRepository = inject(CATEGORY_REPOSITORY);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(CategoryService);
  private readonly settingsService = inject(SettingsService);
  private readonly backupService = inject(BackupService);

  private readonly _loading = signal(true);
  private readonly _operationPending = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _expenses = signal<Expense[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _settings = signal<Settings>({ ...DEFAULT_SETTINGS });

  readonly loading = this._loading.asReadonly();
  readonly operationPending = this._operationPending.asReadonly();
  readonly error = this._error.asReadonly();
  readonly expenses = this._expenses.asReadonly();
  readonly categories = computed(() => [...this._categories()].sort((a, b) => a.order - b.order));
  readonly activeCategories = computed(() => this.categories().filter((category) => !category.archived));
  readonly settings = this._settings.asReadonly();
  readonly shouldRemindBackup = computed(() => {
    const settings = this._settings();
    if (!settings.onboardingCompleted) return false;
    if (!settings.lastExportAt) return true;
    const elapsedDays = (Date.now() - Date.parse(settings.lastExportAt)) / 86_400_000;
    return elapsedDays >= 30 || settings.changesSinceExport >= 25;
  });

  async initialize(): Promise<void> {
    this._loading.set(true);
    try {
      await this.reload();
    } catch (error) {
      this.captureError(error, 'Não foi possível abrir os dados locais.');
    } finally {
      this._loading.set(false);
    }
  }

  async completeOnboarding(useSuggested: boolean): Promise<void> {
    await this.run(async () => {
      if (useSuggested) await this.categoryService.useSuggestedCategories();
      this._settings.set(await this.settingsService.setOnboardingCompleted(true));
      this._categories.set(await this.categoryRepository.getAll());
    });
  }

  async repeatOnboarding(): Promise<void> {
    await this.run(async () => this._settings.set(await this.settingsService.setOnboardingCompleted(false)));
  }

  async saveExpense(input: ExpenseInput, id?: string): Promise<void> {
    await this.run(async () => {
      if (id) await this.expenseService.update(id, input);
      else await this.expenseService.create(input);
      await this.refreshExpensesAndSettings();
    });
  }

  async deleteExpense(id: string): Promise<void> {
    await this.run(async () => {
      await this.expenseService.delete(id);
      await this.refreshExpensesAndSettings();
    });
  }

  async createCategory(name: string, color: string, subcategoryNames: string[]): Promise<void> {
    await this.run(async () => {
      await this.categoryService.create(name, color, subcategoryNames);
      await this.refreshCategoriesAndSettings();
    });
  }

  async renameCategory(id: string, name: string, color: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.rename(id, name, color);
      await this.refreshCategoriesAndSettings();
    });
  }

  async archiveCategory(id: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.archive(id);
      await this.refreshCategoriesAndSettings();
    });
  }

  async restoreCategory(id: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.restore(id);
      await this.refreshCategoriesAndSettings();
    });
  }

  async addSubcategory(categoryId: string, name: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.addSubcategory(categoryId, name);
      await this.refreshCategoriesAndSettings();
    });
  }

  async toggleSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.toggleSubcategory(categoryId, subcategoryId);
      await this.refreshCategoriesAndSettings();
    });
  }

  async renameSubcategory(categoryId: string, subcategoryId: string, name: string): Promise<void> {
    await this.run(async () => {
      await this.categoryService.renameSubcategory(categoryId, subcategoryId, name);
      await this.refreshCategoriesAndSettings();
    });
  }

  async moveSubcategory(categoryId: string, subcategoryId: string, direction: -1 | 1): Promise<void> {
    await this.run(async () => {
      await this.categoryService.moveSubcategory(categoryId, subcategoryId, direction);
      await this.refreshCategoriesAndSettings();
    });
  }

  async moveCategory(id: string, direction: -1 | 1): Promise<void> {
    await this.run(async () => {
      await this.categoryService.move(id, direction);
      await this.refreshCategoriesAndSettings();
    });
  }

  async exportBackup(): Promise<void> {
    await this.run(async () => {
      const backup = await this.backupService.exportToFile();
      this._settings.set(backup.settings);
    });
  }

  parseBackup(contents: string): BackupValidationResult {
    return this.backupService.parse(contents);
  }

  async importBackup(backup: AppBackup): Promise<void> {
    await this.run(async () => {
      await this.backupService.importValidated(backup);
      await this.reload();
    });
  }

  async clearAll(): Promise<void> {
    await this.run(async () => {
      await this.backupService.clearAll();
      await this.reload();
    });
  }

  clearError(): void {
    this._error.set(null);
  }

  private async reload(): Promise<void> {
    const [expenses, categories, settings] = await Promise.all([
      this.expenseRepository.getAll(),
      this.categoryRepository.getAll(),
      this.settingsService.getOrCreate(),
    ]);
    this._expenses.set(expenses);
    this._categories.set(categories);
    this._settings.set(settings);
  }

  private async refreshExpensesAndSettings(): Promise<void> {
    const [expenses, settings] = await Promise.all([
      this.expenseRepository.getAll(),
      this.settingsService.getOrCreate(),
    ]);
    this._expenses.set(expenses);
    this._settings.set(settings);
  }

  private async refreshCategoriesAndSettings(): Promise<void> {
    const [categories, settings] = await Promise.all([
      this.categoryRepository.getAll(),
      this.settingsService.getOrCreate(),
    ]);
    this._categories.set(categories);
    this._settings.set(settings);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this._operationPending.set(true);
    this._error.set(null);
    try {
      await action();
    } catch (error) {
      this.captureError(error, 'Ocorreu um erro ao guardar os dados.');
      throw error;
    } finally {
      this._operationPending.set(false);
    }
  }

  private captureError(error: unknown, fallback: string): void {
    this._error.set(error instanceof Error ? error.message : fallback);
  }
}
