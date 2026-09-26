import { Injectable, inject } from '@angular/core';
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
import { OndeVaiDatabase } from '../database/ondevai.database';
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

function signedAmount(transaction: SavingsTransaction): number {
  return transaction.type === 'withdrawal' ? -transaction.amountCents : transaction.amountCents;
}

@Injectable({ providedIn: 'root' })
export class DexieExpenseRepository implements ExpenseRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<Expense[]> { return this.database.expenses.orderBy('date').reverse().toArray(); }
  getById(id: string): Promise<Expense | undefined> { return this.database.expenses.get(id); }
  async put(expense: Expense): Promise<void> { await this.database.expenses.put(expense); }
  async delete(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.expenses, this.database.recurrenceExceptions], async () => {
      await this.database.expenses.delete(id);
      await this.database.recurrenceExceptions.where('seriesId').equals(id).and((item) => item.seriesType === 'expense').delete();
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DexieCategoryRepository implements CategoryRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<Category[]> { return this.database.categories.orderBy('order').toArray(); }
  getById(id: string): Promise<Category | undefined> { return this.database.categories.get(id); }
  async put(category: Category): Promise<void> { await this.database.categories.put(category); }
  async bulkPut(categories: Category[]): Promise<void> { await this.database.categories.bulkPut(categories); }
}

@Injectable({ providedIn: 'root' })
export class DexieIncomeRepository implements IncomeRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<MonthlyIncome[]> { return this.database.monthlyIncomes.orderBy('date').reverse().toArray(); }
  getById(id: string): Promise<MonthlyIncome | undefined> { return this.database.monthlyIncomes.get(id); }
  async put(income: MonthlyIncome): Promise<void> { await this.database.monthlyIncomes.put(income); }
  async delete(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.monthlyIncomes, this.database.recurrenceExceptions], async () => {
      await this.database.monthlyIncomes.delete(id);
      await this.database.recurrenceExceptions.where('seriesId').equals(id).and((item) => item.seriesType === 'income').delete();
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DexieSavingsGoalRepository implements SavingsGoalRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<SavingsGoal[]> { return this.database.savingsGoals.orderBy('createdAt').toArray(); }
  getById(id: string): Promise<SavingsGoal | undefined> { return this.database.savingsGoals.get(id); }
  getTransactions(): Promise<SavingsTransaction[]> {
    return this.database.savingsTransactions.orderBy('effectiveDate').reverse().toArray();
  }

  async createGoal(goal: SavingsGoal, opening?: SavingsTransaction): Promise<SavingsGoal> {
    const openingAmount = opening ? signedAmount(opening) : 0;
    if (goal.currentAmountCents !== openingAmount || openingAmount < 0) throw new Error('O saldo inicial não é consistente.');
    await this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      await this.database.savingsGoals.add(goal);
      if (opening) await this.database.savingsTransactions.add(opening);
    });
    return goal;
  }

  async updateGoal(goal: SavingsGoal, adjustment?: SavingsTransaction): Promise<SavingsGoal> {
    await this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      const current = await this.database.savingsGoals.get(goal.id);
      if (!current) throw new Error('O objetivo já não existe.');
      const expected = current.currentAmountCents + (adjustment ? signedAmount(adjustment) : 0);
      if (expected < 0 || goal.currentAmountCents !== expected) throw new Error('O saldo do objetivo não é consistente com o movimento.');
      await this.database.savingsGoals.put(goal);
      if (adjustment) await this.database.savingsTransactions.add(adjustment);
    });
    return goal;
  }

  async addTransaction(transaction: SavingsTransaction): Promise<SavingsGoal> {
    return this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      const goal = await this.database.savingsGoals.get(transaction.goalId);
      if (!goal) throw new Error('O objetivo já não existe.');
      const nextAmount = goal.currentAmountCents + signedAmount(transaction);
      if (nextAmount < 0) throw new Error('Não pode retirar mais do que o valor atualmente poupado.');
      const updated = { ...goal, currentAmountCents: nextAmount, updatedAt: transaction.updatedAt };
      await this.database.savingsTransactions.add(transaction);
      await this.database.savingsGoals.put(updated);
      return updated;
    });
  }

  async updateTransaction(transaction: SavingsTransaction): Promise<SavingsGoal> {
    return this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      const previous = await this.database.savingsTransactions.get(transaction.id);
      if (!previous) throw new Error('O movimento já não existe.');
      if (previous.goalId !== transaction.goalId) throw new Error('Não é possível mover um movimento entre objetivos.');
      const goal = await this.database.savingsGoals.get(transaction.goalId);
      if (!goal) throw new Error('O objetivo já não existe.');
      const nextAmount = goal.currentAmountCents - signedAmount(previous) + signedAmount(transaction);
      if (nextAmount < 0) throw new Error('Esta alteração deixaria o objetivo com saldo negativo.');
      const updated = { ...goal, currentAmountCents: nextAmount, updatedAt: transaction.updatedAt };
      await this.database.savingsTransactions.put(transaction);
      await this.database.savingsGoals.put(updated);
      return updated;
    });
  }

  async deleteTransaction(id: string): Promise<SavingsGoal> {
    return this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      const transaction = await this.database.savingsTransactions.get(id);
      if (!transaction) throw new Error('O movimento já não existe.');
      const goal = await this.database.savingsGoals.get(transaction.goalId);
      if (!goal) throw new Error('O objetivo já não existe.');
      const nextAmount = goal.currentAmountCents - signedAmount(transaction);
      if (nextAmount < 0) throw new Error('Este movimento é necessário para manter o saldo atual.');
      const updated = { ...goal, currentAmountCents: nextAmount, updatedAt: new Date().toISOString() };
      await this.database.savingsTransactions.delete(id);
      await this.database.savingsGoals.put(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await this.database.transaction('rw', [this.database.savingsGoals, this.database.savingsTransactions], async () => {
      await this.database.savingsTransactions.where('goalId').equals(id).delete();
      await this.database.savingsGoals.delete(id);
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DexieBudgetRepository implements BudgetRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<MonthlyBudget[]> { return this.database.monthlyBudgets.orderBy('month').reverse().toArray(); }
  getById(id: string): Promise<MonthlyBudget | undefined> { return this.database.monthlyBudgets.get(id); }
  getByMonth(month: string): Promise<MonthlyBudget[]> { return this.database.monthlyBudgets.where('month').equals(month).toArray(); }
  async put(budget: MonthlyBudget): Promise<void> { await this.database.monthlyBudgets.put(budget); }
  async bulkPut(budgets: MonthlyBudget[]): Promise<void> { await this.database.monthlyBudgets.bulkPut(budgets); }
  async delete(id: string): Promise<void> { await this.database.monthlyBudgets.delete(id); }
}

@Injectable({ providedIn: 'root' })
export class DexieRecurrenceExceptionRepository implements RecurrenceExceptionRepository {
  private readonly database = inject(OndeVaiDatabase);
  getAll(): Promise<RecurrenceException[]> { return this.database.recurrenceExceptions.toArray(); }
  async put(exception: RecurrenceException): Promise<void> { await this.database.recurrenceExceptions.put(exception); }
  async delete(id: string): Promise<void> { await this.database.recurrenceExceptions.delete(id); }
}

@Injectable({ providedIn: 'root' })
export class DexieSettingsRepository implements SettingsRepository {
  private readonly database = inject(OndeVaiDatabase);
  async get(): Promise<Settings | undefined> {
    const row = await this.database.settings.get('app');
    if (!row) return undefined;
    return {
      currency: row.currency,
      locale: row.locale,
      onboardingCompleted: row.onboardingCompleted,
      changesSinceExport: row.changesSinceExport,
      ...(row.lastExportAt ? { lastExportAt: row.lastExportAt } : {}),
    };
  }
  async put(settings: Settings): Promise<void> { await this.database.settings.put({ id: 'app', ...settings }); }
}

@Injectable({ providedIn: 'root' })
export class DexieDataRepository implements DataRepository {
  private readonly database = inject(OndeVaiDatabase);
  private get dataTables() {
    return [
      this.database.expenses,
      this.database.categories,
      this.database.monthlyIncomes,
      this.database.savingsGoals,
      this.database.savingsTransactions,
      this.database.monthlyBudgets,
      this.database.recurrenceExceptions,
      this.database.settings,
      this.database.metadata,
    ] as const;
  }

  async replaceAll(backup: AppBackup): Promise<void> {
    await this.database.transaction('rw', [...this.dataTables], async () => {
      await Promise.all(this.dataTables.map((table) => table.clear()));
      await this.database.categories.bulkAdd(backup.categories);
      await this.database.expenses.bulkAdd(backup.expenses);
      await this.database.monthlyIncomes.bulkAdd(backup.monthlyIncomes);
      await this.database.savingsGoals.bulkAdd(backup.savingsGoals);
      await this.database.savingsTransactions.bulkAdd(backup.savingsTransactions);
      await this.database.monthlyBudgets.bulkAdd(backup.monthlyBudgets);
      await this.database.recurrenceExceptions.bulkAdd(backup.recurrenceExceptions);
      await this.database.settings.add({ id: 'app', ...backup.settings });
      await this.database.metadata.add({ key: 'lastImportAt', value: new Date().toISOString() });
    });
  }

  async clearAll(): Promise<void> {
    await this.database.transaction('rw', [...this.dataTables], async () => {
      await Promise.all(this.dataTables.map((table) => table.clear()));
    });
  }
}
