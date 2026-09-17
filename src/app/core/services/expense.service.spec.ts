import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Category, Expense, Settings } from '../../models/domain.models';
import { CATEGORY_REPOSITORY, EXPENSE_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { ExpenseService } from './expense.service';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let expenses: Expense[];
  let settings: Settings;
  const category: Category = {
    id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false,
    subcategories: [{ id: 'market', name: 'Supermercado', archived: false }],
  };

  beforeEach(() => {
    expenses = [];
    settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({
      providers: [
        ExpenseService,
        { provide: EXPENSE_REPOSITORY, useValue: {
          getAll: async () => expenses,
          getById: async (id: string) => expenses.find((item) => item.id === id),
          put: async (item: Expense) => { const index = expenses.findIndex((current) => current.id === item.id); if (index >= 0) expenses[index] = item; else expenses.push(item); },
          delete: async (id: string) => { expenses = expenses.filter((item) => item.id !== id); },
        } },
        { provide: CATEGORY_REPOSITORY, useValue: { getById: async (id: string) => id === category.id ? category : undefined } },
        { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
      ],
    });
    service = TestBed.inject(ExpenseService);
  });

  it('cria, edita e elimina despesas, registando cada alteração', async () => {
    const created = await service.create({ date: '2026-09-17', amountCents: 1234, categoryId: 'food', subcategoryId: 'market', description: ' Compras ' });
    expect(expenses).toHaveLength(1);
    expect(created.description).toBe('Compras');
    expect(settings.changesSinceExport).toBe(1);

    const updated = await service.update(created.id, { date: '2026-09-18', amountCents: 2200, categoryId: 'food' });
    expect(updated.amountCents).toBe(2200);
    expect(updated.subcategoryId).toBeUndefined();
    expect(settings.changesSinceExport).toBe(2);

    await service.delete(created.id);
    expect(expenses).toEqual([]);
    expect(settings.changesSinceExport).toBe(3);
  });
});
