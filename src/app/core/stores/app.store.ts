import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AppBackup,
  Category,
  DEFAULT_SETTINGS,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  RecurrenceExceptionChanges,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';
import { BackupService } from '../backup/backup.service';
import { BackupValidationResult } from '../backup/backup-validation';
import {
  BUDGET_REPOSITORY,
  CATEGORY_REPOSITORY,
  EXPENSE_REPOSITORY,
  INCOME_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
} from '../repositories/repository.tokens';
import { BudgetInput, BudgetService } from '../services/budget.service';
import { CategoryService } from '../services/category.service';
import { ExpenseInput, ExpenseService } from '../services/expense.service';
import { SettingsService } from '../services/settings.service';
import { IncomeInput, SavingsGoalInput, SavingsService, SavingsTransactionInput } from '../services/savings.service';

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly expenseRepository = inject(EXPENSE_REPOSITORY);
  private readonly categoryRepository = inject(CATEGORY_REPOSITORY);
  private readonly incomeRepository = inject(INCOME_REPOSITORY);
  private readonly savingsGoalRepository = inject(SAVINGS_GOAL_REPOSITORY);
  private readonly budgetRepository = inject(BUDGET_REPOSITORY);
  private readonly recurrenceExceptionRepository = inject(RECURRENCE_EXCEPTION_REPOSITORY);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(CategoryService);
  private readonly settingsService = inject(SettingsService);
  private readonly savingsService = inject(SavingsService);
  private readonly budgetService = inject(BudgetService);
  private readonly backupService = inject(BackupService);

  private readonly _loading = signal(true);
  private readonly _operationPending = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _expenses = signal<Expense[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _monthlyIncomes = signal<MonthlyIncome[]>([]);
  private readonly _savingsGoals = signal<SavingsGoal[]>([]);
  private readonly _savingsTransactions = signal<SavingsTransaction[]>([]);
  private readonly _monthlyBudgets = signal<MonthlyBudget[]>([]);
  private readonly _recurrenceExceptions = signal<RecurrenceException[]>([]);
  private readonly _settings = signal<Settings>({ ...DEFAULT_SETTINGS });

  readonly loading = this._loading.asReadonly();
  readonly operationPending = this._operationPending.asReadonly();
  readonly error = this._error.asReadonly();
  readonly expenses = this._expenses.asReadonly();
  readonly categories = computed(() => [...this._categories()].sort((a, b) => a.order - b.order));
  readonly activeCategories = computed(() => this.categories().filter((category) => !category.archived));
  readonly monthlyIncomes = this._monthlyIncomes.asReadonly();
  readonly savingsGoals = this._savingsGoals.asReadonly();
  readonly savingsTransactions = this._savingsTransactions.asReadonly();
  readonly monthlyBudgets = this._monthlyBudgets.asReadonly();
  readonly recurrenceExceptions = this._recurrenceExceptions.asReadonly();
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
    try { await this.reload(); }
    catch (error) { this.captureError(error, 'Não foi possível abrir os dados locais.'); }
    finally { this._loading.set(false); }
  }

  async completeOnboarding(useSuggested: boolean): Promise<void> {
    await this.run(async () => {
      if (useSuggested) await this.categoryService.useSuggestedCategories();
      this._settings.set(await this.settingsService.setOnboardingCompleted(true));
      await this.reload();
    });
  }

  async repeatOnboarding(): Promise<void> {
    await this.run(async () => this._settings.set(await this.settingsService.setOnboardingCompleted(false)));
  }

  async saveExpense(input: ExpenseInput, id?: string): Promise<void> {
    await this.run(async () => {
      if (id) await this.expenseService.update(id, input); else await this.expenseService.create(input);
      await this.reload();
    });
  }

  async overrideExpenseOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    await this.run(async () => {
      await this.expenseService.overrideOccurrence(seriesId, occurrenceDate, changes);
      await this.reload();
    });
  }

  async skipExpenseOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    await this.run(async () => {
      await this.expenseService.skipOccurrence(seriesId, occurrenceDate);
      await this.reload();
    });
  }

  async deleteExpense(id: string): Promise<void> {
    await this.run(async () => { await this.expenseService.delete(id); await this.reload(); });
  }

  async createCategory(name: string, color: string, subcategoryNames: string[]): Promise<void> {
    await this.run(async () => { await this.categoryService.create(name, color, subcategoryNames); await this.reload(); });
  }
  async renameCategory(id: string, name: string, color: string): Promise<void> {
    await this.run(async () => { await this.categoryService.rename(id, name, color); await this.reload(); });
  }
  async archiveCategory(id: string): Promise<void> {
    await this.run(async () => { await this.categoryService.archive(id); await this.reload(); });
  }
  async restoreCategory(id: string): Promise<void> {
    await this.run(async () => { await this.categoryService.restore(id); await this.reload(); });
  }
  async addSubcategory(categoryId: string, name: string): Promise<void> {
    await this.run(async () => { await this.categoryService.addSubcategory(categoryId, name); await this.reload(); });
  }
  async toggleSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    await this.run(async () => { await this.categoryService.toggleSubcategory(categoryId, subcategoryId); await this.reload(); });
  }
  async renameSubcategory(categoryId: string, subcategoryId: string, name: string): Promise<void> {
    await this.run(async () => { await this.categoryService.renameSubcategory(categoryId, subcategoryId, name); await this.reload(); });
  }
  async moveSubcategory(categoryId: string, subcategoryId: string, direction: -1 | 1): Promise<void> {
    await this.run(async () => { await this.categoryService.moveSubcategory(categoryId, subcategoryId, direction); await this.reload(); });
  }
  async moveCategory(id: string, direction: -1 | 1): Promise<void> {
    await this.run(async () => { await this.categoryService.move(id, direction); await this.reload(); });
  }

  async saveIncome(input: IncomeInput, id?: string): Promise<void> {
    await this.run(async () => {
      if (id) await this.savingsService.updateIncome(id, input); else await this.savingsService.createIncome(input);
      await this.reload();
    });
  }
  async deleteIncome(id: string): Promise<void> {
    await this.run(async () => { await this.savingsService.deleteIncome(id); await this.reload(); });
  }
  async overrideIncomeOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    await this.run(async () => { await this.savingsService.overrideIncomeOccurrence(seriesId, occurrenceDate, changes); await this.reload(); });
  }
  async skipIncomeOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    await this.run(async () => { await this.savingsService.skipIncomeOccurrence(seriesId, occurrenceDate); await this.reload(); });
  }

  async saveSavingsGoal(input: SavingsGoalInput, id?: string): Promise<void> {
    await this.run(async () => {
      if (id) await this.savingsService.updateGoal(id, input); else await this.savingsService.createGoal(input);
      await this.reload();
    });
  }
  async adjustSavingsGoal(id: string, deltaCents: number, effectiveDate?: string, note?: string): Promise<void> {
    await this.run(async () => { await this.savingsService.adjustGoal(id, deltaCents, effectiveDate, note); await this.reload(); });
  }
  async saveSavingsTransaction(goalId: string, input: SavingsTransactionInput, id?: string): Promise<void> {
    await this.run(async () => {
      if (id) await this.savingsService.updateTransaction(id, goalId, input);
      else await this.savingsService.createTransaction(goalId, input);
      await this.reload();
    });
  }
  async deleteSavingsTransaction(id: string): Promise<void> {
    await this.run(async () => { await this.savingsService.deleteTransaction(id); await this.reload(); });
  }
  async deleteSavingsGoal(id: string): Promise<void> {
    await this.run(async () => { await this.savingsService.deleteGoal(id); await this.reload(); });
  }

  async saveBudget(input: BudgetInput, id?: string): Promise<void> {
    await this.run(async () => { await this.budgetService.save(input, id); await this.reload(); });
  }
  async deleteBudget(id: string): Promise<void> {
    await this.run(async () => { await this.budgetService.delete(id); await this.reload(); });
  }
  async copyPreviousBudget(month: string): Promise<number> {
    let copied = 0;
    await this.run(async () => { copied = await this.budgetService.copyPreviousMonth(month); await this.reload(); });
    return copied;
  }

  async exportBackup(): Promise<void> {
    await this.run(async () => { const backup = await this.backupService.exportToFile(); this._settings.set(backup.settings); });
  }
  parseBackup(contents: string): BackupValidationResult { return this.backupService.parse(contents); }
  async importBackup(backup: AppBackup): Promise<void> {
    await this.run(async () => { await this.backupService.importValidated(backup); await this.reload(); });
  }
  async clearAll(): Promise<void> {
    await this.run(async () => { await this.backupService.clearAll(); await this.reload(); });
  }
  clearError(): void { this._error.set(null); }

  private async reload(): Promise<void> {
    const [expenses, categories, monthlyIncomes, savingsGoals, savingsTransactions, monthlyBudgets, recurrenceExceptions, settings] = await Promise.all([
      this.expenseRepository.getAll(),
      this.categoryRepository.getAll(),
      this.incomeRepository.getAll(),
      this.savingsGoalRepository.getAll(),
      this.savingsGoalRepository.getTransactions(),
      this.budgetRepository.getAll(),
      this.recurrenceExceptionRepository.getAll(),
      this.settingsService.getOrCreate(),
    ]);
    this._expenses.set(expenses);
    this._categories.set(categories);
    this._monthlyIncomes.set(monthlyIncomes);
    this._savingsGoals.set(savingsGoals);
    this._savingsTransactions.set(savingsTransactions);
    this._monthlyBudgets.set(monthlyBudgets);
    this._recurrenceExceptions.set(recurrenceExceptions);
    this._settings.set(settings);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this._operationPending.set(true);
    this._error.set(null);
    try { await action(); }
    catch (error) { this.captureError(error, 'Ocorreu um erro ao guardar os dados.'); throw error; }
    finally { this._operationPending.set(false); }
  }

  private captureError(error: unknown, fallback: string): void {
    this._error.set(error instanceof Error ? error.message : fallback);
  }
}
