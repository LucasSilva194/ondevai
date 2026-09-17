import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Category, Expense, Settings } from '../../models/domain.models';
import { CATEGORY_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let categories: Category[];
  const historicalExpense: Expense = {
    id: 'expense', date: '2026-09-17', amountCents: 1000, categoryId: 'food', fixed: false,
    createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z',
  };
  let settings: Settings;

  beforeEach(() => {
    categories = [{ id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [] }];
    settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({ providers: [
      CategoryService,
      { provide: CATEGORY_REPOSITORY, useValue: {
        getAll: async () => categories,
        getById: async (id: string) => categories.find((item) => item.id === id),
        put: async (item: Category) => { categories = categories.map((current) => current.id === item.id ? item : current); },
        bulkPut: async (items: Category[]) => { categories = items; },
      } },
      { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
    ] });
    service = TestBed.inject(CategoryService);
  });

  it('arquiva a categoria sem quebrar o histórico de despesas', async () => {
    await service.archive('food');
    expect(categories[0].archived).toBe(true);
    expect(historicalExpense.categoryId).toBe(categories[0].id);
    expect(settings.changesSinceExport).toBe(1);
  });
});
