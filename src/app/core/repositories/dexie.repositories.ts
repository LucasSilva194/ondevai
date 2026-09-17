import { Injectable, inject } from '@angular/core';
import { AppBackup, Category, Expense, MonthlyIncome, SavingsGoal, Settings } from '../../models/domain.models';
import { OndeVaiDatabase, SettingsRecord } from '../database/ondevai.database';
import {
  CategoryRepository,
  DataRepository,
  ExpenseRepository,
  IncomeRepository,
  SavingsGoalRepository,
  SettingsRepository,
} from './repository.tokens';

@Injectable({ providedIn: 'root' })
export class DexieExpenseRepository implements ExpenseRepository {
  private readonly database = inject(OndeVaiDatabase);

  getAll(): Promise<Expense[]> {
    return this.database.expenses.orderBy('date').reverse().toArray();
  }

  getById(id: string): Promise<Expense | undefined> {
    return this.database.expenses.get(id);
  }

  async put(expense: Expense): Promise<void> {
    await this.database.expenses.put(expense);
  }

  async delete(id: string): Promise<void> {
    await this.database.expenses.delete(id);
  }
}

@Injectable({ providedIn: 'root' })
export class DexieCategoryRepository implements CategoryRepository {
  private readonly database = inject(OndeVaiDatabase);

  getAll(): Promise<Category[]> {
    return this.database.categories.orderBy('order').toArray();
  }

  getById(id: string): Promise<Category | undefined> {
    return this.database.categories.get(id);
  }

  async put(category: Category): Promise<void> {
    await this.database.categories.put(category);
  }

  async bulkPut(categories: Category[]): Promise<void> {
    await this.database.categories.bulkPut(categories);
  }
}

@Injectable({ providedIn: 'root' })
export class DexieIncomeRepository implements IncomeRepository {
  private readonly database = inject(OndeVaiDatabase);

  getAll(): Promise<MonthlyIncome[]> {
    return this.database.monthlyIncomes.orderBy('createdAt').toArray();
  }

  getById(id: string): Promise<MonthlyIncome | undefined> {
    return this.database.monthlyIncomes.get(id);
  }

  async put(income: MonthlyIncome): Promise<void> {
    await this.database.monthlyIncomes.put(income);
  }

  async delete(id: string): Promise<void> {
    await this.database.monthlyIncomes.delete(id);
  }
}

@Injectable({ providedIn: 'root' })
export class DexieSavingsGoalRepository implements SavingsGoalRepository {
  private readonly database = inject(OndeVaiDatabase);

  getAll(): Promise<SavingsGoal[]> {
    return this.database.savingsGoals.orderBy('createdAt').toArray();
  }

  getById(id: string): Promise<SavingsGoal | undefined> {
    return this.database.savingsGoals.get(id);
  }

  async put(goal: SavingsGoal): Promise<void> {
    await this.database.savingsGoals.put(goal);
  }

  async delete(id: string): Promise<void> {
    await this.database.savingsGoals.delete(id);
  }
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

  async put(settings: Settings): Promise<void> {
    const row: SettingsRecord = { id: 'app', ...settings };
    await this.database.settings.put(row);
  }
}

@Injectable({ providedIn: 'root' })
export class DexieDataRepository implements DataRepository {
  private readonly database = inject(OndeVaiDatabase);

  async replaceAll(backup: AppBackup): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.expenses,
        this.database.categories,
        this.database.monthlyIncomes,
        this.database.savingsGoals,
        this.database.settings,
        this.database.metadata,
      ],
      async () => {
        await Promise.all([
          this.database.expenses.clear(),
          this.database.categories.clear(),
          this.database.monthlyIncomes.clear(),
          this.database.savingsGoals.clear(),
          this.database.settings.clear(),
          this.database.metadata.clear(),
        ]);
        await this.database.categories.bulkAdd(backup.categories);
        await this.database.expenses.bulkAdd(backup.expenses);
        await this.database.monthlyIncomes.bulkAdd(backup.monthlyIncomes);
        await this.database.savingsGoals.bulkAdd(backup.savingsGoals);
        await this.database.settings.add({ id: 'app', ...backup.settings });
        await this.database.metadata.add({ key: 'lastImportAt', value: new Date().toISOString() });
      },
    );
  }

  async clearAll(): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.expenses,
        this.database.categories,
        this.database.monthlyIncomes,
        this.database.savingsGoals,
        this.database.settings,
        this.database.metadata,
      ],
      async () => {
        await Promise.all([
          this.database.expenses.clear(),
          this.database.categories.clear(),
          this.database.monthlyIncomes.clear(),
          this.database.savingsGoals.clear(),
          this.database.settings.clear(),
          this.database.metadata.clear(),
        ]);
      },
    );
  }
}
