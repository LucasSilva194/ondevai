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
import { AuthService } from '../auth/auth.service';
import { BackupService } from '../backup/backup.service';
import { BackupValidationResult } from '../backup/backup-validation';
import { AppRealtimeEvent, PocketBaseRealtimeService } from '../realtime/pocketbase-realtime.service';
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

interface AppSnapshot {
  readonly expenses: Expense[];
  readonly categories: Category[];
  readonly monthlyIncomes: MonthlyIncome[];
  readonly savingsGoals: SavingsGoal[];
  readonly savingsTransactions: SavingsTransaction[];
  readonly monthlyBudgets: MonthlyBudget[];
  readonly recurrenceExceptions: RecurrenceException[];
  readonly settings: Settings;
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(PocketBaseRealtimeService);
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

  private readonly _loading = signal(false);
  private readonly _dataReady = signal(false);
  private readonly _operationPending = signal(false);
  private readonly _syncing = signal(false);
  private readonly _lastSyncedAt = signal<string | null>(null);
  private readonly _connectionError = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _expenses = signal<Expense[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _monthlyIncomes = signal<MonthlyIncome[]>([]);
  private readonly _savingsGoals = signal<SavingsGoal[]>([]);
  private readonly _savingsTransactions = signal<SavingsTransaction[]>([]);
  private readonly _monthlyBudgets = signal<MonthlyBudget[]>([]);
  private readonly _recurrenceExceptions = signal<RecurrenceException[]>([]);
  private readonly _settings = signal<Settings>({ ...DEFAULT_SETTINGS });

  private sessionGeneration = 0;
  private activeUserId: string | null = null;
  private snapshotInProgress = false;
  private queuedRealtimeEvents: AppRealtimeEvent[] = [];
  private pendingOperationCount = 0;
  private applySettingsBaseline: number | null = null;

  readonly loading = this._loading.asReadonly();
  readonly dataReady = this._dataReady.asReadonly();
  readonly operationPending = this._operationPending.asReadonly();
  readonly syncing = this._syncing.asReadonly();
  readonly lastSyncedAt = this._lastSyncedAt.asReadonly();
  readonly connectionError = this._connectionError.asReadonly();
  readonly error = this._error.asReadonly();
  readonly expenses = this._expenses.asReadonly();
  readonly categories = computed(() => [...this._categories()].sort(compareCategory));
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
    await this.loadAuthenticatedUser();
  }

  async loadAuthenticatedUser(): Promise<void> {
    const user = this.auth.user();
    if (!user || !user.verified) {
      await this.clearUserState();
      return;
    }

    const generation = ++this.sessionGeneration;
    this.prepareForSessionLoad();
    await this.realtime.stop();
    if (generation !== this.sessionGeneration) return;

    this.activeUserId = user.id;
    this.snapshotInProgress = true;
    this._loading.set(true);
    this._syncing.set(true);

    // Realtime is useful while the snapshot is loading so its events can be
    // queued, but its connection handshake must not hold the initial screen
    // behind a slow SSE connection.
    void this.startRealtimeForSession(user.id, generation);
    if (!this.isCurrentSession(user.id, generation)) {
      await this.abandonSessionLoad(generation);
      return;
    }

    try {
      const snapshot = await this.loadSnapshot();
      if (!this.isCurrentSession(user.id, generation)) {
        await this.abandonSessionLoad(generation);
        return;
      }

      this.applySnapshot(snapshot);
      for (const event of this.queuedRealtimeEvents) this.applyRealtimeEvent(event);
      this.queuedRealtimeEvents = [];
      this.snapshotInProgress = false;
      this._dataReady.set(true);
      this._lastSyncedAt.set(new Date().toISOString());
    } catch (error: unknown) {
      if (this.isCurrentSession(user.id, generation)) {
        this.snapshotInProgress = false;
        this.queuedRealtimeEvents = [];
        this.captureError(error, 'Não foi possível carregar os seus dados.');
        await this.realtime.stop();
      }
    } finally {
      if (generation === this.sessionGeneration) {
        this._loading.set(false);
        this._syncing.set(false);
      }
    }
  }

  async clearUserState(): Promise<void> {
    const generation = ++this.sessionGeneration;
    this.activeUserId = null;
    this.snapshotInProgress = false;
    this.queuedRealtimeEvents = [];
    this.pendingOperationCount = 0;
    this.resetDomainState();
    this.resetStatusState();
    await this.realtime.stop();
    if (generation === this.sessionGeneration) this._connectionError.set(null);
  }

  async startRealtime(): Promise<void> {
    const user = this.auth.user();
    if (!user || !user.verified || this.activeUserId !== user.id) {
      this._connectionError.set('É necessária uma sessão autenticada e verificada para iniciar a sincronização.');
      return;
    }
    await this.startRealtimeForSession(user.id, this.sessionGeneration);
  }

  async stopRealtime(): Promise<void> {
    await this.realtime.stop();
    this._syncing.set(false);
    this._connectionError.set(null);
  }

  async completeOnboarding(useSuggested: boolean): Promise<void> {
    await this.execute(async () => {
      if (useSuggested) await this.categoryService.useSuggestedCategories();
      const settings = await this.settingsService.setOnboardingCompleted(true);
      const categories = useSuggested ? await this.categoryRepository.getAll() : null;
      return { settings, categories };
    }, ({ settings, categories }) => {
      this._settings.set(settings);
      if (categories) this._categories.set(sortCategories(categories));
    });
  }

  async repeatOnboarding(): Promise<void> {
    await this.execute(
      () => this.settingsService.setOnboardingCompleted(false),
      (settings) => this._settings.set(settings),
    );
  }

  async saveExpense(input: ExpenseInput, id?: string): Promise<void> {
    await this.execute(
      () => id ? this.expenseService.update(id, input) : this.expenseService.create(input),
      (expense) => {
        this._expenses.update((items) => upsertAndSort(items, expense, compareExpense));
        this.markLocalChange();
      },
    );
  }

  async overrideExpenseOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    await this.execute(async () => {
      await this.expenseService.overrideOccurrence(seriesId, occurrenceDate, changes);
      return this.recurrenceExceptionRepository.getAll();
    }, (exceptions) => {
      this._recurrenceExceptions.set(exceptions);
      this.markLocalChange();
    });
  }

  async skipExpenseOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    await this.execute(async () => {
      await this.expenseService.skipOccurrence(seriesId, occurrenceDate);
      return this.recurrenceExceptionRepository.getAll();
    }, (exceptions) => {
      this._recurrenceExceptions.set(exceptions);
      this.markLocalChange();
    });
  }

  async deleteExpense(id: string): Promise<void> {
    await this.execute(() => this.expenseService.delete(id), () => {
      this._expenses.update((items) => removeById(items, id));
      this._recurrenceExceptions.update((items) => items.filter((item) => item.seriesType !== 'expense' || item.seriesId !== id));
      this.markLocalChange();
    });
  }

  async createCategory(name: string, color: string, subcategoryNames: string[]): Promise<void> {
    await this.execute(() => this.categoryService.create(name, color, subcategoryNames), (category) => {
      this._categories.update((items) => upsertAndSort(items, category, compareCategory));
      this.markLocalChange();
    });
  }

  async renameCategory(id: string, name: string, color: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.rename(id, name, color));
  }

  async archiveCategory(id: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.archive(id));
  }

  async restoreCategory(id: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.restore(id));
  }

  async addSubcategory(categoryId: string, name: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.addSubcategory(categoryId, name));
  }

  async toggleSubcategory(categoryId: string, subcategoryId: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.toggleSubcategory(categoryId, subcategoryId));
  }

  async renameSubcategory(categoryId: string, subcategoryId: string, name: string): Promise<void> {
    await this.updateCategory(() => this.categoryService.renameSubcategory(categoryId, subcategoryId, name));
  }

  async moveSubcategory(categoryId: string, subcategoryId: string, direction: -1 | 1): Promise<void> {
    await this.updateCategory(() => this.categoryService.moveSubcategory(categoryId, subcategoryId, direction));
  }

  async moveCategory(id: string, direction: -1 | 1): Promise<void> {
    await this.execute(() => this.categoryService.move(id, direction), (categories) => {
      this._categories.set(sortCategories(categories));
      this.markLocalChange();
    });
  }

  async saveIncome(input: IncomeInput, id?: string): Promise<void> {
    await this.execute(
      () => id ? this.savingsService.updateIncome(id, input) : this.savingsService.createIncome(input),
      (income) => {
        this._monthlyIncomes.update((items) => upsertAndSort(items, income, compareIncome));
        this.markLocalChange();
      },
    );
  }

  async deleteIncome(id: string): Promise<void> {
    await this.execute(() => this.savingsService.deleteIncome(id), () => {
      this._monthlyIncomes.update((items) => removeById(items, id));
      this._recurrenceExceptions.update((items) => items.filter((item) => item.seriesType !== 'income' || item.seriesId !== id));
      this.markLocalChange();
    });
  }

  async overrideIncomeOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    await this.execute(async () => {
      await this.savingsService.overrideIncomeOccurrence(seriesId, occurrenceDate, changes);
      return this.recurrenceExceptionRepository.getAll();
    }, (exceptions) => {
      this._recurrenceExceptions.set(exceptions);
      this.markLocalChange();
    });
  }

  async skipIncomeOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    await this.execute(async () => {
      await this.savingsService.skipIncomeOccurrence(seriesId, occurrenceDate);
      return this.recurrenceExceptionRepository.getAll();
    }, (exceptions) => {
      this._recurrenceExceptions.set(exceptions);
      this.markLocalChange();
    });
  }

  async saveSavingsGoal(input: SavingsGoalInput, id?: string): Promise<void> {
    await this.execute(async () => {
      const goal = id
        ? await this.savingsService.updateGoal(id, input)
        : await this.savingsService.createGoal(input);
      const transactions = await this.savingsGoalRepository.getTransactions();
      return { goal, transactions };
    }, ({ goal, transactions }) => {
      this._savingsGoals.update((items) => upsertAndSort(items, goal, compareSavingsGoal));
      this._savingsTransactions.set(sortSavingsTransactions(transactions));
      this.markLocalChange();
    });
  }

  async adjustSavingsGoal(id: string, deltaCents: number, effectiveDate?: string, note?: string): Promise<void> {
    await this.saveSavingsTransactionResult(() => this.savingsService.adjustGoal(id, deltaCents, effectiveDate, note));
  }

  async saveSavingsTransaction(goalId: string, input: SavingsTransactionInput, id?: string): Promise<void> {
    await this.saveSavingsTransactionResult(() => id
      ? this.savingsService.updateTransaction(id, goalId, input)
      : this.savingsService.createTransaction(goalId, input));
  }

  async deleteSavingsTransaction(id: string): Promise<void> {
    await this.execute(async () => {
      await this.savingsService.deleteTransaction(id);
      return this.savingsGoalRepository.getAll();
    }, (goals) => {
      this._savingsTransactions.update((items) => removeById(items, id));
      this._savingsGoals.set(sortSavingsGoals(goals));
      this.markLocalChange();
    });
  }

  async deleteSavingsGoal(id: string): Promise<void> {
    await this.execute(() => this.savingsService.deleteGoal(id), () => {
      this._savingsGoals.update((items) => removeById(items, id));
      this._savingsTransactions.update((items) => items.filter((item) => item.goalId !== id));
      this.markLocalChange();
    });
  }

  async saveBudget(input: BudgetInput, id?: string): Promise<void> {
    await this.execute(() => this.budgetService.save(input, id), (budget) => {
      this._monthlyBudgets.update((items) => upsertAndSort(items, budget, compareBudget));
      this.markLocalChange();
    });
  }

  async deleteBudget(id: string): Promise<void> {
    await this.execute(() => this.budgetService.delete(id), () => {
      this._monthlyBudgets.update((items) => removeById(items, id));
      this.markLocalChange();
    });
  }

  async copyPreviousBudget(month: string): Promise<number> {
    return this.execute(async () => {
      const copied = await this.budgetService.copyPreviousMonth(month);
      const budgets = copied > 0 ? await this.budgetRepository.getAll() : null;
      return { copied, budgets };
    }, ({ budgets }) => {
      if (budgets) {
        this._monthlyBudgets.set(sortBudgets(budgets));
        this.markLocalChange();
      }
    }).then(({ copied }) => copied);
  }

  async exportBackup(): Promise<void> {
    await this.execute(() => this.backupService.exportToFile(), (backup) => this._settings.set(backup.settings));
  }

  parseBackup(contents: string): BackupValidationResult {
    return this.backupService.parse(contents);
  }

  async importBackup(backup: AppBackup): Promise<void> {
    await this.execute(async () => {
      await this.backupService.importValidated(backup);
      return this.loadSnapshot();
    }, (snapshot) => this.applyBulkSnapshot(snapshot));
  }

  async clearAll(): Promise<void> {
    await this.execute(async () => {
      await this.backupService.clearAll();
      return this.loadSnapshot();
    }, (snapshot) => this.applyBulkSnapshot(snapshot));
  }

  clearError(): void {
    this._error.set(null);
  }

  private async startRealtimeForSession(userId: string, generation: number): Promise<void> {
    try {
      await this.realtime.start(userId, {
        onEvent: (event) => this.handleRealtimeEvent(event, userId, generation),
        onConnectionError: (message) => {
          if (this.isCurrentSession(userId, generation)) this._connectionError.set(message);
        },
      });
    } catch (error: unknown) {
      if (this.isCurrentSession(userId, generation)) {
        this._connectionError.set(connectionErrorMessage(error));
      }
    }
  }

  private handleRealtimeEvent(event: AppRealtimeEvent, userId: string, generation: number): void {
    if (!this.isCurrentSession(userId, generation) || event.owner !== userId) return;
    if (this.snapshotInProgress) {
      this.queuedRealtimeEvents.push(event);
      return;
    }

    this._syncing.set(true);
    try {
      this.applyRealtimeEvent(event);
      this._lastSyncedAt.set(new Date().toISOString());
      this._connectionError.set(null);
    } finally {
      this._syncing.set(false);
    }
  }

  private applyRealtimeEvent(event: AppRealtimeEvent): void {
    const remove = event.action === 'delete';
    switch (event.collection) {
      case 'settings':
        this._settings.set(remove ? { ...DEFAULT_SETTINGS } : event.record);
        break;
      case 'categories':
        this._categories.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareCategory));
        break;
      case 'expenses':
        this._expenses.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareExpense));
        break;
      case 'monthlyIncomes':
        this._monthlyIncomes.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareIncome));
        break;
      case 'savingsGoals':
        this._savingsGoals.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareSavingsGoal));
        if (remove) this._savingsTransactions.update((items) => items.filter((item) => item.goalId !== event.record.id));
        break;
      case 'savingsTransactions':
        this._savingsTransactions.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareSavingsTransaction));
        break;
      case 'monthlyBudgets':
        this._monthlyBudgets.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertAndSort(items, event.record, compareBudget));
        break;
      case 'recurrenceExceptions':
        this._recurrenceExceptions.update((items) => remove
          ? removeById(items, event.record.id)
          : upsertById(items, event.record));
        break;
    }
  }

  private async loadSnapshot(): Promise<AppSnapshot> {
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
    return { expenses, categories, monthlyIncomes, savingsGoals, savingsTransactions, monthlyBudgets, recurrenceExceptions, settings };
  }

  private applySnapshot(snapshot: AppSnapshot): void {
    this._expenses.set(sortExpenses(snapshot.expenses));
    this._categories.set(sortCategories(snapshot.categories));
    this._monthlyIncomes.set(sortIncomes(snapshot.monthlyIncomes));
    this._savingsGoals.set(sortSavingsGoals(snapshot.savingsGoals));
    this._savingsTransactions.set(sortSavingsTransactions(snapshot.savingsTransactions));
    this._monthlyBudgets.set(sortBudgets(snapshot.monthlyBudgets));
    this._recurrenceExceptions.set(snapshot.recurrenceExceptions);
    this._settings.set(snapshot.settings);
  }

  private applyBulkSnapshot(snapshot: AppSnapshot): void {
    this.applySnapshot(snapshot);
    this._dataReady.set(true);
    this._lastSyncedAt.set(new Date().toISOString());
    this._connectionError.set(null);
  }

  private async updateCategory(action: () => Promise<Category>): Promise<void> {
    await this.execute(action, (category) => {
      this._categories.update((items) => upsertAndSort(items, category, compareCategory));
      this.markLocalChange();
    });
  }

  private async saveSavingsTransactionResult(action: () => Promise<SavingsTransaction>): Promise<void> {
    await this.execute(async () => {
      const transaction = await action();
      const goals = await this.savingsGoalRepository.getAll();
      return { transaction, goals };
    }, ({ transaction, goals }) => {
      this._savingsTransactions.update((items) => upsertAndSort(items, transaction, compareSavingsTransaction));
      this._savingsGoals.set(sortSavingsGoals(goals));
      this.markLocalChange();
    });
  }

  private async execute<T>(action: () => Promise<T>, apply: (result: T) => void): Promise<T> {
    const generation = this.sessionGeneration;
    const userId = this.activeUserId;
    const settingsBaseline = this._settings().changesSinceExport;
    this.pendingOperationCount += 1;
    this._operationPending.set(true);
    this._error.set(null);
    try {
      const result = await action();
      if (userId && this.isCurrentSession(userId, generation)) {
        this.applySettingsBaseline = settingsBaseline;
        try {
          apply(result);
        } finally {
          this.applySettingsBaseline = null;
        }
      }
      return result;
    } catch (error: unknown) {
      if (userId && this.isCurrentSession(userId, generation)) {
        this.captureError(error, 'Ocorreu um erro ao guardar os dados.');
      }
      throw error;
    } finally {
      if (userId && this.isCurrentSession(userId, generation)) {
        this.pendingOperationCount = Math.max(0, this.pendingOperationCount - 1);
        this._operationPending.set(this.pendingOperationCount > 0);
      } else if (generation === this.sessionGeneration) {
        this.pendingOperationCount = 0;
        this._operationPending.set(false);
      }
    }
  }

  private prepareForSessionLoad(): void {
    this.activeUserId = null;
    this.snapshotInProgress = false;
    this.queuedRealtimeEvents = [];
    this.pendingOperationCount = 0;
    this.resetDomainState();
    this.resetStatusState();
    this._loading.set(true);
  }

  private async abandonSessionLoad(generation: number): Promise<void> {
    if (generation !== this.sessionGeneration) return;
    this.activeUserId = null;
    this.snapshotInProgress = false;
    this.queuedRealtimeEvents = [];
    this.resetDomainState();
    this._dataReady.set(false);
    await this.realtime.stop();
  }

  private resetDomainState(): void {
    this._expenses.set([]);
    this._categories.set([]);
    this._monthlyIncomes.set([]);
    this._savingsGoals.set([]);
    this._savingsTransactions.set([]);
    this._monthlyBudgets.set([]);
    this._recurrenceExceptions.set([]);
    this._settings.set({ ...DEFAULT_SETTINGS });
  }

  private resetStatusState(): void {
    this._loading.set(false);
    this._dataReady.set(false);
    this._operationPending.set(false);
    this._syncing.set(false);
    this._lastSyncedAt.set(null);
    this._connectionError.set(null);
    this._error.set(null);
  }

  private markLocalChange(): void {
    const expectedCount = (this.applySettingsBaseline ?? this._settings().changesSinceExport) + 1;
    this._settings.update((settings) => ({
      ...settings,
      changesSinceExport: Math.max(settings.changesSinceExport, expectedCount),
    }));
  }

  private isCurrentSession(userId: string, generation: number): boolean {
    return generation === this.sessionGeneration
      && this.activeUserId === userId
      && this.auth.user()?.id === userId;
  }

  private captureError(error: unknown, fallback: string): void {
    this._error.set(error instanceof Error ? error.message : fallback);
  }
}

function upsertById<T extends { id: string }>(items: readonly T[], item: T): T[] {
  const index = items.findIndex((current) => current.id === item.id);
  if (index < 0) return [...items, item];
  const updated = [...items];
  updated[index] = item;
  return updated;
}

function upsertAndSort<T extends { id: string }>(items: readonly T[], item: T, compare: (left: T, right: T) => number): T[] {
  return upsertById(items, item).sort(compare);
}

function removeById<T extends { id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function compareCategory(left: Category, right: Category): number {
  return left.order - right.order || left.id.localeCompare(right.id);
}

function compareExpense(left: Expense, right: Expense): number {
  return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

function compareIncome(left: MonthlyIncome, right: MonthlyIncome): number {
  return right.date.localeCompare(left.date) || left.id.localeCompare(right.id);
}

function compareSavingsGoal(left: SavingsGoal, right: SavingsGoal): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function compareSavingsTransaction(left: SavingsTransaction, right: SavingsTransaction): number {
  return right.effectiveDate.localeCompare(left.effectiveDate) || left.id.localeCompare(right.id);
}

function compareBudget(left: MonthlyBudget, right: MonthlyBudget): number {
  return right.month.localeCompare(left.month) || left.id.localeCompare(right.id);
}

function sortCategories(items: readonly Category[]): Category[] {
  return [...items].sort(compareCategory);
}

function sortExpenses(items: readonly Expense[]): Expense[] {
  return [...items].sort(compareExpense);
}

function sortIncomes(items: readonly MonthlyIncome[]): MonthlyIncome[] {
  return [...items].sort(compareIncome);
}

function sortSavingsGoals(items: readonly SavingsGoal[]): SavingsGoal[] {
  return [...items].sort(compareSavingsGoal);
}

function sortSavingsTransactions(items: readonly SavingsTransaction[]): SavingsTransaction[] {
  return [...items].sort(compareSavingsTransaction);
}

function sortBudgets(items: readonly MonthlyBudget[]): MonthlyBudget[] {
  return [...items].sort(compareBudget);
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Não foi possível iniciar a sincronização em tempo real.';
}
