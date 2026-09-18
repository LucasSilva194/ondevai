import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBackup, Expense } from '../../models/domain.models';
import { OndeVaiDatabase } from '../database/ondevai.database';
import { DexieDataRepository, DexieSavingsGoalRepository } from './dexie.repositories';

const backup: AppBackup = {
  schemaVersion: 4,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, lastExportAt: '2026-09-17T10:00:00.000Z', changesSinceExport: 0 },
  categories: [{ id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [] }],
  expenses: [{ id: 'expense', date: '2026-09-17', amountCents: 1234, categoryId: 'food', description: 'Compras', createdAt: '2026-09-17T09:00:00.000Z', updatedAt: '2026-09-17T09:00:00.000Z' }],
  monthlyIncomes: [{ id: 'income', name: 'Salário', kind: 'salary', amountCents: 180000, date: '2026-09-01', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-09-01', status: 'active' }, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
  savingsGoals: [{ id: 'goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 600000, currentAmountCents: 100000, monthlyContributionCents: 20000, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
  savingsTransactions: [{ id: 'opening', goalId: 'goal', type: 'opening', amountCents: 100000, effectiveDate: '2026-09-01', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
  monthlyBudgets: [{ id: 'budget', month: '2026-09', categoryId: 'food', amountCents: 30000, createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }],
  recurrenceExceptions: [],
};

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Dexie repositories', () => {
  let database: OndeVaiDatabase;
  let repository: DexieDataRepository;
  let savingsRepository: DexieSavingsGoalRepository;

  beforeEach(async () => {
    await Dexie.delete('ondevai');
    TestBed.configureTestingModule({ providers: [OndeVaiDatabase, DexieDataRepository, DexieSavingsGoalRepository] });
    database = TestBed.inject(OndeVaiDatabase);
    repository = TestBed.inject(DexieDataRepository);
    savingsRepository = TestBed.inject(DexieSavingsGoalRepository);
    await database.open();
  });

  afterEach(async () => { database?.close(); await Dexie.delete('ondevai'); TestBed.resetTestingModule(); });

  it('reimporta todas as coleções sem perda', async () => {
    await repository.replaceAll(structuredClone(backup));
    expect(await database.expenses.toArray()).toEqual(backup.expenses);
    expect(await database.savingsTransactions.toArray()).toEqual(backup.savingsTransactions);
    expect(await database.monthlyBudgets.toArray()).toEqual(backup.monthlyBudgets);
    expect(await database.settings.get('app')).toEqual({ id: 'app', ...backup.settings });
  });

  it('reverte toda a importação quando uma escrita falha', async () => {
    const originalExpense: Expense = { id: 'original', date: '2026-01-01', amountCents: 500, categoryId: 'old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    await database.categories.add({ id: 'old', name: 'Antiga', color: '#68727d', order: 0, archived: false, subcategories: [] });
    await database.expenses.add(originalExpense);
    await database.settings.add({ id: 'app', currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 2 });
    vi.spyOn(database.expenses, 'bulkAdd').mockRejectedValueOnce(new Error('Falha simulada'));
    await expect(repository.replaceAll(structuredClone(backup))).rejects.toThrow('Falha simulada');
    expect(await database.expenses.toArray()).toEqual([originalExpense]);
    expect((await database.categories.toArray()).map((item) => item.id)).toEqual(['old']);
  });

  it('mantém dados depois de fechar e reabrir o IndexedDB', async () => {
    await repository.replaceAll(structuredClone(backup));
    database.close();
    const reopened = new OndeVaiDatabase();
    await reopened.open();
    expect(await reopened.expenses.get('expense')).toEqual(backup.expenses[0]);
    expect(await reopened.monthlyBudgets.get('budget')).toEqual(backup.monthlyBudgets[0]);
    reopened.close();
  });

  it('atualiza ledger e saldo na mesma transação para criar, editar e eliminar movimentos', async () => {
    const goal = structuredClone(backup.savingsGoals[0]);
    goal.currentAmountCents = 0;
    await savingsRepository.createGoal(goal);
    const deposit = { ...backup.savingsTransactions[0], id: 'deposit', type: 'deposit' as const, amountCents: 20000 };
    expect((await savingsRepository.addTransaction(deposit)).currentAmountCents).toBe(20000);
    const edited = { ...deposit, amountCents: 15000, updatedAt: '2026-09-02T09:00:00.000Z' };
    expect((await savingsRepository.updateTransaction(edited)).currentAmountCents).toBe(15000);
    expect((await savingsRepository.deleteTransaction(edited.id)).currentAmountCents).toBe(0);
    expect(await database.savingsTransactions.get(edited.id)).toBeUndefined();
  });

  it('migra fixed e cria movimento de abertura preservando o saldo', async () => {
    database.close();
    await Dexie.delete('ondevai');
    const legacy = new Dexie('ondevai');
    legacy.version(3).stores({ expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt', categories: 'id,order,archived', monthlyIncomes: 'id,kind,receivedMonth,createdAt,updatedAt', savingsGoals: 'id,kind,targetDate,createdAt,updatedAt', settings: 'id', metadata: 'key' });
    await legacy.open();
    await legacy.table('expenses').add({ id: 'legacy-expense', date: '2026-08-31', amountCents: 4500, categoryId: 'food', fixed: true, createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z' });
    await legacy.table('monthlyIncomes').add({ id: 'legacy-income', name: 'Salário', kind: 'salary', amountCents: 180000, receivedMonth: '2026-08', fixed: true, active: true, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' });
    await legacy.table('savingsGoals').add({ id: 'legacy-goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 500000, currentAmountCents: 12345, monthlyContributionCents: 5000, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z' });
    legacy.close();

    const migrated = new OndeVaiDatabase();
    await migrated.open();
    expect(await migrated.expenses.get('legacy-expense')).toMatchObject({ recurrence: { frequency: 'monthly', startDate: '2026-08-31' } });
    expect(await migrated.monthlyIncomes.get('legacy-income')).toMatchObject({ date: '2026-08-01', recurrence: { frequency: 'monthly' } });
    expect(await migrated.savingsTransactions.where('goalId').equals('legacy-goal').first()).toMatchObject({ type: 'opening', amountCents: 12345 });
    expect((await migrated.savingsGoals.get('legacy-goal'))?.currentAmountCents).toBe(12345);
    migrated.close();
  });
});
