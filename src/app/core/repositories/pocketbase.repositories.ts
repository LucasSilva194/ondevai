import { Injectable, inject } from '@angular/core';
import PocketBase from 'pocketbase';
import {
  AppBackup,
  Category,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';
import { calculateBackupFingerprint, createBackupAttemptKey } from '../backup/backup-fingerprint';
import { validateBackup } from '../backup/backup-validation';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import { POCKETBASE_ENDPOINTS } from '../pocketbase/pocketbase.endpoints';
import { PocketBaseRepositoryError, isPocketBaseNotFound, withPocketBaseErrors } from '../pocketbase/pocketbase.errors';
import { assertPocketBaseId } from '../pocketbase/pocketbase.ids';
import {
  budgetFromRecord,
  budgetToRecordData,
  categoryFromRecord,
  categoryToRecordData,
  expenseFromRecord,
  expenseToRecordData,
  incomeFromRecord,
  incomeToRecordData,
  recurrenceExceptionFromRecord,
  recurrenceExceptionToRecordData,
  savingsGoalFromRecord,
  savingsGoalToRecordData,
  savingsTransactionFromRecord,
  savingsTransactionToRecordData,
  settingsFromRecord,
  settingsToRecordData,
} from '../pocketbase/pocketbase.mappers';
import {
  BudgetRecord,
  CategoryRecord,
  POCKETBASE_COLLECTIONS,
  SavingsGoalRecord,
  SettingsRecord,
} from '../pocketbase/pocketbase.types';
import {
  BudgetRepository,
  CategoryRepository,
  DataRepository,
  ExpenseRepository,
  IncomeRepository,
  RecurrenceExceptionRepository,
  SavingsGoalRepository,
  SettingsRepository,
} from './repository.tokens';

abstract class PocketBaseRepositoryBase {
  protected readonly client: PocketBase = inject(PocketBaseClientService).client;

  protected requireOwner(): string {
    const record = this.client.authStore.record;
    if (!this.client.authStore.isValid || !record?.id) {
      throw new PocketBaseRepositoryError('authentication', 'É necessário iniciar sessão para aceder aos dados.');
    }
    return record.id;
  }

  protected ownerFilter(owner: string): string {
    return this.client.filter('owner = {:owner}', { owner });
  }

  protected async findById<TRecord, TDomain>(
    collection: string,
    id: string,
    mapper: (record: TRecord) => TDomain,
  ): Promise<TDomain | undefined> {
    this.requireOwner();
    return withPocketBaseErrors(async () => {
      try {
        return mapper(await this.client.collection<TRecord>(collection).getOne(id));
      } catch (error: unknown) {
        if (isPocketBaseNotFound(error)) return undefined;
        throw error;
      }
    });
  }

  protected async list<TRecord, TDomain>(
    collection: string,
    sort: string | undefined,
    mapper: (record: TRecord) => TDomain,
    additionalFilter?: string,
  ): Promise<TDomain[]> {
    const owner = this.requireOwner();
    return withPocketBaseErrors(async () => {
      const ownerFilter = this.ownerFilter(owner);
      const filter = additionalFilter ? `${ownerFilter} && ${additionalFilter}` : ownerFilter;
      const records = await this.client.collection<TRecord>(collection).getFullList({ filter, ...(sort ? { sort } : {}) });
      return records.map(mapper);
    });
  }

  protected async upsert<TData extends object>(
    collection: string,
    id: string,
    createData: TData,
    updateData: object = createData,
  ): Promise<void> {
    // Compatibility with the current repository interfaces costs one existence
    // request before every write. A concurrent delete/create can still race; the
    // server remains authoritative and any resulting conflict is surfaced.
    assertPocketBaseId(id);
    return withPocketBaseErrors(async () => {
      let exists = true;
      try {
        await this.client.collection(collection).getOne(id, { fields: 'id' });
      } catch (error: unknown) {
        if (isPocketBaseNotFound(error)) exists = false;
        else throw error;
      }

      if (exists) await this.client.collection(collection).update(id, updateData);
      else await this.client.collection(collection).create({ id, ...createData });
    });
  }

  protected async deleteRecord(collection: string, id: string): Promise<void> {
    this.requireOwner();
    return withPocketBaseErrors(async () => {
      await this.client.collection(collection).delete(id);
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseExpenseRepository extends PocketBaseRepositoryBase implements ExpenseRepository {
  getAll(): Promise<Expense[]> {
    return this.list(POCKETBASE_COLLECTIONS.expenses, '-date', expenseFromRecord);
  }

  getById(id: string): Promise<Expense | undefined> {
    return this.findById(POCKETBASE_COLLECTIONS.expenses, id, expenseFromRecord);
  }

  async put(expense: Expense): Promise<void> {
    const owner = this.requireOwner();
    const data = expenseToRecordData(expense, owner);
    await this.upsert(POCKETBASE_COLLECTIONS.expenses, expense.id, data, {
      ...data,
      subcategoryId: expense.subcategoryId ?? '',
      description: expense.description ?? '',
      recurrence: expense.recurrence ?? null,
    });
  }

  delete(id: string): Promise<void> {
    return this.deleteSeries('expense', id);
  }

  private async deleteSeries(seriesType: 'expense', seriesId: string): Promise<void> {
    this.requireOwner();
    assertPocketBaseId(seriesId);
    await withPocketBaseErrors(async () => {
      await this.client.send<unknown>(POCKETBASE_ENDPOINTS.series.delete, {
        method: 'POST',
        body: { seriesType, seriesId },
      });
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseCategoryRepository extends PocketBaseRepositoryBase implements CategoryRepository {
  getAll(): Promise<Category[]> {
    return this.list(POCKETBASE_COLLECTIONS.categories, 'order', categoryFromRecord);
  }

  getById(id: string): Promise<Category | undefined> {
    return this.findById(POCKETBASE_COLLECTIONS.categories, id, categoryFromRecord);
  }

  async put(category: Category): Promise<void> {
    const owner = this.requireOwner();
    const data = categoryToRecordData(category, owner);
    await this.upsert(POCKETBASE_COLLECTIONS.categories, category.id, data, { ...data, icon: category.icon ?? '' });
  }

  async bulkPut(categories: Category[]): Promise<void> {
    const owner = this.requireOwner();
    for (const category of categories) assertPocketBaseId(category.id);
    await withPocketBaseErrors(async () => {
      const records = await this.client.send<CategoryRecord[]>(POCKETBASE_ENDPOINTS.categories.bulkUpsert, {
        method: 'POST',
        body: {
          owner,
          categories: categories.map((category) => ({
            id: category.id,
            ...categoryToRecordData(category, owner),
            icon: category.icon ?? null,
          })),
        },
      });
      records.map(categoryFromRecord);
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseIncomeRepository extends PocketBaseRepositoryBase implements IncomeRepository {
  getAll(): Promise<MonthlyIncome[]> {
    return this.list(POCKETBASE_COLLECTIONS.incomes, '-date', incomeFromRecord);
  }

  getById(id: string): Promise<MonthlyIncome | undefined> {
    return this.findById(POCKETBASE_COLLECTIONS.incomes, id, incomeFromRecord);
  }

  async put(income: MonthlyIncome): Promise<void> {
    const owner = this.requireOwner();
    const data = incomeToRecordData(income, owner);
    await this.upsert(POCKETBASE_COLLECTIONS.incomes, income.id, data, { ...data, recurrence: income.recurrence ?? null });
  }

  delete(id: string): Promise<void> {
    return this.deleteSeries('income', id);
  }

  private async deleteSeries(seriesType: 'income', seriesId: string): Promise<void> {
    this.requireOwner();
    assertPocketBaseId(seriesId);
    await withPocketBaseErrors(async () => {
      await this.client.send<unknown>(POCKETBASE_ENDPOINTS.series.delete, {
        method: 'POST',
        body: { seriesType, seriesId },
      });
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseSavingsGoalRepository extends PocketBaseRepositoryBase implements SavingsGoalRepository {
  getAll(): Promise<SavingsGoal[]> {
    return this.list(POCKETBASE_COLLECTIONS.savingsGoals, 'created', savingsGoalFromRecord);
  }

  getById(id: string): Promise<SavingsGoal | undefined> {
    return this.findById(POCKETBASE_COLLECTIONS.savingsGoals, id, savingsGoalFromRecord);
  }

  getTransactions(): Promise<SavingsTransaction[]> {
    return this.list(POCKETBASE_COLLECTIONS.savingsTransactions, '-effectiveDate', savingsTransactionFromRecord);
  }

  async createGoal(goal: SavingsGoal, opening?: SavingsTransaction): Promise<SavingsGoal> {
    const owner = this.requireOwner();
    assertPocketBaseId(goal.id);
    if (opening) assertPocketBaseId(opening.id);
    return withPocketBaseErrors(async () => {
      const record = await this.client.send<SavingsGoalRecord>(POCKETBASE_ENDPOINTS.savings.createGoal, {
        method: 'POST',
        body: {
          owner,
          goal: { id: goal.id, ...savingsGoalToRecordData(goal, owner), targetDate: goal.targetDate ?? null },
          ...(opening ? { opening: { id: opening.id, ...savingsTransactionToRecordData(opening, owner) } } : {}),
        },
      });
      return savingsGoalFromRecord(record);
    });
  }

  async updateGoal(goal: SavingsGoal, adjustment?: SavingsTransaction): Promise<SavingsGoal> {
    const owner = this.requireOwner();
    assertPocketBaseId(goal.id);
    if (adjustment) assertPocketBaseId(adjustment.id);
    return withPocketBaseErrors(async () => {
      const record = await this.client.send<SavingsGoalRecord>(POCKETBASE_ENDPOINTS.savings.updateGoal, {
        method: 'POST',
        body: {
          owner,
          goal: { id: goal.id, ...savingsGoalToRecordData(goal, owner), targetDate: goal.targetDate ?? null },
          ...(adjustment ? { adjustment: { id: adjustment.id, ...savingsTransactionToRecordData(adjustment, owner) } } : {}),
        },
      });
      return savingsGoalFromRecord(record);
    });
  }

  addTransaction(transaction: SavingsTransaction): Promise<SavingsGoal> {
    return this.sendTransactionOperation(POCKETBASE_ENDPOINTS.savings.addTransaction, transaction);
  }

  updateTransaction(transaction: SavingsTransaction): Promise<SavingsGoal> {
    return this.sendTransactionOperation(POCKETBASE_ENDPOINTS.savings.updateTransaction, transaction);
  }

  async deleteTransaction(id: string): Promise<SavingsGoal> {
    const owner = this.requireOwner();
    assertPocketBaseId(id);
    return withPocketBaseErrors(async () => {
      const record = await this.client.send<SavingsGoalRecord>(POCKETBASE_ENDPOINTS.savings.deleteTransaction, {
        method: 'POST',
        body: { id, owner },
      });
      return savingsGoalFromRecord(record);
    });
  }

  async delete(id: string): Promise<void> {
    const owner = this.requireOwner();
    assertPocketBaseId(id);
    await withPocketBaseErrors(async () => {
      await this.client.send<unknown>(POCKETBASE_ENDPOINTS.savings.deleteGoal, {
        method: 'POST',
        body: { id, owner },
      });
    });
  }

  private async sendTransactionOperation(endpoint: string, transaction: SavingsTransaction): Promise<SavingsGoal> {
    const owner = this.requireOwner();
    assertPocketBaseId(transaction.id);
    assertPocketBaseId(transaction.goalId);
    return withPocketBaseErrors(async () => {
      const record = await this.client.send<SavingsGoalRecord>(endpoint, {
        method: 'POST',
        body: {
          transaction: {
            id: transaction.id,
            ...savingsTransactionToRecordData(transaction, owner),
            note: transaction.note ?? null,
          },
          owner,
        },
      });
      return savingsGoalFromRecord(record);
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseBudgetRepository extends PocketBaseRepositoryBase implements BudgetRepository {
  getAll(): Promise<MonthlyBudget[]> {
    return this.list(POCKETBASE_COLLECTIONS.budgets, '-month', budgetFromRecord);
  }

  getById(id: string): Promise<MonthlyBudget | undefined> {
    return this.findById(POCKETBASE_COLLECTIONS.budgets, id, budgetFromRecord);
  }

  getByMonth(month: string): Promise<MonthlyBudget[]> {
    const filter = this.client.filter('month = {:month}', { month });
    return this.list(POCKETBASE_COLLECTIONS.budgets, undefined, budgetFromRecord, filter);
  }

  async put(budget: MonthlyBudget): Promise<void> {
    const owner = this.requireOwner();
    await this.upsert(POCKETBASE_COLLECTIONS.budgets, budget.id, budgetToRecordData(budget, owner));
  }

  async bulkPut(budgets: MonthlyBudget[]): Promise<void> {
    const owner = this.requireOwner();
    for (const budget of budgets) assertPocketBaseId(budget.id);
    await withPocketBaseErrors(async () => {
      const records = await this.client.send<BudgetRecord[]>(POCKETBASE_ENDPOINTS.budgets.bulkUpsert, {
        method: 'POST',
        body: {
          owner,
          budgets: budgets.map((budget) => ({
            id: budget.id,
            ...budgetToRecordData(budget, owner),
          })),
        },
      });
      records.map(budgetFromRecord);
    });
  }

  delete(id: string): Promise<void> {
    return this.deleteRecord(POCKETBASE_COLLECTIONS.budgets, id);
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseRecurrenceExceptionRepository extends PocketBaseRepositoryBase implements RecurrenceExceptionRepository {
  getAll(): Promise<RecurrenceException[]> {
    return this.list(POCKETBASE_COLLECTIONS.recurrenceExceptions, undefined, recurrenceExceptionFromRecord);
  }

  async put(exception: RecurrenceException): Promise<void> {
    const owner = this.requireOwner();
    assertPocketBaseId(exception.id);
    await withPocketBaseErrors(async () => {
      const collection = this.client.collection(POCKETBASE_COLLECTIONS.recurrenceExceptions);
      const data = recurrenceExceptionToRecordData(exception, owner);
      const uniqueFilter = this.client.filter(
        'owner = {:owner} && seriesType = {:seriesType} && seriesId = {:seriesId} && occurrenceDate = {:occurrenceDate}',
        {
          owner,
          seriesType: exception.seriesType,
          seriesId: exception.seriesId,
          occurrenceDate: exception.occurrenceDate,
        },
      );

      try {
        const existing = await collection.getFirstListItem(uniqueFilter, { fields: 'id' });
        await collection.update(existing.id, { ...data, changes: exception.changes ?? null });
      } catch (error: unknown) {
        if (!isPocketBaseNotFound(error)) throw error;
        await collection.create({ id: exception.id, ...data });
      }
    });
  }

  delete(id: string): Promise<void> {
    return this.deleteRecord(POCKETBASE_COLLECTIONS.recurrenceExceptions, id);
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseSettingsRepository extends PocketBaseRepositoryBase implements SettingsRepository {
  async get(): Promise<Settings | undefined> {
    const owner = this.requireOwner();
    return withPocketBaseErrors(async () => {
      try {
        const filter = this.ownerFilter(owner);
        const record = await this.client.collection<SettingsRecord>(POCKETBASE_COLLECTIONS.settings).getFirstListItem(filter);
        return settingsFromRecord(record);
      } catch (error: unknown) {
        if (isPocketBaseNotFound(error)) return undefined;
        throw error;
      }
    });
  }

  async put(settings: Settings): Promise<void> {
    const owner = this.requireOwner();
    await withPocketBaseErrors(async () => {
      const collection = this.client.collection<SettingsRecord>(POCKETBASE_COLLECTIONS.settings);
      const data = settingsToRecordData(settings, owner);
      try {
        const existing = await collection.getFirstListItem(this.ownerFilter(owner), { fields: 'id' });
        await collection.update(existing.id, { ...data, lastExportAt: settings.lastExportAt ?? '' });
      } catch (error: unknown) {
        if (!isPocketBaseNotFound(error)) throw error;
        await collection.create(data);
      }
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PocketBaseDataRepository extends PocketBaseRepositoryBase implements DataRepository {
  async replaceAll(backup: AppBackup): Promise<void> {
    this.requireOwner();
    const validation = validateBackup(backup);
    if (!validation.valid) {
      throw new PocketBaseRepositoryError('validation', validation.errors.join(' '));
    }

    const snapshotHash = await calculateBackupFingerprint(validation.backup);
    const idempotencyKey = createBackupAttemptKey();
    await withPocketBaseErrors(async () => {
      const response = await this.client.send<unknown>(POCKETBASE_ENDPOINTS.data.replaceAll, {
        method: 'POST',
        body: {
          mode: 'replace',
          idempotencyKey,
          snapshotHash,
          backup: validation.backup,
        },
      });
      assertImportResponse(response);
    });
  }

  async clearAll(): Promise<void> {
    this.requireOwner();
    await withPocketBaseErrors(async () => {
      await this.client.send<unknown>(POCKETBASE_ENDPOINTS.data.clearAll, {
        method: 'POST',
      });
    });
  }
}

const IMPORT_COUNT_KEYS = [
  'categories',
  'expenses',
  'monthlyIncomes',
  'savingsGoals',
  'savingsTransactions',
  'monthlyBudgets',
  'recurrenceExceptions',
] as const;

function assertImportResponse(value: unknown): void {
  if (!isObject(value)
    || (value['status'] !== 'imported' && value['status'] !== 'already_imported')
    || !isObject(value['counts'])) {
    throw new PocketBaseRepositoryError('remote', 'O servidor devolveu uma resposta de importação inválida.');
  }
  for (const key of IMPORT_COUNT_KEYS) {
    const count = value['counts'][key];
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw new PocketBaseRepositoryError('remote', 'O servidor devolveu contagens de importação inválidas.');
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
