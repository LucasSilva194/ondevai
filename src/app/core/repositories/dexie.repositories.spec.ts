import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBackup, Expense } from '../../models/domain.models';
import { OndeVaiDatabase } from '../database/ondevai.database';
import { DexieDataRepository } from './dexie.repositories';

const backup: AppBackup = {
  schemaVersion: 3,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, lastExportAt: '2026-09-17T10:00:00.000Z', changesSinceExport: 0 },
  categories: [{ id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [] }],
  expenses: [{ id: 'expense', date: '2026-09-17', amountCents: 1234, categoryId: 'food', description: 'Compras', fixed: false, createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-17T09:00:00.000Z' }],
  monthlyIncomes: [{ id: 'income', name: 'Salário', kind: 'salary', amountCents: 180000, receivedMonth: '2026-09', fixed: true, active: true, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
  savingsGoals: [{ id: 'goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 600000, currentAmountCents: 100000, monthlyContributionCents: 20000, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
};

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Dexie repositories', () => {
  let database: OndeVaiDatabase;
  let repository: DexieDataRepository;

  beforeEach(async () => {
    await Dexie.delete('ondevai');
    TestBed.configureTestingModule({ providers: [OndeVaiDatabase, DexieDataRepository] });
    database = TestBed.inject(OndeVaiDatabase);
    repository = TestBed.inject(DexieDataRepository);
    await database.open();
  });

  afterEach(async () => {
    database?.close();
    await Dexie.delete('ondevai');
    TestBed.resetTestingModule();
  });

  it('exporta e reimporta os dados sem perda', async () => {
    await repository.replaceAll(structuredClone(backup));
    expect(await database.categories.toArray()).toEqual(backup.categories);
    expect(await database.expenses.toArray()).toEqual(backup.expenses);
    expect(await database.monthlyIncomes.toArray()).toEqual(backup.monthlyIncomes);
    expect(await database.savingsGoals.toArray()).toEqual(backup.savingsGoals);
    const settings = await database.settings.get('app');
    expect(settings).toEqual({ id: 'app', ...backup.settings });
  });

  it('reverte toda a importação quando uma escrita falha', async () => {
    const originalExpense: Expense = {
      id: 'original', date: '2026-01-01', amountCents: 500, categoryId: 'old', fixed: false,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await database.categories.add({ id: 'old', name: 'Antiga', color: '#68727d', order: 0, archived: false, subcategories: [] });
    await database.expenses.add(originalExpense);
    await database.settings.add({ id: 'app', currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 2 });
    vi.spyOn(database.expenses, 'bulkAdd').mockRejectedValueOnce(new Error('Falha simulada'));

    await expect(repository.replaceAll(structuredClone(backup))).rejects.toThrow('Falha simulada');
    expect(await database.expenses.toArray()).toEqual([originalExpense]);
    expect((await database.categories.toArray()).map((item) => item.id)).toEqual(['old']);
  });

  it('mantém as despesas depois de fechar e reabrir a base de dados', async () => {
    await repository.replaceAll(structuredClone(backup));
    database.close();
    const reopened = new OndeVaiDatabase();
    await reopened.open();
    expect(await reopened.expenses.get('expense')).toEqual(backup.expenses[0]);
    reopened.close();
  });

  it('migra despesas e rendimentos da versão 2 para a configuração de recorrência', async () => {
    database.close();
    await Dexie.delete('ondevai');
    const legacy = new Dexie('ondevai');
    legacy.version(2).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,active,createdAt,updatedAt',
      savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      settings: 'id',
      metadata: 'key',
    });
    await legacy.open();
    await legacy.table('expenses').add({
      id: 'legacy-expense', date: '2026-08-05', amountCents: 4500, categoryId: 'food',
      createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z',
    });
    await legacy.table('monthlyIncomes').add({
      id: 'legacy-income', name: 'Salário', kind: 'salary', amountCents: 180000, active: true,
      createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    });
    legacy.close();

    const migrated = new OndeVaiDatabase();
    await migrated.open();
    expect(await migrated.expenses.get('legacy-expense')).toMatchObject({ fixed: false });
    expect(await migrated.monthlyIncomes.get('legacy-income')).toMatchObject({ fixed: true, receivedMonth: '2026-08' });
    migrated.close();
  });
});
