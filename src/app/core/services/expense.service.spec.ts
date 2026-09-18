import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Category, Expense, RecurrenceException, Settings } from '../../models/domain.models';
import { CATEGORY_REPOSITORY, EXPENSE_REPOSITORY, RECURRENCE_EXCEPTION_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { ExpenseService } from './expense.service';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let expenses: Expense[];
  let exceptions: RecurrenceException[];
  let settings: Settings;
  const category: Category = { id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [{ id: 'market', name: 'Supermercado', archived: false }] };

  beforeEach(() => {
    expenses = []; exceptions = []; settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({ providers: [
      ExpenseService,
      { provide: EXPENSE_REPOSITORY, useValue: { getAll: async () => expenses, getById: async (id: string) => expenses.find((item) => item.id === id), put: async (item: Expense) => { const index = expenses.findIndex((current) => current.id === item.id); if (index >= 0) expenses[index] = item; else expenses.push(item); }, delete: async (id: string) => { expenses = expenses.filter((item) => item.id !== id); } } },
      { provide: CATEGORY_REPOSITORY, useValue: { getById: async (id: string) => id === category.id ? category : undefined } },
      { provide: RECURRENCE_EXCEPTION_REPOSITORY, useValue: { getAll: async () => exceptions, put: async (item: RecurrenceException) => { exceptions = exceptions.filter((current) => current.id !== item.id); exceptions.push(item); }, delete: async () => undefined } },
      { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
    ] });
    service = TestBed.inject(ExpenseService);
  });

  it('cria, edita e elimina despesas com regras de recorrência', async () => {
    const recurrence = { frequency: 'monthly', interval: 1, startDate: '2026-09-17', status: 'active' } as const;
    const created = await service.create({ date: '2026-09-17', amountCents: 1234, categoryId: 'food', subcategoryId: 'market', description: ' Compras ', recurrence });
    expect(created.description).toBe('Compras');
    expect(created.recurrence).toEqual(recurrence);
    const updated = await service.update(created.id, { date: '2026-09-18', amountCents: 2200, categoryId: 'food' });
    expect(updated.recurrence).toBeUndefined();
    await service.delete(created.id);
    expect(expenses).toEqual([]);
    expect(settings.changesSinceExport).toBe(3);
  });

  it('persiste edições e omissões de uma ocorrência com chave estável', async () => {
    const created = await service.create({ date: '2026-01-31', amountCents: 1000, categoryId: 'food', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-01-31', status: 'active' } });
    await service.overrideOccurrence(created.id, '2026-02-28', { amountCents: 1500 });
    expect(exceptions[0]).toMatchObject({ id: `expense:${created.id}:2026-02-28`, action: 'override' });
    await service.skipOccurrence(created.id, '2026-02-28');
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].action).toBe('skip');
  });
});
