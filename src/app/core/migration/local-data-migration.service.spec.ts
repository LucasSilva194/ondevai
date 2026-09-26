import { Injector, runInInjectionContext } from '@angular/core';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OndeVaiDatabase } from '../database/ondevai.database';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import {
  LocalDataMigrationService,
  LocalDataValidationError,
  LocalMigrationEndpointUnavailableError,
  MigrationUploadResponse,
} from './local-data-migration.service';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

const successfulResponse: MigrationUploadResponse = {
  status: 'imported',
  counts: {
    categories: 1,
    expenses: 2,
    monthlyIncomes: 1,
    savingsGoals: 1,
    savingsTransactions: 1,
    monthlyBudgets: 1,
    recurrenceExceptions: 1,
  },
};

describe('LocalDataMigrationService', () => {
  let database: OndeVaiDatabase;
  let service: LocalDataMigrationService;
  let send: ReturnType<typeof vi.fn>;
  let authUserId: string;

  beforeEach(async () => {
    await Dexie.delete('ondevai');
    authUserId = 'user-a';
    send = vi.fn();
    const pocketBaseClient = {
      client: {
        authStore: {
          get isValid(): boolean { return true; },
          get record(): { id: string } { return { id: authUserId }; },
        },
        send,
      },
    } as unknown as PocketBaseClientService;
    database = new OndeVaiDatabase();
    const injector = Injector.create({
      providers: [
        { provide: OndeVaiDatabase, useValue: database },
        { provide: PocketBaseClientService, useValue: pocketBaseClient },
      ],
    });
    service = runInInjectionContext(injector, () => new LocalDataMigrationService());
    await database.open();
  });

  afterEach(async () => {
    database?.close();
    await Dexie.delete('ondevai');
  });

  it('não considera IndexedDB vazio nem settings isolados como dados para migrar', async () => {
    expect((await service.detectLocalData()).totalRecords).toBe(0);
    expect(service.status()).toBe('none');

    await database.settings.put({ id: 'app', currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 4 });

    expect((await service.detectLocalData()).totalRecords).toBe(0);
    expect(service.status()).toBe('none');
  });

  it('deteta dados significativos e apresenta contagens e intervalo de datas', async () => {
    await seedFullDatabase(database);

    const summary = await service.detectLocalData();

    expect(service.status()).toBe('available');
    expect(summary.counts).toEqual(successfulResponse.counts);
    expect(summary.totalRecords).toBe(8);
    expect(summary.firstDate).toBe('2026-01-01');
    expect(summary.lastDate).toBe('2026-09-20');
  });

  it('cria um snapshot schema 4 completo, validado e deterministicamente ordenado', async () => {
    await seedFullDatabase(database);

    const snapshot = await service.createLocalSnapshot();

    expect(snapshot.schemaVersion).toBe(4);
    expect(snapshot.settings).toEqual({ currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 3 });
    expect(snapshot.expenses.map((item) => item.id)).toEqual(['expense-a', 'expense-b']);
    expect(snapshot.categories.map((item) => item.id)).toEqual(['category']);
    expect(snapshot.savingsTransactions[0].goalId).toBe('goal');
    expect(snapshot.monthlyBudgets[0].categoryId).toBe('category');
    expect(snapshot.recurrenceExceptions[0].seriesId).toBe('expense-a');
    expect(service.validateLocalSnapshot(snapshot).valid).toBe(true);
    expect(service.status()).toBe('ready');
  });

  it('mantém a ordenação independentemente da ordem física dos records', async () => {
    await seedFullDatabase(database);
    const first = await service.createLocalSnapshot();
    await database.expenses.clear();
    await database.expenses.bulkAdd([...first.expenses].reverse());

    const second = await service.createLocalSnapshot();

    expect(second.expenses).toEqual(first.expenses);
  });

  it('rejeita campos de backup inválidos e relações inexistentes', async () => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const invalidAmount = structuredClone(snapshot);
    invalidAmount.expenses[0].amountCents = 0;
    const invalidRelation = structuredClone(snapshot);
    invalidRelation.expenses[0].categoryId = 'missing-category';

    expect(service.validateLocalSnapshot(invalidAmount)).toMatchObject({ valid: false });
    const relationResult = service.validateLocalSnapshot(invalidRelation);
    expect(relationResult.valid).toBe(false);
    if (!relationResult.valid) expect(relationResult.errors.join(' ')).toContain('categoria inexistente');
    await expect(service.createMigrationAttempt('user-a', invalidRelation)).rejects.toBeInstanceOf(LocalDataValidationError);
  });

  it('normaliza exportedAt no hash e reutiliza a idempotencyKey para o mesmo utilizador e dados', async () => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const first = await service.createMigrationAttempt('user-a', snapshot);
    const withAnotherExportDate = { ...snapshot, exportedAt: '2030-01-01T00:00:00.000Z' };

    const second = await service.createMigrationAttempt('user-a', withAnotherExportDate);

    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('gera uma tentativa nova quando os dados ou o utilizador mudam', async () => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const first = await service.createMigrationAttempt('user-a', snapshot);
    const changed = structuredClone(snapshot);
    changed.expenses[0].amountCents += 1;

    const changedDataAttempt = await service.createMigrationAttempt('user-a', changed);
    const changedUserAttempt = await service.createMigrationAttempt('user-b', changed);

    expect(changedDataAttempt.snapshotHash).not.toBe(first.snapshotHash);
    expect(changedDataAttempt.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(changedUserAttempt.snapshotHash).toBe(changedDataAttempt.snapshotHash);
    expect(changedUserAttempt.idempotencyKey).not.toBe(changedDataAttempt.idempotencyKey);
  });

  it.each([404, 501] as const)('trata HTTP %i como endpoint pendente sem concluir nem apagar dados', async (status) => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const attempt = await service.createMigrationAttempt('user-a', snapshot);
    send.mockRejectedValueOnce({ status });

    await expect(service.uploadMigration(snapshot, attempt)).rejects.toBeInstanceOf(LocalMigrationEndpointUnavailableError);

    expect(service.status()).toBe('failed');
    expect(service.state().failureKind).toBe('endpoint-unavailable');
    expect(await database.expenses.count()).toBe(2);
    const metadata = await database.metadata.get('pocketbase-local-data-migration:v1');
    expect(metadata?.value).not.toHaveProperty('completedAt');
  });

  it('expõe falhas de rede como recuperáveis e mantém todos os dados locais', async () => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const attempt = await service.createMigrationAttempt('user-a', snapshot);
    send.mockRejectedValueOnce({ status: 0 });

    await expect(service.uploadMigration(snapshot, attempt)).rejects.toEqual({ status: 0 });

    expect(service.state().failureKind).toBe('network');
    expect(await database.categories.count()).toBe(1);
    expect(await database.savingsGoals.count()).toBe(1);
  });

  it.each(['imported', 'already_imported'] as const)('aceita a resposta %s, guarda apenas metadata e preserva o Dexie', async (status) => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const attempt = await service.createMigrationAttempt('user-a', snapshot);
    send.mockResolvedValueOnce({ ...successfulResponse, status });

    const result = await service.uploadMigration(snapshot, attempt);

    expect(result.status).toBe(status);
    expect(service.status()).toBe('completed');
    expect(send).toHaveBeenCalledWith('/api/ondevai/data/replace-all', {
      method: 'POST',
      body: {
        mode: 'migrate-empty',
        idempotencyKey: attempt.idempotencyKey,
        snapshotHash: attempt.snapshotHash,
        backup: snapshot,
      },
    });
    expect(await database.expenses.count()).toBe(2);
    expect(await database.savingsTransactions.count()).toBe(1);
    const metadata = await database.metadata.get('pocketbase-local-data-migration:v1');
    expect(metadata?.value).toMatchObject({ version: 1, attempt, result: { status } });
    expect(metadata?.value).not.toHaveProperty('backup');
    expect(metadata?.value).not.toHaveProperty('token');
  });

  it('explica o conflito quando migrate-empty encontra dados na conta e preserva o Dexie', async () => {
    await seedFullDatabase(database);
    const snapshot = await service.createLocalSnapshot();
    const attempt = await service.createMigrationAttempt('user-a', snapshot);
    send.mockRejectedValueOnce({ status: 409 });

    await expect(service.uploadMigration(snapshot, attempt)).rejects.toEqual({ status: 409 });

    expect(service.state().failureKind).toBe('account-not-empty');
    expect(service.error()).toContain('nunca substitui dados cloud');
    expect(await database.expenses.count()).toBe(2);
  });

  it.each([1, 2, 3, 4])('lê dados provenientes do schema Dexie v%i após o upgrade normal para v4', async (version) => {
    database.close();
    await Dexie.delete('ondevai');
    await seedLegacyDatabase(version);
    await database.open();

    const snapshot = await service.createLocalSnapshot();

    expect(snapshot.schemaVersion).toBe(4);
    expect(snapshot.categories).toHaveLength(1);
    expect(snapshot.expenses).toHaveLength(1);
    expect(service.validateLocalSnapshot(snapshot).valid).toBe(true);
    if (version >= 2) {
      expect(snapshot.monthlyIncomes).toHaveLength(1);
      expect(snapshot.savingsTransactions).toHaveLength(1);
    }
  });
});

async function seedFullDatabase(database: OndeVaiDatabase): Promise<void> {
  await database.settings.put({ id: 'app', currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 3 });
  await database.categories.add({
    id: 'category', name: 'Casa', color: '#123456', order: 0, archived: false,
    subcategories: [{ id: 'subcategory', name: 'Renda', archived: false }],
  });
  await database.expenses.bulkAdd([
    {
      id: 'expense-b', date: '2026-09-20', amountCents: 2000, categoryId: 'category',
      createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    },
    {
      id: 'expense-a', date: '2026-01-01', amountCents: 1000, categoryId: 'category', subcategoryId: 'subcategory',
      recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-01-01', status: 'active' },
      createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ]);
  await database.monthlyIncomes.add({
    id: 'income', name: 'Salário', kind: 'salary', amountCents: 200000, date: '2026-09-01',
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  });
  await database.savingsGoals.add({
    id: 'goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 100000, currentAmountCents: 5000,
    monthlyContributionCents: 1000, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  });
  await database.savingsTransactions.add({
    id: 'opening', goalId: 'goal', type: 'opening', amountCents: 5000, effectiveDate: '2026-09-01',
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  });
  await database.monthlyBudgets.add({
    id: 'budget', month: '2026-09', categoryId: 'category', amountCents: 50000,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  });
  await database.recurrenceExceptions.add({
    id: 'exception', seriesType: 'expense', seriesId: 'expense-a', occurrenceDate: '2026-08-01', action: 'skip',
    createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z',
  });
}

async function seedLegacyDatabase(version: number): Promise<void> {
  const schemas: Record<number, Record<string, string>> = {
    1: {
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt', categories: 'id,order,archived', settings: 'id', metadata: 'key',
    },
    2: {
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt', categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,active,createdAt,updatedAt', savingsGoals: 'id,kind,targetDate,createdAt,updatedAt', settings: 'id', metadata: 'key',
    },
    3: {
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt', categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,receivedMonth,createdAt,updatedAt', savingsGoals: 'id,kind,targetDate,createdAt,updatedAt', settings: 'id', metadata: 'key',
    },
    4: {
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt', categories: 'id,order,archived',
      monthlyIncomes: 'id,kind,date,createdAt,updatedAt', savingsGoals: 'id,kind,targetDate,createdAt,updatedAt',
      savingsTransactions: 'id,goalId,type,effectiveDate,[goalId+effectiveDate]', monthlyBudgets: 'id,&[month+categoryId],month,categoryId,createdAt,updatedAt',
      recurrenceExceptions: 'id,&[seriesType+seriesId+occurrenceDate],seriesType,seriesId,occurrenceDate,updatedAt', settings: 'id', metadata: 'key',
    },
  };
  const legacy = new Dexie('ondevai');
  legacy.version(version).stores(schemas[version]);
  await legacy.open();
  await legacy.table('categories').add({ id: 'legacy-category', name: 'Antiga', color: '#123456', order: 0, archived: false, subcategories: [] });
  await legacy.table('expenses').add({
    id: 'legacy-expense', date: '2026-08-31', amountCents: 4500, categoryId: 'legacy-category', fixed: version < 4,
    createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z',
  });
  await legacy.table('settings').add({ id: 'app', currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 });
  if (version >= 2) {
    await legacy.table('monthlyIncomes').add({
      id: 'legacy-income', name: 'Salário', kind: 'salary', amountCents: 180000,
      ...(version === 2 ? {} : { receivedMonth: '2026-08' }),
      ...(version === 4 ? { date: '2026-08-01' } : { fixed: true, active: true }),
      createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    });
    await legacy.table('savingsGoals').add({
      id: 'legacy-goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 500000, currentAmountCents: 12345,
      monthlyContributionCents: 5000, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
    });
    if (version === 4) {
      await legacy.table('savingsTransactions').add({
        id: 'legacy-opening', goalId: 'legacy-goal', type: 'opening', amountCents: 12345, effectiveDate: '2026-08-01',
        createdAt: '2026-08-01T09:00:00.000Z', updatedAt: '2026-08-01T09:00:00.000Z',
      });
    }
  }
  legacy.close();
}
