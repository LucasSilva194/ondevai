import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  Category,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';

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
  savingsTransactions!: Table<SavingsTransaction, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  recurrenceExceptions!: Table<RecurrenceException, string>;
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
      await transaction.table('expenses').toCollection().modify((expense: Record<string, unknown>) => {
        expense['fixed'] ??= false;
      });
      await transaction.table('monthlyIncomes').toCollection().modify((income: Record<string, unknown>) => {
        const createdAt = typeof income['createdAt'] === 'string' ? income['createdAt'] : new Date().toISOString();
        income['receivedMonth'] ??= createdAt.slice(0, 7);
        income['fixed'] ??= true;
      });
    });
    this.version(4).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,date,createdAt,updatedAt',
      savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      savingsTransactions: 'id,goalId,type,effectiveDate,[goalId+effectiveDate]',
      monthlyBudgets: 'id,&[month+categoryId],month,categoryId,createdAt,updatedAt',
      recurrenceExceptions: 'id,&[seriesType+seriesId+occurrenceDate],seriesType,seriesId,occurrenceDate,updatedAt',
      settings: 'id',
      metadata: 'key',
    }).upgrade(async (transaction) => {
      await transaction.table('expenses').toCollection().modify((record: Record<string, unknown>) => {
        const fixed = record['fixed'] === true;
        const date = String(record['date']);
        if (fixed && !record['recurrence']) {
          record['recurrence'] = { frequency: 'monthly', interval: 1, startDate: date, status: 'active' };
        }
        delete record['fixed'];
      });
      await transaction.table('monthlyIncomes').toCollection().modify((record: Record<string, unknown>) => {
        const fixed = record['fixed'] === true;
        const active = record['active'] !== false;
        const receivedMonth = typeof record['receivedMonth'] === 'string'
          ? record['receivedMonth']
          : String(record['createdAt']).slice(0, 7);
        const date = `${receivedMonth}-01`;
        record['date'] = date;
        if (fixed && !record['recurrence']) {
          record['recurrence'] = {
            frequency: 'monthly',
            interval: 1,
            startDate: date,
            status: active ? 'active' : 'paused',
            ...(!active ? { pausedFrom: date } : {}),
          };
        }
        delete record['receivedMonth'];
        delete record['fixed'];
        delete record['active'];
      });

      const goals = await transaction.table<SavingsGoal>('savingsGoals').toArray();
      const openingTransactions: SavingsTransaction[] = goals
        .filter((goal) => goal.currentAmountCents > 0)
        .map((goal) => ({
          id: `opening-${goal.id}`,
          goalId: goal.id,
          type: 'opening',
          amountCents: goal.currentAmountCents,
          effectiveDate: goal.createdAt.slice(0, 10),
          note: 'Saldo migrado para o histórico',
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
        }));
      if (openingTransactions.length > 0) {
        await transaction.table<SavingsTransaction>('savingsTransactions').bulkAdd(openingTransactions);
      }
    });
  }
}
