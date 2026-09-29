import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { OndeVaiDatabase } from './ondevai.database';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('OndeVaiDatabase migrations', () => {
  it('converts legacy fixed records and creates opening transactions', async () => {
    await Dexie.delete('ondevai');
    const legacy = new Dexie('ondevai');
    legacy.version(3).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,receivedMonth,createdAt,updatedAt',
      savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      settings: 'id',
      metadata: 'key',
    });
    await legacy.open();
    await legacy.table('expenses').add({
      id: 'legacy-expense', date: '2026-08-31', amountCents: 4500, categoryId: 'food', fixed: true,
      createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z',
    });
    await legacy.table('monthlyIncomes').add({
      id: 'legacy-income', name: 'Salário', kind: 'salary', amountCents: 180000, receivedMonth: '2026-08',
      fixed: true, active: true, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    });
    await legacy.table('savingsGoals').add({
      id: 'legacy-goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 500000, currentAmountCents: 12345,
      monthlyContributionCents: 5000, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    });
    legacy.close();

    const migrated = new OndeVaiDatabase();
    try {
      await migrated.open();
      expect(await migrated.expenses.get('legacy-expense')).toMatchObject({
        recurrence: { frequency: 'monthly', startDate: '2026-08-31' },
      });
      expect(await migrated.monthlyIncomes.get('legacy-income')).toMatchObject({
        date: '2026-08-01', recurrence: { frequency: 'monthly' },
      });
      expect(await migrated.savingsTransactions.where('goalId').equals('legacy-goal').first()).toMatchObject({
        type: 'opening', amountCents: 12345,
      });
      expect((await migrated.savingsGoals.get('legacy-goal'))?.currentAmountCents).toBe(12345);
    } finally {
      migrated.close();
      await Dexie.delete('ondevai');
    }
  });
});
