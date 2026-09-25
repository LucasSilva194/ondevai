import { TestBed } from '@angular/core/testing';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Category,
  Expense,
  MonthlyBudget,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import { POCKETBASE_ENDPOINTS, PocketBasePendingEndpointError } from '../pocketbase/pocketbase.endpoints';
import { POCKETBASE_COLLECTIONS, PocketBaseRecordBase, SavingsGoalRecord, SettingsRecord } from '../pocketbase/pocketbase.types';
import {
  PocketBaseBudgetRepository,
  PocketBaseCategoryRepository,
  PocketBaseDataRepository,
  PocketBaseExpenseRepository,
  PocketBaseIncomeRepository,
  PocketBaseRecurrenceExceptionRepository,
  PocketBaseSavingsGoalRepository,
  PocketBaseSettingsRepository,
} from './pocketbase.repositories';

interface CollectionMock {
  getFullList: ReturnType<typeof vi.fn>;
  getOne: ReturnType<typeof vi.fn>;
  getFirstListItem: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const owner = 'u'.repeat(15);
const expenseId = 'e'.repeat(15);
const categoryId = 'c'.repeat(15);
const goalId = 'g'.repeat(15);
const transactionId = 't'.repeat(15);

function collectionMock(): CollectionMock {
  return {
    getFullList: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(true),
  };
}

function notFound(): ClientResponseError {
  return new ClientResponseError({ status: 404, response: {} });
}

function baseRecord(id: string, collectionName: string): PocketBaseRecordBase {
  return {
    id,
    collectionId: collectionName,
    collectionName,
    owner,
    created: '2026-09-25 10:00:00.000Z',
    updated: '2026-09-25 11:00:00.000Z',
  };
}

describe('PocketBase repositories', () => {
  let authStore: { isValid: boolean; record: { id: string } | null };
  let collections: Record<string, CollectionMock>;
  let client: {
    authStore: typeof authStore;
    filter: ReturnType<typeof vi.fn>;
    collection: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authStore = { isValid: true, record: { id: owner } };
    collections = Object.fromEntries(Object.values(POCKETBASE_COLLECTIONS).map((name) => [name, collectionMock()]));
    client = {
      authStore,
      filter: vi.fn((expression: string, values: object) => `${expression}:${JSON.stringify(values)}`),
      collection: vi.fn((name: string) => collections[name]),
      send: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PocketBaseExpenseRepository,
        PocketBaseCategoryRepository,
        PocketBaseIncomeRepository,
        PocketBaseSavingsGoalRepository,
        PocketBaseRecurrenceExceptionRepository,
        PocketBaseBudgetRepository,
        PocketBaseSettingsRepository,
        PocketBaseDataRepository,
        { provide: PocketBaseClientService, useValue: { client: client as unknown as PocketBase } },
      ],
    });
  });

  it('falha claramente antes da rede quando não existe uma sessão autenticada', async () => {
    authStore.isValid = false;
    authStore.record = null;
    const repository = TestBed.inject(PocketBaseExpenseRepository);
    await expect(repository.getAll()).rejects.toMatchObject({
      code: 'authentication',
      message: expect.stringMatching(/iniciar sessão/),
    });
    expect(client.collection).not.toHaveBeenCalled();
  });

  it('faz create num 404 e update quando o ID já existe, associando sempre owner e category', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.expenses];
    const repository = TestBed.inject(PocketBaseExpenseRepository);
    const expense: Expense = {
      id: expenseId,
      date: '2026-09-25',
      amountCents: 1250,
      categoryId,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };

    records.getOne.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({ id: expenseId });
    await repository.put(expense);
    await repository.put({ ...expense, amountCents: 1500 });

    expect(records.create).toHaveBeenCalledWith(expect.objectContaining({ id: expenseId, owner, category: categoryId }));
    expect(records.update).toHaveBeenCalledWith(expenseId, expect.objectContaining({
      owner,
      category: categoryId,
      amountCents: 1500,
      subcategoryId: '',
      description: '',
      recurrence: null,
    }));
  });

  it('não converte erros diferentes de 404 numa tentativa de create', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.expenses];
    records.getOne.mockRejectedValueOnce(new ClientResponseError({ status: 403, response: {} }));
    const expense: Expense = {
      id: expenseId,
      date: '2026-09-25',
      amountCents: 1250,
      categoryId,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    await expect(TestBed.inject(PocketBaseExpenseRepository).put(expense)).rejects.toMatchObject({ code: 'authorization' });
    expect(records.create).not.toHaveBeenCalled();
  });

  it('pede ao servidor a ordenação equivalente aos repositórios Dexie', async () => {
    await TestBed.inject(PocketBaseExpenseRepository).getAll();
    await TestBed.inject(PocketBaseIncomeRepository).getAll();
    await TestBed.inject(PocketBaseCategoryRepository).getAll();
    const goals = TestBed.inject(PocketBaseSavingsGoalRepository);
    await goals.getAll();
    await goals.getTransactions();
    await TestBed.inject(PocketBaseBudgetRepository).getAll();

    expect(collections[POCKETBASE_COLLECTIONS.expenses].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: '-date' }));
    expect(collections[POCKETBASE_COLLECTIONS.incomes].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: '-date' }));
    expect(collections[POCKETBASE_COLLECTIONS.categories].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: 'order' }));
    expect(collections[POCKETBASE_COLLECTIONS.savingsGoals].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: 'created' }));
    expect(collections[POCKETBASE_COLLECTIONS.savingsTransactions].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: '-effectiveDate' }));
    expect(collections[POCKETBASE_COLLECTIONS.budgets].getFullList).toHaveBeenCalledWith(expect.objectContaining({ sort: '-month' }));
  });

  it('usa endpoints atómicos para bulks de categorias e orçamentos', async () => {
    const category: Category = {
      id: categoryId,
      name: 'Casa',
      color: '#112233',
      order: 0,
      archived: false,
      subcategories: [{ id: 'sub-local', name: 'Renda', archived: false }],
    };
    const budget: MonthlyBudget = {
      id: 'b'.repeat(15),
      month: '2026-09',
      categoryId,
      amountCents: 50000,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    client.send
      .mockResolvedValueOnce([{
        ...baseRecord(categoryId, POCKETBASE_COLLECTIONS.categories),
        name: category.name,
        color: category.color,
        icon: '',
        order: 0,
        archived: false,
        subcategories: category.subcategories,
      }])
      .mockResolvedValueOnce([{
        ...baseRecord(budget.id, POCKETBASE_COLLECTIONS.budgets),
        month: budget.month,
        category: categoryId,
        amountCents: budget.amountCents,
      }]);

    await TestBed.inject(PocketBaseCategoryRepository).bulkPut([category]);
    await TestBed.inject(PocketBaseBudgetRepository).bulkPut([budget]);

    expect(client.send).toHaveBeenNthCalledWith(1, POCKETBASE_ENDPOINTS.categories.bulkUpsert, {
      method: 'POST',
      body: { owner, categories: [expect.objectContaining({ id: categoryId, owner, subcategories: category.subcategories })] },
    });
    expect(client.send).toHaveBeenNthCalledWith(2, POCKETBASE_ENDPOINTS.budgets.bulkUpsert, {
      method: 'POST',
      body: { owner, budgets: [expect.objectContaining({ id: budget.id, owner, category: categoryId })] },
    });
    expect(collections[POCKETBASE_COLLECTIONS.categories].create).not.toHaveBeenCalled();
    expect(collections[POCKETBASE_COLLECTIONS.budgets].create).not.toHaveBeenCalled();
  });

  it('elimina séries e respetivas exceções apenas através do endpoint atómico', async () => {
    await TestBed.inject(PocketBaseExpenseRepository).delete(expenseId);
    await TestBed.inject(PocketBaseIncomeRepository).delete('i'.repeat(15));

    expect(client.send).toHaveBeenNthCalledWith(1, POCKETBASE_ENDPOINTS.series.delete, {
      method: 'POST', body: { seriesType: 'expense', seriesId: expenseId },
    });
    expect(client.send).toHaveBeenNthCalledWith(2, POCKETBASE_ENDPOINTS.series.delete, {
      method: 'POST', body: { seriesType: 'income', seriesId: 'i'.repeat(15) },
    });
    expect(collections[POCKETBASE_COLLECTIONS.expenses].delete).not.toHaveBeenCalled();
    expect(collections[POCKETBASE_COLLECTIONS.incomes].delete).not.toHaveBeenCalled();
  });

  it('devolve settings inexistentes e mapeia settings existentes', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.settings];
    const repository = TestBed.inject(PocketBaseSettingsRepository);
    records.getFirstListItem.mockRejectedValueOnce(notFound());
    await expect(repository.get()).resolves.toBeUndefined();

    const settingsRecord: SettingsRecord = {
      ...baseRecord('s'.repeat(15), POCKETBASE_COLLECTIONS.settings),
      currency: 'EUR',
      locale: 'pt-PT',
      onboardingCompleted: true,
      changesSinceExport: 4,
    };
    records.getFirstListItem.mockResolvedValueOnce(settingsRecord);
    await expect(repository.get()).resolves.toMatchObject({ onboardingCompleted: true, changesSinceExport: 4 });
  });

  it('cria ou atualiza o único record de settings do owner', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.settings];
    const repository = TestBed.inject(PocketBaseSettingsRepository);
    const settings: Settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: false, changesSinceExport: 0 };
    records.getFirstListItem.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({ id: 's'.repeat(15) });
    await repository.put(settings);
    await repository.put({ ...settings, onboardingCompleted: true });
    expect(records.create).toHaveBeenCalledWith(expect.objectContaining({ owner, currency: 'EUR' }));
    expect(records.update).toHaveBeenCalledWith('s'.repeat(15), expect.objectContaining({
      owner,
      onboardingCompleted: true,
      lastExportAt: '',
    }));
  });

  it('faz upsert de exceções pela chave semântica e só cria após 404', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.recurrenceExceptions];
    const repository = TestBed.inject(PocketBaseRecurrenceExceptionRepository);
    const exception: RecurrenceException = {
      id: 'x'.repeat(15),
      seriesType: 'expense',
      seriesId: expenseId,
      occurrenceDate: '2026-10-25',
      action: 'skip',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };

    records.getFirstListItem.mockResolvedValueOnce({ id: 'z'.repeat(15) }).mockRejectedValueOnce(notFound());
    await repository.put(exception);
    await repository.put({ ...exception, id: 'y'.repeat(15), action: 'override', changes: { amountCents: 1500 } });

    expect(records.update).toHaveBeenCalledWith('z'.repeat(15), expect.objectContaining({ action: 'skip', changes: null }));
    expect(records.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'y'.repeat(15), action: 'override' }));
    expect(client.filter).toHaveBeenCalledWith(expect.stringContaining('occurrenceDate'), {
      owner,
      seriesType: 'expense',
      seriesId: expenseId,
      occurrenceDate: '2026-10-25',
    });
  });

  it('não transforma falhas de pesquisa de exceções diferentes de 404 em create', async () => {
    const records = collections[POCKETBASE_COLLECTIONS.recurrenceExceptions];
    records.getFirstListItem.mockRejectedValueOnce(new ClientResponseError({ status: 403, response: {} }));
    const exception: RecurrenceException = {
      id: 'x'.repeat(15), seriesType: 'expense', seriesId: expenseId, occurrenceDate: '2026-10-25', action: 'skip',
      createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z',
    };

    await expect(TestBed.inject(PocketBaseRecurrenceExceptionRepository).put(exception)).rejects.toMatchObject({ code: 'authorization' });
    expect(records.create).not.toHaveBeenCalled();
  });

  it('encaminha goal+ledger para os endpoints financeiros futuros sem read-modify-write', async () => {
    const repository = TestBed.inject(PocketBaseSavingsGoalRepository);
    const goal: SavingsGoal = {
      id: goalId,
      name: 'Reserva',
      kind: 'reserve',
      targetAmountCents: 100000,
      currentAmountCents: 10000,
      monthlyContributionCents: 5000,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    const transaction: SavingsTransaction = {
      id: transactionId,
      goalId,
      type: 'deposit',
      amountCents: 1000,
      effectiveDate: '2026-09-25',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    const response: SavingsGoalRecord = {
      ...baseRecord(goalId, POCKETBASE_COLLECTIONS.savingsGoals),
      name: goal.name,
      kind: goal.kind,
      targetAmountCents: goal.targetAmountCents,
      currentAmountCents: 11000,
      monthlyContributionCents: goal.monthlyContributionCents,
    };
    client.send.mockResolvedValue(response);

    await repository.createGoal(goal, { ...transaction, type: 'opening' });
    await repository.updateGoal(goal, transaction);
    await expect(repository.addTransaction(transaction)).resolves.toMatchObject({ id: goalId, currentAmountCents: 11000 });
    await repository.updateTransaction(transaction);
    await repository.deleteTransaction(transactionId);
    await repository.delete(goalId);
    expect(client.send).toHaveBeenCalledWith(POCKETBASE_ENDPOINTS.savings.addTransaction, {
      method: 'POST',
      body: {
        owner,
        transaction: expect.objectContaining({ id: transactionId, owner, goal: goalId, amountCents: 1000 }),
      },
    });
    expect(client.send.mock.calls.map((call) => call[0])).toEqual([
      POCKETBASE_ENDPOINTS.savings.createGoal,
      POCKETBASE_ENDPOINTS.savings.updateGoal,
      POCKETBASE_ENDPOINTS.savings.addTransaction,
      POCKETBASE_ENDPOINTS.savings.updateTransaction,
      POCKETBASE_ENDPOINTS.savings.deleteTransaction,
      POCKETBASE_ENDPOINTS.savings.deleteGoal,
    ]);
    expect(collections[POCKETBASE_COLLECTIONS.savingsGoals].getOne).not.toHaveBeenCalled();
    expect(collections[POCKETBASE_COLLECTIONS.savingsGoals].update).not.toHaveBeenCalled();
  });

  it('recusa replaceAll e clearAll enquanto não houver endpoints transacionais', async () => {
    const repository = TestBed.inject(PocketBaseDataRepository);
    await expect(repository.replaceAll({} as never)).rejects.toBeInstanceOf(PocketBasePendingEndpointError);
    await expect(repository.clearAll()).rejects.toBeInstanceOf(PocketBasePendingEndpointError);
    expect(client.send).not.toHaveBeenCalled();
  });
});
