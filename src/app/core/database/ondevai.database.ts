import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Category, Expense, MonthlyIncome, SavingsGoal, Settings } from '../../models/domain.models';

export interface SettingsRecord extends Settings {
  id: 'app';
}

export interface MetadataRecord {
  key: string;
  value: unknown;
}

@Injectable({ providedIn: 'root' })
export class OndeVaiDatabase extends Dexie {
  expenses!: Table<Expense, string>;
  categories!: Table<Category, string>;
  monthlyIncomes!: Table<MonthlyIncome, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  settings!: Table<SettingsRecord, string>;
  metadata!: Table<MetadataRecord, string>;

  constructor() {
    super('ondevai');
    this.version(1).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      settings: 'id',
      metadata: 'key',
    });
    this.version(2).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,active,createdAt,updatedAt',
      savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      settings: 'id',
      metadata: 'key',
    });
    this.version(3).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,receivedMonth,createdAt,updatedAt',
      savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      settings: 'id',
      metadata: 'key',
    }).upgrade(async (transaction) => {
      await transaction.table('expenses').toCollection().modify((expense: Expense) => {
        const legacy = expense as Expense & { fixed?: boolean };
        legacy.fixed ??= false;
      });
      await transaction.table('monthlyIncomes').toCollection().modify((income: MonthlyIncome) => {
        const legacy = income as MonthlyIncome & { receivedMonth?: string; fixed?: boolean };
        legacy.receivedMonth ??= income.createdAt.slice(0, 7);
        legacy.fixed ??= true;
      });
    });
  }
}
