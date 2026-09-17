import { describe, expect, it } from 'vitest';
import { Category, Expense } from '../../models/domain.models';
import {
  annualTotal,
  compareWithPreviousMonth,
  groupByCategory,
  groupBySubcategory,
  monthlySeries,
  monthlyTotal,
} from './statistics.utils';

const category: Category = {
  id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false,
  subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }],
};

const expense = (id: string, date: string, amountCents: number, subcategoryId?: string): Expense => ({
  id, date, amountCents, categoryId: 'food', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...(subcategoryId ? { subcategoryId } : {}),
});

const expenses = [
  expense('one', '2026-01-05', 1000, 'supermarket'),
  expense('two', '2026-01-20', 2500),
  expense('three', '2026-02-01', 4200, 'supermarket'),
];

describe('statistics utilities', () => {
  it('calcula totais mensais e anuais sem floating point', () => {
    expect(monthlyTotal(expenses, 2026, 1)).toBe(3500);
    expect(annualTotal(expenses, 2026)).toBe(7700);
    expect(monthlySeries(expenses, 2026).map((point) => point.amountCents).slice(0, 3)).toEqual([3500, 4200, 0]);
  });

  it('compara com o mês anterior e trata a ausência de base', () => {
    expect(compareWithPreviousMonth(expenses, 2026, 2)).toMatchObject({
      currentCents: 4200, previousCents: 3500, differenceCents: 700, percentage: 20, direction: 'up',
    });
    expect(compareWithPreviousMonth(expenses, 2026, 1).direction).toBe('no-baseline');
  });

  it('agrupa por categoria e subcategoria, incluindo valores sem subcategoria', () => {
    expect(groupByCategory(expenses, [category])).toEqual([{
      id: 'food', name: 'Alimentação', color: '#52796f', amountCents: 7700, count: 3,
    }]);
    expect(groupBySubcategory(expenses, [category])).toEqual([
      { id: 'supermarket', name: 'Supermercado', color: '#52796f', amountCents: 5200, count: 2 },
      { id: 'without-subcategory', name: 'Sem subcategoria', color: '#68727d', amountCents: 2500, count: 1 },
    ]);
  });
});
