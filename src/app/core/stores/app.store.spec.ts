import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Category,
  DEFAULT_SETTINGS,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';
import { AuthService, AuthUser } from '../auth/auth.service';
import { BackupService } from '../backup/backup.service';
import { AppRealtimeEvent, AppRealtimeHandlers, PocketBaseRealtimeService } from '../realtime/pocketbase-realtime.service';
import {
  BUDGET_REPOSITORY,
  CATEGORY_REPOSITORY,
  EXPENSE_REPOSITORY,
  INCOME_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
} from '../repositories/repository.tokens';
import { BudgetService } from '../services/budget.service';
import { CategoryService } from '../services/category.service';
import { ExpenseService } from '../services/expense.service';
import { SavingsService } from '../services/savings.service';
import { SettingsService } from '../services/settings.service';
import { AppStore } from './app.store';

const userOne: AuthUser = { id: 'user12345678901', email: 'um@example.com', verified: true };
const userTwo: AuthUser = { id: 'user23456789012', email: 'dois@example.com', verified: true };
const timestamp = '2026-09-25T10:00:00.000Z';

function expense(id: string, amountCents = 1000): Expense {
  return { id, date: '2026-09-25', amountCents, categoryId: 'category1234567', createdAt: timestamp, updatedAt: timestamp };
}

function goal(currentAmountCents = 0): SavingsGoal {
  return {
    id: 'goal12345678901',
    name: 'Reserva',
    kind: 'reserve',
    targetAmountCents: 100000,
    currentAmountCents,
    monthlyContributionCents: 5000,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function transaction(): SavingsTransaction {
  return {
    id: 'trans1234567890',
    goalId: 'goal12345678901',
    type: 'deposit',
    amountCents: 1000,
    effectiveDate: '2026-09-25',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

class FakeRealtimeService {
  readonly sessions: Array<{ userId: string; handlers: AppRealtimeHandlers }> = [];
  readonly start = vi.fn(async (userId: string, handlers: AppRealtimeHandlers) => {
    this.sessions.push({ userId, handlers });
  });
  readonly stop = vi.fn(async () => undefined);

  emit(event: AppRealtimeEvent, sessionIndex = this.sessions.length - 1): void {
    this.sessions[sessionIndex]?.handlers.onEvent(event);
  }

  fail(message: string, sessionIndex = this.sessions.length - 1): void {
    this.sessions[sessionIndex]?.handlers.onConnectionError(message);
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

describe('AppStore incremental e realtime', () => {
  let authUser: ReturnType<typeof signal<AuthUser | null>>;
  let realtime: FakeRealtimeService;
  let expenses: Expense[];
  let categories: Category[];
  let incomes: MonthlyIncome[];
  let goals: SavingsGoal[];
  let transactions: SavingsTransaction[];
  let budgets: MonthlyBudget[];
  let exceptions: RecurrenceException[];
  let settings: Settings;
  let expenseRepository: { getAll: ReturnType<typeof vi.fn> };
  let categoryRepository: { getAll: ReturnType<typeof vi.fn> };
  let incomeRepository: { getAll: ReturnType<typeof vi.fn> };
  let goalRepository: { getAll: ReturnType<typeof vi.fn>; getTransactions: ReturnType<typeof vi.fn> };
  let budgetRepository: { getAll: ReturnType<typeof vi.fn> };
  let exceptionRepository: { getAll: ReturnType<typeof vi.fn> };
  let expenseService: Record<string, ReturnType<typeof vi.fn>>;
  let savingsService: Record<string, ReturnType<typeof vi.fn>>;
  let store: AppStore;
  let backupService: { exportToFile: ReturnType<typeof vi.fn>; parse: ReturnType<typeof vi.fn>; importValidated: ReturnType<typeof vi.fn>; clearAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authUser = signal<AuthUser | null>(userOne);
    realtime = new FakeRealtimeService();
    expenses = [];
    categories = [];
    incomes = [];
    goals = [];
    transactions = [];
    budgets = [];
    exceptions = [];
    settings = { ...DEFAULT_SETTINGS, onboardingCompleted: true };

    expenseRepository = { getAll: vi.fn(async () => expenses) };
    categoryRepository = { getAll: vi.fn(async () => categories) };
    incomeRepository = { getAll: vi.fn(async () => incomes) };
    goalRepository = {
      getAll: vi.fn(async () => goals),
      getTransactions: vi.fn(async () => transactions),
    };
    budgetRepository = { getAll: vi.fn(async () => budgets) };
    exceptionRepository = { getAll: vi.fn(async () => exceptions) };

    expenseService = {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      overrideOccurrence: vi.fn().mockResolvedValue(undefined),
      skipOccurrence: vi.fn().mockResolvedValue(undefined),
    };
    savingsService = {
      createIncome: vi.fn(),
      updateIncome: vi.fn(),
      deleteIncome: vi.fn().mockResolvedValue(undefined),
      overrideIncomeOccurrence: vi.fn().mockResolvedValue(undefined),
      skipIncomeOccurrence: vi.fn().mockResolvedValue(undefined),
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      adjustGoal: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
      deleteGoal: vi.fn().mockResolvedValue(undefined),
    };

    const categoryService = {
      useSuggestedCategories: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(), rename: vi.fn(), archive: vi.fn(), restore: vi.fn(),
      addSubcategory: vi.fn(), toggleSubcategory: vi.fn(), renameSubcategory: vi.fn(),
      moveSubcategory: vi.fn(), move: vi.fn(),
    };
    const budgetService = {
      save: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      copyPreviousMonth: vi.fn().mockResolvedValue(0),
    };
    const settingsService = {
      getOrCreate: vi.fn(async () => settings),
      setOnboardingCompleted: vi.fn(async (completed: boolean) => ({ ...settings, onboardingCompleted: completed })),
    };
    backupService = {
      exportToFile: vi.fn(), parse: vi.fn(), importValidated: vi.fn(), clearAll: vi.fn(),
    };

    TestBed.configureTestingModule({ providers: [
      AppStore,
      { provide: AuthService, useValue: { user: authUser.asReadonly() } },
      { provide: PocketBaseRealtimeService, useValue: realtime },
      { provide: EXPENSE_REPOSITORY, useValue: expenseRepository },
      { provide: CATEGORY_REPOSITORY, useValue: categoryRepository },
      { provide: INCOME_REPOSITORY, useValue: incomeRepository },
      { provide: SAVINGS_GOAL_REPOSITORY, useValue: goalRepository },
      { provide: BUDGET_REPOSITORY, useValue: budgetRepository },
      { provide: RECURRENCE_EXCEPTION_REPOSITORY, useValue: exceptionRepository },
      { provide: ExpenseService, useValue: expenseService },
      { provide: CategoryService, useValue: categoryService },
      { provide: SavingsService, useValue: savingsService },
      { provide: BudgetService, useValue: budgetService },
      { provide: SettingsService, useValue: settingsService },
      { provide: BackupService, useValue: backupService },
    ] });
    store = TestBed.inject(AppStore);
  });

  it('não consulta repositórios privados sem autenticação verificada', async () => {
    authUser.set(null);

    await store.loadAuthenticatedUser();

    expect(expenseRepository.getAll).not.toHaveBeenCalled();
    expect(categoryRepository.getAll).not.toHaveBeenCalled();
    expect(realtime.start).not.toHaveBeenCalled();
    expect(store.dataReady()).toBe(false);
  });

  it('carrega o snapshot inicial e expõe os novos sinais de estado', async () => {
    expenses = [expense('expense12345678')];
    goals = [goal()];

    await store.initialize();

    expect(store.expenses()).toEqual(expenses);
    expect(store.savingsGoals()).toEqual(goals);
    expect(store.loading()).toBe(false);
    expect(store.dataReady()).toBe(true);
    expect(store.syncing()).toBe(false);
    expect(store.lastSyncedAt()).not.toBeNull();
    expect(realtime.start).toHaveBeenCalledWith(userOne.id, expect.any(Object));
  });

  it('distingue falha temporária de realtime de falha do snapshot e preserva os dados carregados', async () => {
    expenses = [expense('expense12345678')];
    realtime.start.mockRejectedValueOnce(new Error('SSE indisponível'));

    await store.loadAuthenticatedUser();

    expect(store.dataReady()).toBe(true);
    expect(store.expenses()).toHaveLength(1);
    expect(store.error()).toBeNull();
    expect(store.connectionError()).toBe('SSE indisponível');
  });

  it('reporta a falha inicial de dados separadamente e não publica um snapshot parcial', async () => {
    expenseRepository.getAll.mockRejectedValueOnce(new Error('Snapshot indisponível'));

    await store.loadAuthenticatedUser();

    expect(store.dataReady()).toBe(false);
    expect(store.expenses()).toEqual([]);
    expect(store.error()).toBe('Snapshot indisponível');
  });

  it('enfileira eventos recebidos durante o snapshot e aplica-os depois do snapshot', async () => {
    const pendingExpenses = deferred<Expense[]>();
    expenseRepository.getAll.mockReturnValueOnce(pendingExpenses.promise);
    const oldExpense = expense('expense12345678', 1000);
    const updatedExpense = expense('expense12345678', 2500);

    const loading = store.loadAuthenticatedUser();
    await vi.waitFor(() => expect(expenseRepository.getAll).toHaveBeenCalledOnce());
    realtime.emit({ collection: 'expenses', action: 'update', owner: userOne.id, record: updatedExpense });
    pendingExpenses.resolve([oldExpense]);
    await loading;

    expect(store.expenses()).toEqual([updatedExpense]);
  });

  it('troca de utilizador limpa imediatamente o estado e invalida eventos da sessão anterior', async () => {
    const firstExpense = expense('expense12345678');
    const secondExpense = expense('expense23456789');
    expenses = [firstExpense];
    await store.loadAuthenticatedUser();

    authUser.set(userTwo);
    expenses = [secondExpense];
    await store.loadAuthenticatedUser();
    realtime.emit({ collection: 'expenses', action: 'create', owner: userOne.id, record: firstExpense }, 0);

    expect(store.expenses()).toEqual([secondExpense]);
    expect(realtime.start).toHaveBeenCalledTimes(2);
    expect(realtime.stop).toHaveBeenCalled();
  });

  it('logout para realtime e limpa todos os signals sem apagar dados por desconexão temporária', async () => {
    expenses = [expense('expense12345678')];
    await store.loadAuthenticatedUser();

    realtime.fail('Ligação interrompida.');
    expect(store.expenses()).toHaveLength(1);
    expect(store.connectionError()).toBe('Ligação interrompida.');

    await store.clearUserState();
    expect(store.expenses()).toEqual([]);
    expect(store.categories()).toEqual([]);
    expect(store.dataReady()).toBe(false);
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('aplica create, update, evento duplicado e delete por ID', async () => {
    const firstExpense = expense('expense12345678');
    const secondExpense = expense('expense23456789');
    expenses = [firstExpense];
    await store.loadAuthenticatedUser();

    realtime.emit({ collection: 'expenses', action: 'create', owner: userOne.id, record: secondExpense });
    realtime.emit({ collection: 'expenses', action: 'update', owner: userOne.id, record: { ...secondExpense, amountCents: 3000 } });
    realtime.emit({ collection: 'expenses', action: 'create', owner: userOne.id, record: { ...secondExpense, amountCents: 3000 } });
    realtime.emit({ collection: 'expenses', action: 'delete', owner: userOne.id, record: firstExpense });

    expect(store.expenses()).toEqual([{ ...secondExpense, amountCents: 3000 }]);
  });

  it('CRUD normal faz create, update e delete apenas no signal afetado sem qualquer reload de coleção', async () => {
    await store.loadAuthenticatedUser();
    const created = expense('expense12345678');
    const updated = { ...created, amountCents: 2400 };
    expenseService['create'].mockResolvedValue(created);
    expenseService['update'].mockResolvedValue(updated);
    clearRepositoryCalls();

    await store.saveExpense({ date: created.date, amountCents: created.amountCents, categoryId: created.categoryId });
    expect(store.expenses()).toEqual([created]);

    await store.saveExpense({ date: updated.date, amountCents: updated.amountCents, categoryId: updated.categoryId }, updated.id);
    expect(store.expenses()).toEqual([updated]);

    await store.deleteExpense(updated.id);
    expect(store.expenses()).toEqual([]);

    expect(expenseRepository.getAll).not.toHaveBeenCalled();
    expect(categoryRepository.getAll).not.toHaveBeenCalled();
    expect(incomeRepository.getAll).not.toHaveBeenCalled();
    expect(goalRepository.getAll).not.toHaveBeenCalled();
    expect(goalRepository.getTransactions).not.toHaveBeenCalled();
    expect(budgetRepository.getAll).not.toHaveBeenCalled();
    expect(exceptionRepository.getAll).not.toHaveBeenCalled();
  });

  it('uma exceção recarrega só recurrence_exceptions', async () => {
    await store.loadAuthenticatedUser();
    exceptions = [{
      id: 'except123456789',
      seriesType: 'expense',
      seriesId: 'expense12345678',
      occurrenceDate: '2026-10-25',
      action: 'skip',
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
    clearRepositoryCalls();

    await store.skipExpenseOccurrence('expense12345678', '2026-10-25');

    expect(exceptionRepository.getAll).toHaveBeenCalledOnce();
    expect(store.recurrenceExceptions()).toEqual(exceptions);
    expect(expenseRepository.getAll).not.toHaveBeenCalled();
    expect(goalRepository.getAll).not.toHaveBeenCalled();
  });

  it('movimentos de poupança recarregam no máximo goals e atualizam transactions incrementalmente', async () => {
    goals = [goal(0)];
    await store.loadAuthenticatedUser();
    const created = transaction();
    savingsService['createTransaction'].mockResolvedValue(created);
    goals = [goal(1000)];
    clearRepositoryCalls();

    await store.saveSavingsTransaction(created.goalId, {
      type: created.type,
      amountCents: created.amountCents,
      effectiveDate: created.effectiveDate,
    });

    expect(store.savingsTransactions()).toEqual([created]);
    expect(store.savingsGoals()[0].currentAmountCents).toBe(1000);
    expect(goalRepository.getAll).toHaveBeenCalledOnce();
    expect(goalRepository.getTransactions).not.toHaveBeenCalled();
    expect(expenseRepository.getAll).not.toHaveBeenCalled();
    expect(categoryRepository.getAll).not.toHaveBeenCalled();
    expect(incomeRepository.getAll).not.toHaveBeenCalled();
    expect(budgetRepository.getAll).not.toHaveBeenCalled();
    expect(exceptionRepository.getAll).not.toHaveBeenCalled();
  });

  it('recarrega um snapshot completo após importação e clear-all sem reiniciar realtime', async () => {
    await store.loadAuthenticatedUser();
    const starts = realtime.start.mock.calls.length;
    expenses = [expense('expense12345678', 3200)];

    await store.importBackup({} as never);

    expect(backupService.importValidated).toHaveBeenCalledOnce();
    expect(store.expenses()).toEqual(expenses);
    expect(store.dataReady()).toBe(true);
    expect(store.lastSyncedAt()).not.toBeNull();
    expect(realtime.start).toHaveBeenCalledTimes(starts);

    expenses = [];
    settings = { ...DEFAULT_SETTINGS };
    await store.clearAll();

    expect(backupService.clearAll).toHaveBeenCalledOnce();
    expect(store.expenses()).toEqual([]);
    expect(store.settings().onboardingCompleted).toBe(false);
    expect(realtime.start).toHaveBeenCalledTimes(starts);
  });

  function clearRepositoryCalls(): void {
    expenseRepository.getAll.mockClear();
    categoryRepository.getAll.mockClear();
    incomeRepository.getAll.mockClear();
    goalRepository.getAll.mockClear();
    goalRepository.getTransactions.mockClear();
    budgetRepository.getAll.mockClear();
    exceptionRepository.getAll.mockClear();
  }
});
