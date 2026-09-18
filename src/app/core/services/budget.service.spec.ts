import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Category, MonthlyBudget, Settings } from '../../models/domain.models';
import { BUDGET_REPOSITORY, CATEGORY_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { BudgetService } from './budget.service';

describe('BudgetService', () => {
  let service: BudgetService;
  let budgets: MonthlyBudget[];
  const category: Category = { id: 'food', name: 'Alimentação', color: '#123456', order: 0, archived: false, subcategories: [] };

  beforeEach(() => {
    budgets = [];
    let settings: Settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({ providers: [
      BudgetService,
      { provide: BUDGET_REPOSITORY, useValue: { getAll: async () => budgets, getById: async (id: string) => budgets.find((item) => item.id === id), getByMonth: async (month: string) => budgets.filter((item) => item.month === month), put: async (item: MonthlyBudget) => { budgets = budgets.filter((current) => current.id !== item.id); budgets.push(item); }, bulkPut: async (items: MonthlyBudget[]) => { budgets.push(...items); }, delete: async (id: string) => { budgets = budgets.filter((item) => item.id !== id); } } },
      { provide: CATEGORY_REPOSITORY, useValue: { getById: async (id: string) => id === 'food' ? category : undefined } },
      { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
    ] });
    service = TestBed.inject(BudgetService);
  });

  it('faz CRUD e garante um orçamento por mês e categoria', async () => {
    const created = await service.save({ month: '2026-01', categoryId: 'food', amountCents: 10000 });
    const updated = await service.save({ month: '2026-01', categoryId: 'food', amountCents: 12000 }, created.id);
    expect(updated.amountCents).toBe(12000);
    await expect(service.save({ month: '2026-01', categoryId: 'food', amountCents: 5000 })).rejects.toThrow(/Já existe/);
    await service.delete(created.id);
    expect(budgets).toEqual([]);
  });

  it('copia apenas categorias em falta do mês anterior, incluindo janeiro/dezembro', async () => {
    await service.save({ month: '2025-12', categoryId: 'food', amountCents: 10000 });
    expect(await service.copyPreviousMonth('2026-01')).toBe(1);
    expect(budgets.find((item) => item.month === '2026-01')).toMatchObject({ categoryId: 'food', amountCents: 10000 });
    expect(await service.copyPreviousMonth('2026-01')).toBe(0);
  });
});
