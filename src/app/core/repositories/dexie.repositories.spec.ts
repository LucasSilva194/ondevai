import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBackup, Expense } from '../../models/domain.models';
import { OndeVaiDatabase } from '../database/ondevai.database';
import { DexieDataRepository } from './dexie.repositories';

const backup: AppBackup = {
  schemaVersion: 1,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, lastExportAt: '2026-09-17T10:00:00.000Z', changesSinceExport: 0 },
  categories: [{ id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [] }],
  expenses: [{ id: 'expense', date: '2026-09-17', amountCents: 1234, categoryId: 'food', description: 'Compras', createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-17T09:00:00.000Z' }],
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
    const settings = await database.settings.get('app');
    expect(settings).toEqual({ id: 'app', ...backup.settings });
  });

  it('reverte toda a importação quando uma escrita falha', async () => {
    const originalExpense: Expense = {
      id: 'original', date: '2026-01-01', amountCents: 500, categoryId: 'old',
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
});
